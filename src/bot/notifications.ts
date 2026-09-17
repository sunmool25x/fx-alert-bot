import { Api, GrammyError, InlineKeyboard } from "grammy";
import { DeliveryError, type NotificationSender } from "../alerts/monitor.js";

// A dedicated API instance has no auto-retry transformer. Persisted outbox owns retries.
export function telegramNotifications(api: Api): NotificationSender {
  return { async send(userId, view) {
    const keyboard = new InlineKeyboard();
    for (const row of view.buttons ?? []) {
      for (const button of row) keyboard.text(button.text, button.data);
      keyboard.row();
    }
    try { await api.sendMessage(userId, view.text, { reply_markup: view.buttons ? keyboard : undefined }); }
    catch (e) {
      if (e instanceof GrammyError) {
        if (e.error_code === 429) throw new DeliveryError("TELEGRAM_RATE_LIMITED", Math.max(1, e.parameters.retry_after ?? 60) * 1000);
        if (e.error_code === 403) throw new DeliveryError("TELEGRAM_BLOCKED", 0, true);
        if (e.error_code >= 400 && e.error_code < 500) throw new DeliveryError("TELEGRAM_REJECTED", 0, true);
      }
      throw new DeliveryError("TELEGRAM_TEMPORARY");
    }
  } };
}
