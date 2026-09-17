import { Bot, InlineKeyboard } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { BotController } from "./controller.js";
import { safeLog } from "../utils/errors.js";
export function createTelegramBot(token: string, controller: BotController) {
  const bot = new Bot(token);
  bot.api.config.use(autoRetry({ maxRetryAttempts: 2, maxDelaySeconds: 5 }));
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type !== "private" || !ctx.from) {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => undefined);
      await ctx.reply("개인 대화에서 사용해 주세요. Please use a private chat.").catch(() => undefined);
      return;
    }
    await next();
  });
  bot.on(["message:text", "callback_query:data"], async ctx => {
    // Acknowledge callbacks before API polling to clear Telegram's progress indicator.
    if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => undefined);
    // Sender identity and replay key come from the authenticated Telegram update.
    await controller.handle({ userId: String(ctx.from.id), updateId:ctx.update.update_id,text: ctx.message?.text, callback: ctx.callbackQuery?.data }, {
      reply: async view => {
        const keyboard = new InlineKeyboard();
        for (const row of view.buttons ?? []) {
          for (const b of row) {if(b.webApp)keyboard.webApp(b.text,b.webApp);else if(b.url)keyboard.url(b.text,b.url);else keyboard.text(b.text, b.data);}
          keyboard.row();
        }
        await ctx.reply(view.text, { reply_markup: view.buttons ? keyboard : undefined });
      },
    });
  });
  bot.catch(err => safeLog("telegram_failed", err.error));
  return bot;
}
