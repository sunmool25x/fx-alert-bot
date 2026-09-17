import { Decimal } from "decimal.js";
import { A, B, NOW, fakeMarkets, quoteWire } from "./helpers.js";
import { marketKey, type AlertSpec, type Observation } from "../src/alerts/types.js";
import { shortId, type Store } from "../src/database/store.js";
import { AppError } from "../src/utils/errors.js";

export const spec: AlertSpec = { network: "sepolia", from_token: A.address, to_token: B.address, base: "USDC", quote: "EURC",
  amount: "100", type: "RATE_ABOVE", threshold: "0.9", window_seconds: null };
export function observation(rate: string | null, at = NOW, override: Partial<AlertSpec> = {}): Observation {
  const s = { ...spec, ...override };
  return { id: shortId(), market_key: marketKey(s), network: "sepolia", from_token: s.from_token, to_token: s.to_token,
    base: s.base, quote: s.quote, amount: s.amount, observed_at: at, available: rate !== null, rate,
    output: rate === null ? null : new Decimal(rate).mul(s.amount).toFixed(), gas_usd: null, expires_at: at + 30000 };
}
export async function createAlert(store: Store, override: Partial<AlertSpec> = {}, user = "1", initial?: boolean) {
  await store.touch(user);
  return store.alerts.create(user, { ...spec, ...override }, shortId(), initial === undefined ? undefined :
    { condition: initial, at: NOW - 1, status: "OK" }, 100, 1000);
}
export function changingMarket(now: () => number) {
  const market = { ...fakeMarkets(), current: "0.89" as string | null, failure: undefined as string | undefined };
  market.quote = async (from, to, amount) => {
    market.calls++;
    if (market.failure) throw new AppError(market.failure);
    if (market.current === null) throw new AppError("NO_LIQUIDITY");
    return { from, to, amount, output: new Decimal(market.current).mul(amount).toFixed(), rate: market.current,
      expiresAt: now() + 30000, executableRoute: market.current !== "0", gasUsd: "0.12", quote: quoteWire() };
  };
  return market;
}
