import test from "node:test";
import assert from "node:assert/strict";
import { validateQuote,hashes,deployment,intentData,permitData,supportedAmount,USDC,XSGD } from "../src/trades/contract.js";
import { wire,deploymentFixture,signer } from "./trade-helpers.js";
import { NOW } from "./helpers.js";
import { loadConfig } from "../src/config/index.js";
import { toRawUnits,fromRawUnits } from "../src/sera/precision.js";
const validate=(q:unknown)=>validateQuote(q,deploymentFixture,signer.address,100000000n,NOW/1000+300,NOW/1000,0);
test("canonical Intent and ERC-2612 permit preserve exact values and distinct quote/Intent identifiers",()=>{
  const q=validate(wire());assert.equal(intentData(deploymentFixture,q).message.maxInputAmount,100000000n);
  assert.equal(permitData(q).message.value,100000000n);assert.equal(q.permit.current_allowance_raw,"999000000");
  const h=hashes(deploymentFixture,q);assert.notEqual(h.struct,h.intent);
  assert.notEqual(h.version,hashes(deploymentFixture,wire(undefined,2)).version);
});
for(const field of ["taker","recipient","inputToken","outputToken","maxInputAmount","initialDepositAmount","uuid","deadline"] as const) test("quote rejects changed "+field,()=>{
  const q=wire();if(["taker","recipient","inputToken","outputToken"].includes(field))(q.route_params as Record<string,unknown>)[field]="0x"+"9".repeat(40);
  else (q.route_params as Record<string,unknown>)[field]=field==="deadline"?NOW/1000+600:"1";
  assert.throws(()=>validate(q));
});
test("zero output, unknown funding and expired quote cannot be authorized",()=>{
  const q=wire();q.route_params.minOutputAmount="0";assert.throws(()=>validate(q),{code:"NO_LIQUIDITY"});
  const old=wire();old.expires_at=NOW/1000;assert.throws(()=>validate(old),{code:"QUOTE_STALE"});
  assert.throws(()=>validate({...wire(),permit:null}));assert.throws(()=>validate({...wire(),permit:{permit_supported:false}}));
});
for(const field of ["spender","value","deadline","nonce","domain","types"] as const) test("permit rejects unexpected "+field,()=>{
  const q=wire();if(field==="spender")q.permit.eip712.message.spender="0x"+"9".repeat(40);
  if(field==="value")q.permit.eip712.message.value=(2n**256n-1n).toString();
  if(field==="deadline")q.permit.eip712.message.deadline++;
  if(field==="nonce")q.permit.eip712.message.nonce=2;
  if(field==="domain")q.permit.eip712.domain={...q.permit.eip712.domain,verifyingContract:XSGD};
  if(field==="types")q.permit.eip712.types.Permit[0]!.type="uint256";
  assert.throws(()=>validate(q));
});
test("network, verifying contract and exact token identity are gated",()=>{
  assert.throws(()=>deployment({...deploymentFixture,chain_id:1}));
  assert.throws(()=>deployment({...deploymentFixture,eip712_domain:{...deploymentFixture.eip712_domain,verifyingContract:XSGD}}));
  const from={address:USDC,symbol:"USDC",currency:"USD",decimals:6},to={address:XSGD,symbol:"XSGD",currency:"SGD",decimals:6};
  assert.equal(supportedAmount(from,to,"0.000001","100"),1n);
  for(const amount of ["101","0","0.0000001","1e2","100,000"])assert.throws(()=>supportedAmount(from,to,amount,"100"));
  assert.throws(()=>supportedAmount({...from,address:XSGD},to,"1","100"));
  assert.equal(fromRawUnits(toRawUnits("123.000000000000000001",18),18),"123.000000000000000001");
});
test("execution defaults off, strict booleans and explicit mainnet are rejected",()=>{
  assert.equal(loadConfig({}).wallet.enabled,false);assert.deepEqual(loadConfig({}).wallet.users,[]);
  for(const env of [{ENABLE_TESTNET_EXECUTION:"1"},{ENABLE_TESTNET_EXECUTION:"falsee"},{SERA_NETWORK:"mainnet",ENABLE_MAINNET:"true"}])assert.throws(()=>loadConfig(env));
});
