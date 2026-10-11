import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "../src/config/index.js";
import { SqliteStore } from "../src/database/store.js";
import { domainHash,USDC,XSGD,permitTypes,intentData,permitData,type Deployment,type ExecutionQuote } from "../src/trades/contract.js";
import { TradeService,type TradeApi,type SwapSubmission } from "../src/trades/service.js";
import type { ChainReads } from "../src/wallet/chain.js";
import { NOW } from "./helpers.js";
// Publicly known, isolated test fixture ONLY. Never used with a network or shipped to runtime.
export const signer=privateKeyToAccount(("0x"+"11".repeat(32)) as `0x${string}`);
export const other=privateKeyToAccount(("0x"+"22".repeat(32)) as `0x${string}`);
const sera="0x83475A1bD98a8DC2DCd507A747e4DC85da241D6e",sor="0x83c1368110B640A729f3810De5FBe94b99aa5668",vault="0x3c7945840bAE0d7e7f3824Ebccef1962629250F0";
const domain={name:"Sera",version:"1",chainId:11155111 as const,verifyingContract:sera};
export const deploymentFixture:Deployment={chain_id:11155111,sera_address:sera,sor_address:sor,vault_address:vault,eip712_domain:domain,domain_separator:domainHash(domain)};
export const tradeConfig=loadConfig({ENABLE_TESTNET_EXECUTION:"true",PERMIT_STORAGE_KEY:"ab".repeat(32),TESTNET_PERMIT_WALLET:signer.address,EXECUTION_USER_IDS:"1",SEPOLIA_RPC_URL:"https://rpc.example",SIGNING_ORIGIN:"https://bot.example",WALLETCONNECT_PROJECT_ID:"0".repeat(32),SERA_REQUEST_INTERVAL_MS:"250"});
export function wire(wallet=signer.address.toLowerCase(),index=1):ExecutionQuote {
  const signedUuid=((BigInt("0x12345678123441238123000000000001")+BigInt(index))<<124n).toString();
  const pd={name:"CIRCLE",version:"1",chainId:11155111 as const,verifyingContract:USDC};
  const deadline=NOW/1000+300;
  return {uuid:"00000000-0000-4000-8000-"+index.toString().padStart(12,"0"),expires_at:NOW/1000+30,
    route_params:{taker:wallet,recipient:wallet,inputToken:USDC,outputToken:XSGD,maxInputAmount:"100000000",minOutputAmount:"125000000",initialDepositAmount:"100000000",uuid:signedUuid,deadline},
    fee_breakdown:{gas_cost_usd:"1.25"},permit:{permit_supported:true,permit_required:true,token:USDC,spender:sor,owner:wallet,value_raw:"100000000",current_allowance_raw:"999000000",nonce:0,suggested_deadline:deadline,domain:pd,
      eip712:{domain:pd,primaryType:"Permit",types:structuredClone(permitTypes) as unknown as ExecutionQuote["permit"]["eip712"]["types"],message:{owner:wallet,spender:sor,value:"100000000",nonce:0,deadline}}}};
}
export const mockChain=():ChainReads=>({eoa:async()=>{},deployment:async()=>{},permit:async()=>{},balances:async()=>[{symbol:"USDC",amountRaw:"1000000000",decimals:6}],block:async()=>100n,settle:async(_d,_q,_h,cursor)=>({next:cursor+1n}),canonical:async()=>true});
export async function fixture(path=":memory:") {
  let now=NOW,calls=0,submitted=0;const store=new SqliteStore(path,900000,()=>now);await store.touch("1");await store.touch("2");
  const token=store.wallet.newSession("1","fixtureauth",900000).token;let session=store.wallet.session(token)!;store.wallet.link(session,signer.address.toLowerCase());session=store.wallet.session(token)!;
  const chain=mockChain();const api:TradeApi={getTokens:async()=>({tokens:[{address:USDC,symbol:"USDC",currency:"USD",decimals:6},{address:XSGD,symbol:"XSGD",currency:"SGD",decimals:6}]}),
    getQuote:async request=>{calls++;const q=wire(request.owner_address,calls);if(request.from_amount==='50000000'){
q.route_params.maxInputAmount=q.route_params.initialDepositAmount=q.permit.value_raw=q.permit.eip712.message.value='50000000';q.route_params.minOutputAmount='60000000';
q.fee_breakdown={gas_cost_from_token:'2',gas_cost_usd:'2'};q.quote_breakdown={gas_mode:'receive_less',input_token:USDC,output_token:XSGD,input_amount_before_gas:'50000000',input_amount_after_gas:'50000000',output_amount_before_gas:'62500000',output_amount_after_gas:'60000000',gas_cost_input_token:'2000000',gas_cost_output_token:'2500000',gas_cost_usd:'2'};}return q;},liveConfig:async()=>deploymentFixture,liveTime:async()=>({timestamp:Math.floor(now/1000)}),health:async()=>({executor_id:0,signature_ready:true})};
  const sender:SwapSubmission={submit:async()=>{submitted++;return {success:true,trade_id:"00000000-0000-4000-8000-000000000099",status:"pending"};}};
  const config=structuredClone(tradeConfig),service=new TradeService(store,api,chain,config,sender,()=>now);
  const intent=await store.saveIntent("1",USDC,XSGD,"50","alpha");
  return {store,token,session,chain,api,sender,config,service,intent,now:()=>now,advance:(ms:number)=>{now+=ms;},calls:()=>calls,submitted:()=>submitted,
    async prepare(){return service.prepare(session,intent,"alpha");},
    async authorize(row:Awaited<ReturnType<TradeService['prepare']>>) {
      const p=service.snapshot(row);await service.requestAuthorization(session,row.id,row.version!,'permit',true);
      const permitSignature=await signer.signTypedData(permitData(p.quote));await service.recordAuthorization(session,row.id,row.version!,'permit',permitSignature);
      await service.requestAuthorization(session,row.id,row.version!,'intent',true);const signature=await signer.signTypedData(intentData(p.deployment,p.quote));await service.recordAuthorization(session,row.id,row.version!,'intent',signature);return{signature,permitSignature};
    },
    async signatures(row:Awaited<ReturnType<TradeService["prepare"]>>) {
      const p=service.snapshot(row);return {signature:await signer.signTypedData(intentData(p.deployment,p.quote)),permitSignature:await signer.signTypedData(permitData(p.quote))};
    }};
}
