import type { Config } from "../config/index.js";
import type { Store, User } from "../database/store.js";
import type { MarketData } from "../sera/service.js";
import { AppError } from "../utils/errors.js";
import { t } from "../i18n/messages.js";
import { st } from "../i18n/scanner.js";
import { branding } from "../i18n/branding.js";
import { ScannerService } from "../scanner/service.js";
import { scannerCard, scannerNotes } from "../scanner/views.js";
import { quoteView, utc, type Button } from "./view.js";
import type { AlertController } from "./alerts.js";
import type { Output } from "./controller.js";
import { track } from "../analytics/actions.js";

export class ScannerController {
  private service: ScannerService;
  constructor(private store: Store, private market: MarketData, private config: Config,
    private alerts: AlertController, private now = Date.now) { this.service = new ScannerService(store, config, now); }
  async show(user: User, page: number, out: Output): Promise<void> {
    const m = st(user.language), feed = await this.service.scan();
    if (feed.state === "DISABLED") { await out.reply({ text: m.DISABLED }); return; }
    const pages = Math.max(1, Math.ceil(feed.results.length / 3));
    if (!Number.isSafeInteger(page) || page < 0 || page >= pages) {
      await out.reply({ text: t(user.language).expired, buttons: [[{ text: m.title, data: "s:p:0" }]] }); return;
    }
    const lines = [m.title, `${m.scope}: ${feed.fresh}/${feed.configured} · ${page + 1}/${pages}`], buttons: Button[][] = [];
    for (const [index, result] of feed.results.slice(page * 3, page * 3 + 3).entries()) {
      const number = page * 3 + index + 1;
      lines.push(scannerCard(result, number, user.language));
      // Reuse expiring, user-owned quote intents; never persist the scanner quote/UUID for execution.
      const id = await this.store.saveIntent(user.id, result.spec.from_token, result.spec.to_token, result.probe_amount,"alpha",out.origin??"button");
      const kind = result.primary.signal_type === "RATE_MOVEMENT" ? "m" : result.primary.signal_type === "AVAILABILITY_RECOVERY" ? "r" : "q";
      buttons.push([{ text: `${number}. ${m.quote}`, data: `s:q:${id}` }, { text: `${number}. ${m.alert}`, data: `s:a:${id}:${kind}` }]);
      buttons.push([{ text: `${number}. ${m.markets}`, data: `markets:0:${result.spec.base}` }]);
    }
    lines.push(...scannerNotes(feed, user.language));
    if (feed.results.length) lines.push(m.note, t(user.language).testnet);
    lines.push(branding.marketData);
    const nav: Button[] = [];
    if (page > 0) nav.push({ text: t(user.language).previous, data: `s:p:${page - 1}` });
    if (page + 1 < pages) nav.push({ text: t(user.language).next, data: `s:p:${page + 1}` });
    if (nav.length) buttons.push(nav);
    if (!feed.results.length) buttons.push([{ text: m.allMarkets, data: "markets:0:" }, { text: m.newAlert, data: "s:new" }]);
    await out.reply({ text: lines.join("\n\n"), buttons });
    track(this.store,user,out,"alpha_viewed",{entry:"alpha"});
  }
  async callback(user: User, data: string, out: Output): Promise<void> {
    const m = st(user.language), parts = data.split(":");
    if (this.config.network !== "sepolia" || !this.config.alphaEnabled) { await out.reply({ text: m.DISABLED }); return; }
    if (parts.length === 3 && parts[1] === "p" && /^\d+$/.test(parts[2]!)) { await this.show(user, Number(parts[2]), out); return; }
    if (parts.length === 2 && parts[1] === "new") { await this.alerts.command(user, "alert", {...out,analytics:{...out.analytics,entry:"alpha"}}); return; }
    if ((parts[1] === "q" && parts.length === 3) || (parts[1] === "a" && parts.length === 4 && ["m", "r", "q"].includes(parts[3]!))) {
      const intent = await this.store.intent(parts[2]!, user.id);
      if (!intent) { await out.reply({ text: t(user.language).expired }); return; }
      out={...out,analytics:{...out.analytics,entry:"alpha",parentId:intent.id}};
      if (parts[1] === "a") {
        await this.alerts.prefill(user, intent, parts[3] === "m" ? "RATE_MOVEMENT" : parts[3] === "r" ? "MARKET_RECOVERY" : "QUOTE_AVAILABLE", out); return;
      }
      const tokens = await this.market.tokens();
      const from = tokens.find(t => t.address.toLowerCase() === intent.from_token.toLowerCase());
      const to = tokens.find(t => t.address.toLowerCase() === intent.to_token.toLowerCase());
      if (!from || !to) throw new AppError("UNKNOWN_TOKEN");
      track(this.store,user,out,"fresh_quote_clicked");
      track(this.store,user,out,"quote_requested");
      const card = await this.market.quote(from, to, intent.amount);
      const freshIntent = await this.store.saveIntent(user.id, from.address, to.address, intent.amount,intent.origin,out.origin??"button");
      this.store.analytics.bestEffort(()=>this.store.inputOrigins.quoteParent(freshIntent,intent.id));
      const view = quoteView(card, user.language, freshIntent, "sepolia");
      view.text += `\n\n${m.refreshed}\n${m.refreshedAt}: ${utc(this.now())}`;
      await out.reply(view);track(this.store,user,out,"fresh_quote_viewed",{entityId:freshIntent}); return;
    }
    await out.reply({ text: t(user.language).expired });
  }
}
