export class AppError extends Error {
  constructor(public readonly code: string, public readonly status?: number) {
    super(code); this.name = "AppError";
  }
}
export function errorCode(error: unknown): string {
  return error instanceof AppError ? error.code : "UNAVAILABLE";
}
export function safeLog(event: string, error?: unknown): void {
  // Never serialize API responses, Telegram messages, URLs with tokens, or errors' stacks.
  console.error(JSON.stringify({ event, code: errorCode(error), at: new Date().toISOString() }));
}
