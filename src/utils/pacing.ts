import { AppError } from "./errors.js";
export type Sleep = (ms: number) => Promise<void>;
export const sleep: Sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function retryAfterMs(header: string | null, now: number): number {
  if (!header) return 1000;
  if (/^\d+(\.\d+)?$/.test(header)) return Number(header) * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : 1000;
}
export class RequestQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private nextAt = 0;
  private blockedUntil = 0;
  private pending = 0;
  constructor(private interval: number, private now = Date.now, private wait: Sleep = sleep) {}
  block(ms: number): void { this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms); }
  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.pending >= 64) return Promise.reject(new AppError("BUSY"));
    this.pending++;
    const result = this.tail.then(async () => {
      if (this.blockedUntil > this.now()) throw new AppError("RATE_LIMITED", 429);
      await this.wait(Math.max(0, this.nextAt - this.now()));
      this.nextAt = this.now() + this.interval;
      return work();
    });
    this.tail = result.catch(() => undefined);
    return result.finally(() => { this.pending--; });
  }
}
