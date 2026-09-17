// Public reads and an unsigned probe quote only. No wallet connector or mutations.
import { loadConfig } from "../src/config/index.js";
import { SeraClient } from "../src/sera/client.js";
import { SepoliaReads } from "../src/wallet/chain.js";
import { deployment,validateQuote,USDC,XSGD } from "../src/trades/contract.js";
import { PROBE_OWNER } from "../src/sera/service.js";
import { safeLog } from "../src/utils/errors.js";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { toRawUnits } from "../src/sera/precision.js";
let stage="config";
async function main(){
  if(existsSync(".env"))loadEnvFile(".env");
  const config=loadConfig();if(!config.wallet.rpc)throw new Error("Set SEPOLIA_RPC_URL for read-only checks.");
  const amount=process.argv.find(a=>a.startsWith("--amount="))?.slice(9)??"100";
  if(!/^\d+(\.\d{1,6})?$/.test(amount))throw new Error("Invalid probe amount");
  const raw=BigInt(toRawUnits(amount,6));if(raw<=0n||raw>100000000n)throw new Error("Probe maximum is 100 test USDC");
  const api=new SeraClient(config),chain=new SepoliaReads(config.wallet.rpc);
  const d=deployment(await api.liveConfig());stage="rpc_deployment";await chain.deployment(d);
  stage="health_time";const health=await api.health(),time=(await api.liveTime()).timestamp;
  stage="quote";const wire=await api.getQuote({from_token:USDC,to_token:XSGD,from_amount:raw.toString(),owner_address:PROBE_OWNER,recipient:PROBE_OWNER,expiration:time+300,gas_mode:"receive_less"});
  const q=validateQuote(wire,d,PROBE_OWNER,raw,time+300,Math.ceil(Date.now()/1000),health.executor_id);
  stage="permit_digest";await chain.permit(d,q);stage="balances";await chain.balances(PROBE_OWNER);
  stage="finalized_logs";const block=await chain.block();await chain.settle(d,q,"0x"+"0".repeat(64),block>300n?block-300n:0n);
  console.info(JSON.stringify({checkedAt:new Date().toISOString(),network:"sepolia",inputUsdc:amount,contracts:"PASS",quote:"positive",permitDomain:"PASS",intentDigest:"PASS",finalizedLogs:"PASS",walletUsed:false,submitted:false}));
}
main().catch(e=>{safeLog("wallet_readonly_check_failed_"+stage,e);console.info(JSON.stringify({errorType:e instanceof Error?e.name:"unknown"}));process.exitCode=1;});
