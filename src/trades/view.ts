import { Decimal } from "decimal.js";
import type { Language } from "../database/store.js";
import type { TradeRow } from "../database/wallet.js";
import { walletText,stateText,walletFailure } from "../i18n/wallet.js";
import { fromRawUnits } from "../sera/precision.js";
import type { Snapshot } from "./service.js";
function terms(p:Snapshot,wallet:string,language:Language) {
  const m=walletText[language],q=p.quote,r=q.route_params;
  return ["USDC → XSGD",m.wallet+": "+wallet,m.recipient+": "+r.recipient,
    m.spend+": "+fromRawUnits(r.initialDepositAmount,6)+" USDC",m.maximum+": "+fromRawUnits(r.maxInputAmount,6)+" USDC",
    m.minimum+": "+fromRawUnits(r.minOutputAmount,6)+" XSGD",
    "1 USDC ≥ "+new Decimal(r.minOutputAmount).div(r.maxInputAmount).toSignificantDigits(12).toString()+" XSGD",
    q.fee_breakdown?.gas_cost_usd ? m.cost+": "+q.fee_breakdown.gas_cost_usd : m.unknownCost,m.costNote,
    m.expiry+": "+new Date(q.expires_at*1000).toISOString(),m.deadline+": "+new Date(r.deadline*1000).toISOString(),
    m.permit+": "+fromRawUnits(q.permit.value_raw,6)+" USDC → "+q.permit.spender,m.steps,m.protection,m.changed];
}
export function previewView(p:Snapshot,language:Language) {
  const m=walletText[language];
  return {id:"",state:"PREVIEW",version:null,expiresAt:p.quote.expires_at*1000-5000,
    text:[m.network,m.preview,...terms(p,p.quote.route_params.taker,language),m.infrastructure,m.attribution].join("\n\n")};
}
export function tradeView(row:TradeRow,language:Language) {
  const m=walletText[language],lines=[m.network,stateText(language,row.state)];
  if(row.payload) {
    const p=JSON.parse(row.payload) as Snapshot;
    if(["DRAFT","REVIEW","SIGNATURES"].includes(row.state))lines.push(...terms(p,row.wallet,language));
    else lines.push("USDC → XSGD",m.wallet+": "+row.wallet,m.recipient+": "+p.quote.route_params.recipient,
      m.spend+": "+fromRawUnits(p.quote.route_params.initialDepositAmount,6)+" USDC",m.minimum+": "+fromRawUnits(p.quote.route_params.minOutputAmount,6)+" XSGD");
    lines.push("Intent ID: "+p.quote.route_params.uuid);
  }
  if(row.trade_id)lines.push("Sera trade ID: "+row.trade_id);
  if(row.error_code)lines.push(walletFailure(language,row.error_code));
  let explorer:string|undefined;
  if(row.state==="CONFIRMED"&&row.evidence&&/^0x[0-9a-fA-F]{64}$/.test(row.tx_hash??"")) {
    const e=JSON.parse(row.evidence) as {inputRaw:string;outputRaw:string};
    lines.push(m.actualInput+": "+fromRawUnits(e.inputRaw,6)+" USDC",m.actualOutput+": "+fromRawUnits(e.outputRaw,6)+" XSGD","Sepolia tx: "+row.tx_hash);
    explorer="https://sepolia.etherscan.io/tx/"+row.tx_hash;lines.push(explorer);
  }
  lines.push(m.infrastructure,m.attribution);
  return {id:row.id,state:row.state,version:row.version,expiresAt:row.expires_at,text:lines.join("\n\n"),explorer};
}
