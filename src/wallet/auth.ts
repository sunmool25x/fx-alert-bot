import { createHmac, timingSafeEqual } from "node:crypto";
import { getAddress, verifyMessage, type Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { z } from "zod";
import { digest, secret, type Session, type WalletStore } from "../database/wallet.js";
import { AppError } from "../utils/errors.js";
import type { WalletConfig } from "./config.js";
export function validateTelegram(data: string, token: string, now = Date.now()) {
  if (!token || data.length > 12000) throw new AppError("AUTH_INVALID");
  const params = new URLSearchParams(data), keys = [...params.keys()];
  if(new Set(keys).size !== keys.length) throw new AppError("AUTH_INVALID");
  const hash = params.get("hash") ?? ""; params.delete("hash");
  const check = [...params.entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => k+"="+v).join("\n");
  const key = createHmac("sha256","WebAppData").update(token).digest();
  const expected = createHmac("sha256",key).update(check).digest();
  if (!/^[0-9a-f]{64}$/.test(hash) || !timingSafeEqual(expected,Buffer.from(hash,"hex"))) throw new AppError("AUTH_INVALID");
  const date = Number(params.get("auth_date"));
  if(!Number.isSafeInteger(date) || now-date*1000>300000 || date*1000>now+30000) throw new AppError("AUTH_STALE");
  if(params.has("chat") || params.has("receiver") || (params.has("chat_type") && params.get("chat_type")!=="private")) throw new AppError("AUTH_INVALID");
  let u: unknown; try {u=JSON.parse(params.get("user")??"null");} catch {throw new AppError("AUTH_INVALID");}
  const parsed=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),is_bot:z.literal(false).optional()}).safeParse(u);
  if(!parsed.success) throw new AppError("AUTH_INVALID");
  return {user:String(parsed.data.id),hash};
}
export class WalletAuth {
  constructor(private store: WalletStore, private config: WalletConfig,
    private eoa: (address: string) => Promise<void>, private now=Date.now) {}
  async challenge(s: Session, address: string, chainId: number) {
    if(chainId!==11155111) {this.store.disconnect(s.user_id);throw new AppError("NETWORK_MISMATCH");}
    const a=getAddress(address).toLowerCase(); await this.eoa(a);
    const message=createSiweMessage({address:getAddress(a),chainId:11155111,domain:new URL(this.config.origin).host,
      uri:this.config.origin,version:"1",nonce:secret(),issuedAt:new Date(this.now()),expirationTime:new Date(this.now()+120000),
      statement:"Verify wallet ownership for Sera Korea FX Bot. This does not authorize a trade.",requestId:s.id});
    return {id:this.store.challenge(s,a,message),message};
  }
  async verify(s: Session, challenge: string, signature: Hex) {
    const c=this.store.consumeChallenge(s,challenge); if(!c) throw new AppError("AUTH_REPLAY");
    if(!await verifyMessage({address:getAddress(c.address),message:c.message,signature})) throw new AppError("AUTH_INVALID");
    await this.eoa(c.address); this.store.link(s,c.address); return c.address;
  }
  csrf(session: Session, value: string) {
    const got=Buffer.from(digest(value)), expected=Buffer.from(session.csrf);
    if(got.length!==expected.length || !timingSafeEqual(got,expected)) throw new AppError("AUTH_INVALID");
  }
}
