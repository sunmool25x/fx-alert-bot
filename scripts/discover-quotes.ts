import { DatabaseSync } from "node:sqlite";
import { loadConfig } from "../src/config/index.js";
import { preflightEnvironment } from "./live/environment.js";
import { SeraClient } from "../src/sera/client.js";
import { SepoliaReads } from "../src/wallet/chain.js";
import { deployment, USDC, XSGD, same, validateQuote, requireThat } from "../src/trades/contract.js";
import { DISCOVERY_AMOUNTS, probeMatrix, selectIntended, discoveryFailure } from "../src/trades/discovery.js";

// Operator-only public reads. No session issuance, signatures, trade store or sender.
// An optional single amount refreshes evidence; it cannot classify an entire pair.
let db:DatabaseSync|undefined;
try {
  const args=process.argv.slice(2);
  requireThat(args.length===0||(args.length===2&&args[0]==="--amount"&&DISCOVERY_AMOUNTS.includes(args[1] as typeof DISCOVERY_AMOUNTS[number])),"INVALID_AMOUNT");
  const c=loadConfig(preflightEnvironment(process.cwd()));
  requireThat(c.chainId===11155111&&!c.wallet.enabled&&c.wallet.users.length===1,"UNSUPPORTED_TRADE");
  db=new DatabaseSync(c.databasePath,{readOnly:true});
  const link=db.prepare("SELECT address FROM wallet_links WHERE user_id=?").get(c.wallet.users[0]!);
  requireThat(link&&typeof link.address==="string","WALLET_REQUIRED");const wallet=link.address;
  const ownershipFresh=!!db.prepare("SELECT 1 FROM wallet_sessions WHERE user_id=? AND lower(wallet)=lower(?) AND expires_at>?").get(c.wallet.users[0]!,wallet,Date.now());
  db.close();db=undefined;
  const api=new SeraClient(c,async (url,init)=>{
    const path=new URL(String(url)).pathname;
    requireThat(["/api/v1/config","/api/v1/health","/api/v1/tokens","/api/v1/system/time","/api/v1/swap/quote"].includes(path),"UNSUPPORTED_TRADE");
    requireThat(!init?.method||init.method==="GET"||(init.method==="POST"&&path==="/api/v1/swap/quote"),"UNSUPPORTED_TRADE");
    return fetch(url,init);
  });
  const reads=new SepoliaReads(c.wallet.rpc),d=deployment(await api.liveConfig());
  await reads.deployment(d);await reads.eoa(wallet);
  const health=await api.health();requireThat(health.signature_ready,"UNAVAILABLE");
  const tokens=(await api.getTokens()).tokens,from=tokens.find(t=>same(t.address,USDC)),to=tokens.find(t=>same(t.address,XSGD));
  requireThat(from&&to&&from.decimals===6&&to.decimals===6,"UNSUPPORTED_TRADE");
  console.info(JSON.stringify({readOnly:true,chainId:11155111,execution:false,ownershipFresh,
    note:"Public quote evidence is not a fresh ownership proof or a signable trade. Reverse quotes do not add execution support."}));
  const rows=await probeMatrix({api,wallet,pairs:args.length?[{from,to}]:[{from,to},{from:to,to:from}],
    amounts:args.length?[args[1]!]:DISCOVERY_AMOUNTS,
    verify:async(q,pair,input,deadline)=>{if(same(pair.from.address,USDC))await reads.permit(d,validateQuote(q,d,wallet,input,deadline,Math.ceil(Date.now()/1000),health.executor_id));},
    onResult:row=>console.info(JSON.stringify(row))});
  if(!args.length)console.info(JSON.stringify(selectIntended(rows)));
  if(rows.some(r=>!["EXECUTABLE_QUOTE","NO_LIQUIDITY","BELOW_MINIMUM"].includes(r.state)))process.exitCode=1;
}catch(error){console.error(JSON.stringify(discoveryFailure(error)));process.exitCode=1;}finally{db?.close();}
