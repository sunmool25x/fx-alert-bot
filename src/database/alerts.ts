import type { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { AppError } from "../utils/errors.js";
import { transition } from "../alerts/evaluate.js";
import { marketKey, type Alert, type AlertSpec, type Delivery, type Evaluation, type Observation, type TriggerPayload } from "../alerts/types.js";

const id = () => randomBytes(9).toString("base64url");
export interface AlertStore {
  create(user: string, spec: AlertSpec, nonce: string, initial: { condition: boolean | null; at: number; status: string } | undefined,
    userLimit: number, totalLimit: number): Promise<Alert>;
  list(user: string): Promise<Alert[]>;
  get(alertId: string, user: string): Promise<Alert | undefined>;
  active(): Promise<Alert[]>;
  delete(alertId: string, user: string): Promise<boolean>;
  record(observation: Observation): Promise<void>;
  nearest(key: string, target: number, tolerance: number, before: number): Promise<Observation | undefined>;
  apply(alertId: string, observation: Observation, evaluation: Evaluation, cooldownMs: number): Promise<string | undefined>;
  error(alertId: string, code: string): Promise<void>;
  claim(ttlMs: number, maxAttempts: number): Promise<Delivery | undefined>;
  deliveryActive(delivery: Delivery): Promise<boolean>;
  sent(delivery: Delivery): Promise<void>;
  retry(delivery: Delivery, code: string, delayMs: number, terminal: boolean): Promise<void>;
  lastDelivery(alertId: string, user: string): Promise<string | undefined>;
  triggerOwned(triggerId:string,alertId:string,user:string):Promise<boolean>;
  prune(before: number, triggerBefore: number): Promise<void>;
}
function observationRow(row: Record<string, unknown> | undefined): Observation | undefined {
  return row ? { ...row, available: row.available === 1 } as unknown as Observation : undefined;
}
export class SqliteAlertStore implements AlertStore {
  constructor(private db: DatabaseSync, private now = Date.now) {}
  async triggerOwned(triggerId:string,alertId:string,user:string) {
    return !!this.db.prepare("SELECT 1 FROM alert_triggers t JOIN alerts a ON a.id=t.alert_id WHERE t.id=? AND a.id=? AND a.telegram_user_id=?").get(triggerId,alertId,user);
  }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  async create(user: string, spec: AlertSpec, nonce: string, initial: { condition: boolean | null; at: number; status: string } | undefined,
    userLimit: number, totalLimit: number): Promise<Alert> {
    return this.transaction(() => {
      const fingerprint = JSON.stringify([marketKey(spec), spec.type, spec.threshold, spec.window_seconds]);
      const existing = this.db.prepare("SELECT * FROM alerts WHERE telegram_user_id=? AND (fingerprint=? OR creation_nonce=?)")
        .get(user, fingerprint, nonce) as unknown as Alert | undefined;
      if (existing) { this.db.prepare("DELETE FROM conversations WHERE user_id=?").run(user); return existing; }
      const count = Number(this.db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE telegram_user_id=?").get(user)!.n);
      const total = Number(this.db.prepare("SELECT COUNT(*) AS n FROM alerts").get()!.n);
      if (count >= userLimit || total >= totalLimit) throw new AppError("ALERT_LIMIT");
      const alertId = id();
      this.db.prepare(`INSERT INTO alerts(id,telegram_user_id,network,from_token,to_token,base,quote,amount,type,
        threshold,window_seconds,created_at,last_condition,evaluation_status,fingerprint,creation_nonce,last_evaluated_at,last_observation_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(alertId, user, spec.network, spec.from_token, spec.to_token,
        spec.base, spec.quote, spec.amount, spec.type, spec.threshold, spec.window_seconds, this.now(),
        initial?.condition == null ? null : initial.condition ? 1 : 0, initial?.status ?? "WAITING_FIRST_SAMPLE", fingerprint, nonce,
        initial ? this.now() : null, initial?.at ?? null);
      // Atomic with alert creation: a repeated confirmation cannot create a second subscription.
      this.db.prepare("DELETE FROM conversations WHERE user_id=?").run(user);
      return this.db.prepare("SELECT * FROM alerts WHERE id=?").get(alertId) as unknown as Alert;
    });
  }
  async list(user: string) { return this.db.prepare("SELECT * FROM alerts WHERE telegram_user_id=? ORDER BY created_at,id").all(user) as unknown as Alert[]; }
  async get(alertId: string, user: string) { return this.db.prepare("SELECT * FROM alerts WHERE id=? AND telegram_user_id=?").get(alertId, user) as unknown as Alert | undefined; }
  async active() { return this.db.prepare("SELECT * FROM alerts WHERE status='active' ORDER BY COALESCE(last_evaluated_at,0),created_at,id").all() as unknown as Alert[]; }
  async delete(alertId: string, user: string) {
    // Cascades cancel outstanding notifications and invalidate their alert buttons.
    return Number(this.db.prepare("DELETE FROM alerts WHERE id=? AND telegram_user_id=?").run(alertId, user).changes) === 1;
  }
  async record(o: Observation) {
    this.db.prepare(`INSERT INTO market_observations(id,market_key,network,from_token,to_token,base,quote,amount,
      observed_at,available,rate,output,gas_usd,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(market_key,observed_at) DO NOTHING`).run(o.id, o.market_key, o.network, o.from_token, o.to_token,
      o.base, o.quote, o.amount, o.observed_at, o.available ? 1 : 0, o.rate, o.output, o.gas_usd, o.expires_at);
  }
  async nearest(key: string, target: number, tolerance: number, before: number) {
    const row = this.db.prepare(`SELECT * FROM market_observations WHERE market_key=? AND available=1 AND rate IS NOT NULL
      AND observed_at BETWEEN ? AND ? AND observed_at<?
      ORDER BY ABS(observed_at-?),observed_at DESC LIMIT 1`).get(key, target - tolerance, target + tolerance, before, target);
    return observationRow(row);
  }
  async apply(alertId: string, observation: Observation, evaluation: Evaluation, cooldownMs: number) {
    return this.transaction(() => {
      const alert = this.db.prepare("SELECT * FROM alerts WHERE id=? AND status='active'").get(alertId) as unknown as Alert | undefined;
      if (!alert || observation.market_key !== marketKey(alert) ||
        (alert.last_observation_at !== null && observation.observed_at <= alert.last_observation_at)) return undefined;
      const now = this.now();
      const edge = transition(alert.last_condition, evaluation.condition, alert.cooldown_until, now);
      this.db.prepare(`UPDATE alerts SET last_evaluated_at=?,last_observation_at=?,last_condition=?,evaluation_status=? WHERE id=?`)
        .run(now, observation.observed_at, edge.next, evaluation.status, alertId);
      if (!edge.trigger) return undefined;
      const triggerId = id(); const sequence = alert.sequence + 1;
      this.db.prepare("UPDATE alerts SET last_triggered_at=?,cooldown_until=?,sequence=? WHERE id=?")
        .run(now, now + cooldownMs, sequence, alertId);
      const payload: TriggerPayload = { alert, observation, evaluation };
      this.db.prepare("INSERT INTO alert_triggers VALUES(?,?,?,?,?,?)")
        .run(triggerId, alertId, sequence, evaluation.reason, now, JSON.stringify(payload));
      this.db.prepare("INSERT INTO delivery_outbox(id,trigger_id,next_attempt_at,created_at) VALUES(?,?,?,?)")
        .run(id(), triggerId, now, now);
      return triggerId;
    });
  }
  async error(alertId: string, code: string) {
    this.db.prepare("UPDATE alerts SET last_evaluated_at=?,evaluation_status=? WHERE id=?")
      .run(this.now(), code, alertId); // Does not erase the last valid condition or rearm.
  }
  async claim(ttlMs: number, maxAttempts: number): Promise<Delivery | undefined> {
    return this.transaction(() => {
      const now = this.now();
      this.db.prepare("UPDATE delivery_outbox SET status='expired',lease_until=0 WHERE status IN ('pending','delivering') AND created_at<=?").run(now - ttlMs);
      this.db.prepare("UPDATE delivery_outbox SET status='failed',lease_until=0 WHERE attempts>=? AND status IN ('pending','delivering') AND lease_until<=?").run(maxAttempts, now);
      const row = this.db.prepare(`SELECT o.*,t.alert_id,t.payload,a.telegram_user_id FROM delivery_outbox o
        JOIN alert_triggers t ON t.id=o.trigger_id JOIN alerts a ON a.id=t.alert_id
        WHERE ((o.status='pending' AND o.next_attempt_at<=?) OR (o.status='delivering' AND o.lease_until<=?))
          AND o.attempts<? ORDER BY o.created_at,o.id LIMIT 1`).get(now, now, maxAttempts);
      if (!row) return undefined;
      const lease = now + 120000;
      this.db.prepare("UPDATE delivery_outbox SET status='delivering',attempts=attempts+1,lease_until=? WHERE id=?").run(lease, row.id!);
      return { ...row, status: "delivering", lease_until: lease, attempts: Number(row.attempts) + 1,
        payload: JSON.parse(String(row.payload)) } as unknown as Delivery;
    });
  }
  async deliveryActive(d: Delivery) {
    return !!this.db.prepare("SELECT id FROM delivery_outbox WHERE id=? AND status='delivering' AND lease_until=? AND attempts=?")
      .get(d.id, d.lease_until, d.attempts);
  }
  async sent(d: Delivery) {
    this.db.prepare("UPDATE delivery_outbox SET status='sent',sent_at=?,lease_until=0,last_error=NULL WHERE id=? AND status='delivering' AND lease_until=? AND attempts=?")
      .run(this.now(), d.id, d.lease_until, d.attempts);
  }
  async retry(d: Delivery, code: string, delayMs: number, terminal: boolean) {
    this.db.prepare("UPDATE delivery_outbox SET status=?,next_attempt_at=?,lease_until=0,last_error=? WHERE id=? AND status='delivering' AND lease_until=? AND attempts=?")
      .run(terminal ? "failed" : "pending", this.now() + delayMs, code, d.id, d.lease_until, d.attempts);
  }
  async lastDelivery(alertId: string, user: string) {
    const row = this.db.prepare(`SELECT o.status FROM delivery_outbox o JOIN alert_triggers t ON t.id=o.trigger_id
      JOIN alerts a ON a.id=t.alert_id WHERE a.id=? AND a.telegram_user_id=? ORDER BY t.sequence DESC LIMIT 1`).get(alertId, user);
    return row ? String(row.status) : undefined;
  }
  async prune(before: number, triggerBefore: number) {
    this.transaction(() => {
      this.db.prepare("DELETE FROM market_observations WHERE observed_at<?").run(before);
      this.db.prepare(`DELETE FROM alert_triggers WHERE triggered_at<? AND id IN
        (SELECT trigger_id FROM delivery_outbox WHERE status IN ('sent','failed','expired'))`).run(triggerBefore);
    });
  }
}
