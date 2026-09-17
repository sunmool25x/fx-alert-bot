import { createHmac,randomBytes } from "node:crypto";
import { safeWalletCode } from "../i18n/wallet.js";
const salt=randomBytes(32); // Process-local pseudonyms; no session credential is logged.
const operations=new Set(["auth","challenge","verify","disconnect","balance","preview","prepare","confirm","cancel","submit","state","refresh","diagnostic","request"]);
const reference=(value:string)=>createHmac("sha256",salt).update(value).digest("hex").slice(0,12);
export function acceptanceLog(operation:string,code:string,user?:string,wallet?:string) {
  const row={at:new Date().toISOString(),event:"wallet_acceptance",operation:operations.has(operation)?operation:"request",code:safeWalletCode(code),
    ...(user?{user_ref:reference(user)}:{}),...(wallet?{wallet_ref:reference(wallet.toLowerCase())}:{})};
  console.info(JSON.stringify(row));
}
