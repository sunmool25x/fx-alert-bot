import test from 'node:test';
import assert from 'node:assert/strict';
import {Decimal} from 'decimal.js';
import {costBand,costSample,costSelection,ECONOMICS_AMOUNTS} from '../scripts/diagnostics/costs.js';
import {quoteEconomics} from '../src/trades/economics.js';
import {acceptanceReview} from '../src/trades/acceptance-review.js';
import {probeMatrix} from '../src/trades/discovery.js';
import {USDC,XSGD,hashes,validateQuote} from '../src/trades/contract.js';
import {fromRawUnits,toRawUnits} from '../src/sera/precision.js';
import {wire,deploymentFixture,fixture,signer} from './trade-helpers.js';
import {NOW} from './helpers.js';
import {AppError} from '../src/utils/errors.js';
import {previewView} from '../src/trades/view.js';
import type {QuoteRequest} from '../src/sera/client.js';

const pre:Record<string,string>={'2':'2516406','5':'6291017','10':'12582034','25':'31455087','50':'62910174','100':'125820348'};
function quote(input='2',before=pre[input]!,deduction='2446943',cost='1.91129171122422000000') {
  const q=wire(),raw=String(toRawUnits(input,6)),after=String(BigInt(before)-BigInt(deduction));
  Object.assign(q.route_params,{maxInputAmount:raw,initialDepositAmount:raw,minOutputAmount:after});
  q.permit.value_raw=q.permit.eip712.message.value=raw;
  q.fee_breakdown={gas_cost_from_token:cost,gas_cost_usd:cost};
  q.quote_breakdown={gas_mode:'receive_less',input_token:USDC,output_token:XSGD,input_amount_before_gas:raw,input_amount_after_gas:raw,
    output_amount_before_gas:before,output_amount_after_gas:after,gas_cost_input_token:new Decimal(cost).mul(1000000).ceil().toFixed(0),gas_cost_output_token:deduction,gas_cost_usd:cost};return q;
}

test('owner-reported two-USDC case is net of one output deduction and blocks under the unchanged policy',()=>{
  const q=quote('2','2516406','2283869','1.783915436321928'),before=JSON.stringify(q),s=costSample(q,NOW);
  assert.equal(s.minimumXsgd,'0.232537');assert.equal(s.preCostXsgd,'2.516406');assert.equal(s.deductedXsgd,'2.283869');
  assert.equal(s.costPercent,'89.1957718160964');assert.equal(s.gate,'BLOCK');assert.equal(s.reason,'EXTREME_COST');
  assert.equal(new Decimal(s.preCostXsgd!).sub(s.deductedXsgd!).toString(),s.minimumXsgd);assert.equal(JSON.stringify(q),before);
});
for(const language of ['ko','en'] as const)test(language+' review labels USDC and XSGD as the same cost without subtracting it again',()=>{
  const q=quote('2','2516406','2283869','1.783915436321928'),p={quote:q,deployment:deploymentFixture,amount:'2',intentHash:hashes(deploymentFixture,q).struct,fromSymbol:'USDC',toSymbol:'XSGD'};
  const r=acceptanceReview(p,language),details=JSON.stringify(r.details);
  assert(details.includes('0.232537 test XSGD'));assert(details.includes('2.283869 XSGD'));assert(details.includes('1.783915436321928 USDC'));
  assert.match(details,language==='ko'?/추가 출금액이 아닙니다/:/not an additional debit/);assert.equal(r.financialAuthorizationAvailable,false);assert.equal(r.version,null);
});
test('both actual tokens normalize using six decimals and USD display does not determine the input-token percentage',()=>{
  assert.equal(fromRawUnits('50000000',6),'50');assert.equal(fromRawUnits('60463231',6),'60.463231');
  const q=quote('50');q.fee_breakdown!.gas_cost_usd='2';q.quote_breakdown!.gas_cost_usd='2';const s=costSample(q,NOW);
  assert.equal(s.reportedCostUsd,'2');assert.equal(s.reportedCostUsdc,'1.91129171122422000000');assert.equal(s.costPercent,'3.82258342244844');assert.equal(s.gate,'PASS');
});
for(const [cost,gate]of [['0.999999','PASS'],['1','BLOCK'],['1.000001','BLOCK']] as const)test('input-cost boundary '+cost,()=>{
  const q=quote('2','10000000','2000000',cost);assert.equal(costSample(q,NOW).gate,gate);
});
for(const [deduction,gate]of [['4999999','PASS'],['5000000','BLOCK'],['5000001','BLOCK']] as const)test('output-deduction boundary '+deduction,()=>{
  const q=quote('2','10000000',deduction,'0.01');assert.equal(costSample(q,NOW).gate,gate);
});
test('unverifiable or inconsistent fields remain blocked and cannot select an acceptance size',()=>{
  const missing=quote('50');missing.quote_breakdown=null;const wrong=quote('100');wrong.quote_breakdown!.output_amount_after_gas='1';
  const samples=[costSample(missing,NOW),costSample(wrong,NOW)];assert(samples.every(s=>s.gate==='BLOCK'));assert.equal(costSelection(samples).smallestPassing,null);
});
test('diagnostic quality bands use exact boundaries and do not replace the production safety policy',()=>{
  for(const [percent,band]of [['50','EXTREME'],['49.999999999999','VERY HIGH'],['20','VERY HIGH'],['19.999999999999','HIGH'],['10','HIGH'],['9.999999999999','ELEVATED'],['5','ELEVATED'],['4.999999999999','LOWER'],['0','LOWER']] as const)assert.equal(costBand(percent),band);
  for(const p of ['-1','NaN','Infinity'])assert.throws(()=>costBand(p));
  assert.equal(costSample(quote('5'),NOW).gate,'PASS');assert.equal(costSample(quote('5'),NOW).band,'VERY HIGH');
});
test('rounding a percentage for display cannot cross an analytical selection boundary',()=>{
  const q=quote('2','10000000','100000','0.399999999999');const s=costSample(q,NOW);
  assert.equal(quoteEconomics(q).costSharePercent,'20.0000');assert.equal(s.band,'HIGH');assert.equal(costSelection([s]).below20,'2');
});
test('matrix selects 5 under policy, 10 below 20%, 25 below 10% and 50 below 5% without altering inputs',()=>{
  const samples=ECONOMICS_AMOUNTS.map(a=>costSample(quote(a),NOW)),before=JSON.stringify(samples);
  assert.deepEqual(costSelection(samples),{smallestPassing:'5',below20:'10',below10:'25',below5:'50',researchOnly:true});
  assert.equal(JSON.stringify(samples),before);assert(samples.every(s=>s.signable===false));
  assert.equal(new Decimal(samples[4]!.deductionPercent!).toFixed(8),'3.88958231');
});
test('duplicate or unsupported matrix sizes fail instead of changing amounts',()=>{
  const s=costSample(quote('50'),NOW);assert.throws(()=>costSelection([s,s]));assert.throws(()=>costSample(quote('3','4000000','100000','0.1'),NOW));
});
test('expired quote is non-signable research and expiry at capture cannot become a passing selection',()=>{
  const q=quote('50'),expired=costSample(q,q.expires_at*1000),captured=costSample(q,NOW);
  assert.equal(expired.freshAtCapture,false);assert.equal(expired.signable,false);assert.equal(costSelection([expired]).smallestPassing,null);
  assert.equal(captured.gate,'PASS');assert.equal(captured.signable,false);assert.equal(previewView({quote:q,deployment:deploymentFixture,amount:'50',intentHash:hashes(deploymentFixture,q).struct,fromSymbol:'USDC',toSymbol:'XSGD'},'ko').version,null);
});
test('operator matrix requests each explicit size once, retaining exact amount, pair and recipient',async()=>{
  let time=NOW;const requests:QuoteRequest[]=[];
  const api={liveTime:async()=>({timestamp:Math.floor(time/1000)}),getQuote:async(r:QuoteRequest)=>{requests.push(r);const q=quote(fromRawUnits(r.from_amount,6));q.expires_at=Math.floor(time/1000)+30;q.route_params.deadline=q.permit.suggested_deadline=q.permit.eip712.message.deadline=r.expiration;return q;}};
  const rows=await probeMatrix({api,wallet:signer.address,pairs:[{from:{address:USDC,symbol:'USDC',currency:'USD',decimals:6},to:{address:XSGD,symbol:'XSGD',currency:'SGD',decimals:6}}],amounts:ECONOMICS_AMOUNTS,now:()=>time,wait:async ms=>{time+=ms;},verify:async(q,_pair,input,deadline)=>{validateQuote(q,deploymentFixture,signer.address,input,deadline,time/1000,0);}});
  assert.equal(rows.length,6);assert.deepEqual(requests.map(r=>r.from_amount),['2000000','5000000','10000000','25000000','50000000','100000000']);
  assert(requests.every(r=>r.from_token===USDC&&r.to_token===XSGD&&r.owner_address===r.recipient&&r.gas_mode==='receive_less'));
});
test('passing 50-USDC research cannot authorize Permit, Intent or relayer submission with execution OFF',async()=>{
  const f=await fixture();try{f.config.wallet.enabled=false;const q=quote('50'),id=await f.store.saveIntent('1',USDC,XSGD,'50','wallet');
    assert.equal(costSample(q,NOW).gate,'PASS');let reads=0;f.api.getQuote=async request=>{reads++;assert.equal(request.from_amount,'50000000');return q;};
    const p=await f.service.preview(f.session,id);assert.equal(p.amount,'50');assert.equal(reads,1);assert.equal((await f.store.intent(id,'1'))?.amount,'50');
    assert.throws(()=>f.service.confirm(f.session,'',''),{code:'EXECUTION_DISABLED'});
    await assert.rejects(f.service.submit(f.session,'','','0x','0x'),{code:'EXECUTION_DISABLED'});assert.equal(f.submitted(),0);assert.equal(f.store.wallet.list('1').length,0);
    const review=acceptanceReview(p,'ko');assert.equal(review.context.amount,'50');assert.equal(review.reviewState,'REVIEW_READY');assert.equal(review.financialAuthorizationAvailable,false);assert.equal(review.version,null);
    f.api.getQuote=async()=>{throw new AppError('NO_LIQUIDITY');};await assert.rejects(f.service.preview(f.session,id),{code:'NO_LIQUIDITY'});
    assert.equal((await f.store.intent(id,'1'))?.amount,'50');assert.equal(f.submitted(),0);
  }finally{f.store.close();}
});
