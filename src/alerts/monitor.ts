import type { Config } from "../config/index.js";
import type { Store } from "../database/store.js";
import type { MarketData } from "../sera/service.js";
import { errorCode } from "../utils/errors.js";
import { sleep, type Sleep } from "../utils/pacing.js";
import type { View } from "../bot/view.js";
import { evaluate, baselineTolerance } from "./evaluate.js";
import { QuoteObservationSource } from "./source.js";
import { marketKey, type Alert, type AlertSpec } from "./types.js";
import type { ObservationConsumer, ObservationJob } from "../scanner/types.js";
import { notificationView } from "./views.js";
import { alertLog } from "./log.js";

export interface NotificationSender { send(userId: string, view: View): Promise<void> }
export class DeliveryError extends Error {
  constructor(public code: "TELEGRAM_RATE_LIMITED" | "TELEGRAM_BLOCKED" | "TELEGRAM_REJECTED" | "TELEGRAM_TEMPORARY",
    public retryAfterMs = 0, public terminal = false) { super(code); }
}
export class AlertMonitor {
  private activeTick?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private started = false;
  private deliveryBlockedUntil = 0;
  private source: QuoteObservationSource;
  constructor(private store: Store, private market: MarketData, private config: Config,
    private sender: NotificationSender, private now = Date.now, private wait: Sleep = sleep,
    private coverage?: ObservationConsumer) {
    this.source = new QuoteObservationSource(market, now);
  }
  start(): void {
    if (this.started) return;
    this.started = true; this.stopped = false;
    const loop = async () => {
      await this.tick();
      if (!this.stopped) this.timer = setTimeout(() => { void loop(); }, this.config.pollIntervalMs);
    };
    void loop();
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.activeTick;
  }
  tick(): Promise<void> {
    if (this.activeTick) return this.activeTick;
    if (this.stopped || this.config.network !== "sepolia") return Promise.resolve();
    this.activeTick = this.cycle().catch(e => alertLog("monitor_cycle_failed", { code: errorCode(e) }))
      .finally(() => { this.activeTick = undefined; });
    return this.activeTick;
  }
  private async cycle(): Promise<void> {
    // Delivery is independent of Sera health, and is retried after a process restart.
    await this.deliver();
    try { await this.poll(); } catch (e) { alertLog("monitor_poll_failed", { code: errorCode(e) }); }
    if (!this.stopped) await this.deliver();
    this.store.analytics.reconcile();
    try { await this.store.alerts.prune(this.now() - this.config.observationRetentionMs, this.now() - 30 * 86400000); }
    catch (e) { alertLog("monitor_retention_failed", { code: errorCode(e) }); }
  }
  private async poll(): Promise<void> {
    const alerts = await this.store.alerts.active();
    const groups = new Map<string, { spec: AlertSpec; alerts: Alert[]; jobs: ObservationJob[]; checked: number }>();
    for (const alert of alerts) {
      if (alert.network !== "sepolia") continue;
      const key = marketKey(alert), checked = alert.last_evaluated_at ?? 0;
      const group = groups.get(key) ?? { spec: alert, alerts: [], jobs: [], checked };
      group.alerts.push(alert); group.checked = Math.min(group.checked, checked); groups.set(key, group);
    }
    try {
      for (const job of await this.coverage?.jobs() ?? []) {
        const key = marketKey(job.spec), checked = job.last_attempt_at ?? 0;
        const group = groups.get(key) ?? { spec: job.spec, alerts: [], jobs: [], checked };
        group.jobs.push(job); group.checked = Math.min(group.checked, checked); groups.set(key, group);
      }
    } catch (e) { alertLog("scanner_coverage_failed", { code: errorCode(e) }); }
    const failJobs = async (jobs: ObservationJob[], code: string) => {
      for (const job of jobs) {
        try { await this.coverage!.failed(job, code); }
        catch (e) { alertLog("scanner_state_write_failed", { code: errorCode(e) }); }
      }
    };
    if (!groups.size) return;
    let tokens;
    try { tokens = await this.market.tokens(); }
    catch (e) {
      await failJobs([...groups.values()].flatMap(g => g.jobs), errorCode(e)); throw e;
    }
    const started = this.now(); let polled = 0, triggered = 0;
    // All work, including discovery probes, shares the original budget and oldest-first rotation.
    for (const group of [...groups.values()].sort((a, b) => a.checked - b.checked)) {
      if (this.stopped || polled >= this.config.alertMaxGroups || this.now() - started >= 25000) break;
      polled++;
      try {
        const observation = await this.source.sample(group.spec, tokens);
        await this.store.alerts.record(observation);
        for (const job of group.jobs) {
          try { await this.coverage!.observed(job, observation); }
          catch (e) { await failJobs([job], errorCode(e)); }
        }
        for (const alert of group.alerts) {
          if (this.stopped) break;
          try {
            const baseline = alert.type === "RATE_MOVEMENT" ? await this.store.alerts.nearest(observation.market_key,
              observation.observed_at - alert.window_seconds! * 1000,
              baselineTolerance(alert.window_seconds!, this.config.baselineToleranceMs), observation.observed_at) : undefined;
            const result = evaluate(alert, observation, baseline);
            const triggerId = await this.store.alerts.apply(alert.id, observation, result, this.config.cooldownMs);
            if (triggerId) {
              triggered++; alertLog("alert_triggered", { alert_id: alert.id, trigger_id: triggerId, reason: result.reason });
            }
          } catch (e) { alertLog("alert_evaluation_failed", { alert_id: alert.id, code: errorCode(e) }); }
        }
      } catch (e) {
        const code = errorCode(e);
        alertLog("market_observation_failed", { code });
        await failJobs(group.jobs, code);
        for (const alert of group.alerts) {
          try { await this.store.alerts.error(alert.id, code); }
          catch (dbError) { alertLog("alert_state_write_failed", { alert_id: alert.id, code: errorCode(dbError) }); }
        }
        if (["RATE_LIMITED", "UNAVAILABLE", "NETWORK_MISMATCH"].includes(code)) break;
      }
    }
    alertLog("monitor_cycle", { groups: polled, alerts: alerts.length, triggered });
  }
  private async deliver(): Promise<void> {
    if (this.deliveryBlockedUntil > this.now()) return;
    for (let i = 0; i < 10 && !this.stopped; i++) {
      const delivery = await this.store.alerts.claim(this.config.notificationTtlMs, 8);
      if (!delivery) return;
      // Global spacing also spaces messages to a single chat. No burst per alert.
      await this.wait(1100);
      if (this.stopped) {
        await this.store.alerts.retry(delivery, "SHUTDOWN", 0, false); return;
      }
      if (!await this.store.alerts.deliveryActive(delivery)) continue;
      const user = await this.store.user(delivery.telegram_user_id);
      if (!user) continue;
      try {
        await this.sender.send(user.id, notificationView(delivery.payload, user.language,delivery.trigger_id));
      } catch (e) {
        const failure = e instanceof DeliveryError ? e : new DeliveryError("TELEGRAM_TEMPORARY");
        const backoff = Math.min(300000, 5000 * 2 ** (delivery.attempts - 1));
        await this.store.alerts.retry(delivery, failure.code, Math.max(backoff, failure.retryAfterMs), failure.terminal || delivery.attempts >= 8);
        alertLog("alert_delivery_failed", { delivery_id: delivery.id, code: failure.code });
        if (failure.code === "TELEGRAM_RATE_LIMITED") {
          this.deliveryBlockedUntil = this.now() + failure.retryAfterMs; return;
        }
        continue;
      }
      // If this DB write fails after Telegram accepted the message, leave the lease intact.
      // Recovery may deliver it twice: Telegram offers no idempotency key for sendMessage.
      await this.store.alerts.sent(delivery);
      this.store.analytics.reconcile();
      alertLog("alert_delivered", { delivery_id: delivery.id, trigger_id: delivery.trigger_id });
    }
  }
}
