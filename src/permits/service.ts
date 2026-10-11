import type{Config}from'../config/index.js';import type{Store,Language}from'../database/store.js';import type{Session}from'../database/wallet.js';import type{PermitRow,PermitEvent}from'../database/permits.js';import type{TradeService,TradeApi,Snapshot}from'../trades/service.js';import type{ChainReads}from'../wallet/chain.js';
import{deployment,executionQuoteSchema,validateQuote,hashes,json,same,requireThat,USDC,XSGD}from'../trades/contract.js';import{acceptanceReview}from'../trades/acceptance-review.js';import{quoteEconomics}from'../trades/economics.js';import{AppError}from'../utils/errors.js';
import{PERMIT_SPENDER,PERMIT_RAW,checkPermit,permitDigest,verifyPermitSignature,PermitSignatureError}from'./protocol.js';import{encryptPermit}from'./crypto.js';import{fromRawUnits}from'../sera/precision.js';
/** This capability has no sender, Intent-signature operation, transaction or relayer transport. */
export class PermitService{
  private preparing=new Set<string>();
  constructor(private store:Store,private trades:Pick<TradeService,'preview'>,private api:Pick<TradeApi,'liveConfig'|'liveTime'|'health'>,private chain:ChainReads,private config:Config,private now=Date.now){}
  available(user:string){const c=this.config;return c.network==='sepolia'&&c.chainId===11155111&&c.wallet.ready&&!c.wallet.enabled&&c.wallet.permitOnly&&c.wallet.users.length===1&&c.wallet.users.includes(user);}
  private owner(s:Session){requireThat(this.available(s.user_id),'PERMIT_DISABLED');const c=this.store.wallet.current(s);
    requireThat(c.epoch===s.epoch&&c.wallet&&same(c.wallet,this.config.wallet.permitWallet)&&same(c.wallet,this.store.wallet.address(s.user_id)??''),'WALLET_REQUIRED');
    requireThat(!this.store.wallet.quarantined(c.wallet)&&this.store.wallet.list(s.user_id).every(t=>['FAILED','EXPIRED','CANCELLED','CONFIRMED'].includes(t.state)),'WALLET_BUSY');return c;
  }
  private owned(s:Session,id:string,version?:string){const c=this.owner(s),r=this.store.permits.row(id,s.user_id);requireThat(r&&same(r.wallet,c.wallet!)&&(version===undefined||r.version===version),'TRADE_STATE');requireThat(!this.store.permits.retirement(r),'PERMIT_LOCKED');return r;}
  private snapshot(r:PermitRow){const value=JSON.parse(r.payload) as Snapshot,p={...value,deployment:deployment(value.deployment),quote:executionQuoteSchema.parse(value.quote)};
    requireThat(hashes(p.deployment,p.quote).version===r.version&&hashes(p.deployment,p.quote).struct===p.intentHash&&permitDigest(p.quote.permit.eip712)===r.digest,'QUOTE_BINDING_MISMATCH');
    requireThat(p.amount==='50'&&p.fromSymbol==='USDC'&&p.toSymbol==='XSGD'&&same(p.deployment.sor_address,PERMIT_SPENDER),'UNEXPECTED_CONTRACT');
    const q=p.quote,m=q.permit.eip712.message;
    requireThat(q.route_params.initialDepositAmount===PERMIT_RAW&&q.route_params.maxInputAmount===PERMIT_RAW&&same(q.route_params.taker,r.wallet)&&same(q.route_params.recipient,r.wallet)&&same(q.route_params.inputToken,USDC)&&same(q.route_params.outputToken,XSGD)&&m.deadline===q.route_params.deadline,'QUOTE_BINDING_MISMATCH');return p;
  }
  private context(s:Session,id:string){const c=this.store.continuations.get(id,s.user_id);requireThat(c&&c.amount==='50'&&same(c.from_token,USDC)&&same(c.to_token,XSGD),'UNSUPPORTED_TRADE');return c;}
  async prepare(s:Session,id:string,language:Language){const c=this.owner(s);this.context(s,id);const wallet=c.wallet!;
    requireThat(!this.preparing.has(wallet),'PERMIT_LOCKED');const old=this.store.permits.forWallet(wallet);requireThat(!old||(old.user_id===s.user_id&&old.state==='REVIEW'&&old.requested_at===null)||this.store.permits.canRetry(old,c,id),'PERMIT_LOCKED');
    this.preparing.add(wallet);try{
      const p=await this.trades.preview(s,id),h=hashes(p.deployment,p.quote);this.owner(s);this.context(s,id);
      requireThat(p.amount==='50'&&same(p.deployment.sor_address,PERMIT_SPENDER),'UNEXPECTED_CONTRACT');checkPermit(p.quote.permit.eip712,wallet,this.now());
      requireThat(quoteEconomics(p.quote).status==='PASS','COST_REVIEW_BLOCKED');
      requireThat(p.quote.expires_at*1000>this.now()+5000,'QUOTE_STALE');
      const r=this.store.permits.review({user_id:s.user_id,wallet,session_id:s.id,epoch:c.epoch,intent_id:id,version:h.version,payload:json(p),digest:permitDigest(p.quote.permit.eip712)});
      return this.view(r,language,s);
    }finally{this.preparing.delete(wallet);}
  }
  async request(s:Session,id:string,version:string,language:Language){const r=this.owned(s,id,version);requireThat(r.state==='REVIEW'&&r.requested_at===null,'PERMIT_LOCKED');requireThat(r.session_id===s.id&&r.epoch===s.epoch,'WALLET_REQUIRED');this.context(s,r.intent_id);
    this.store.permits.event(r,'CONSENT_AND_CLICK');this.store.permits.event(r,'PREFLIGHT_STARTED');
    let boundary='QUOTE_FRESHNESS';try{
    requireThat(JSON.parse(r.payload).quote.expires_at*1000>this.now()+5000,'QUOTE_STALE');
    boundary='DEPLOYMENT';
    const p=this.snapshot(r),live=deployment(await this.api.liveConfig());
    requireThat(json(live)===json(p.deployment)&&same(live.sor_address,PERMIT_SPENDER),'UNEXPECTED_CONTRACT');
    boundary='CLOCK';const time=(await this.api.liveTime()).timestamp,health=await this.api.health();requireThat(health.signature_ready&&Math.abs(time*1000-this.now())<5000,'CLOCK_SKEW');
    boundary='QUOTE_BINDING';
    validateQuote(p.quote,live,r.wallet,50000000n,p.quote.route_params.deadline,Math.ceil(this.now()/1000),health.executor_id);
    boundary='COST';requireThat(quoteEconomics(p.quote).status==='PASS','COST_REVIEW_BLOCKED');boundary='PERMIT_FIELDS';checkPermit(p.quote.permit.eip712,r.wallet,this.now());boundary='CHAIN_DEPLOYMENT';await this.chain.deployment(live);boundary='ACCOUNT';await this.chain.eoa(r.wallet);boundary='CHAIN_PERMIT';await this.chain.permit(live,p.quote);
    boundary='FINAL_FRESHNESS';
    const current=this.owned(s,id,version);this.context(s,r.intent_id);requireThat(current.session_id===s.id&&current.epoch===s.epoch&&p.quote.expires_at*1000>this.now()+5000,'QUOTE_STALE');
    this.store.permits.event(current,'PREFLIGHT_PASS');this.store.permits.request(current);return{...this.view(this.store.permits.row(id,s.user_id)!,language,s),permit:p.quote.permit.eip712};
    }catch(e){const code=(e as{code?:string}).code;this.store.permits.event(r,code==='QUOTE_STALE'?'PREFLIGHT_QUOTE_STALE':code==='WALLET_REQUIRED'?'PREFLIGHT_OWNERSHIP_EXPIRED':'PREFLIGHT_BLOCKED');const safe=['QUOTE_STALE','WALLET_REQUIRED','AUTH_STALE','TRADE_STATE','CLOCK_SKEW','INVALID_PERMIT','UNEXPECTED_CONTRACT','QUOTE_BINDING_MISMATCH','COST_REVIEW_BLOCKED','EOA_REQUIRED','PERMIT_LOCKED'].includes(String(code))?String(code):'UNAVAILABLE';this.store.permits.event(r,`PRE_DISPATCH_REJECTED:${boundary}:${safe}`);throw e;}
  }
  async record(s:Session,id:string,version:string,signature:unknown,language:Language){const r=this.owned(s,id,version);requireThat(['PERMIT_REQUESTED','RESULT_UNKNOWN'].includes(r.state)&&r.session_id===s.id&&r.epoch===s.epoch,'PERMIT_LOCKED');const p=this.snapshot(r);
    // Preserve bounded signature candidates encrypted BEFORE inspecting them; never serialize arbitrary provider objects.
    const candidate=typeof signature==='string'&&/^0x[0-9a-fA-F]{1,260}$/.test(signature),kind=candidate?'SIGNATURE_BYTES':'UNRECOGNIZED_RESPONSE';
    this.store.permits.capture(r,candidate?encryptPermit(signature as string,this.config.wallet.permitKey,r.id+':'+r.user_id+':'+r.version+':response'):null,kind);
    if(!candidate){this.store.permits.resultChecked(r,null,'RESPONSE_SHAPE','UNKNOWN');this.store.permits.failed(r,'RESULT_UNKNOWN','PERMIT_RESULT_UNKNOWN');return this.view(this.store.permits.row(id,s.user_id)!,language,s);}
    let verified:string;
    try{
      verified=await verifyPermitSignature(p.quote.permit.eip712,signature,r.wallet,r.digest);
    }catch(e){const reason=e instanceof PermitSignatureError?e.reason:'PERMIT_FIELDS_INVALID';this.store.permits.resultChecked(r,false,reason,'UNKNOWN');this.store.permits.event(r,`SIGNATURE_INVALID:${reason}`);this.store.permits.failed(r,'PERMIT_INVALID','INVALID_PERMIT');throw new AppError('INVALID_PERMIT');}
    // A late valid signature is still financial evidence. Quote/Permit expiry and nonce are separate facts.
    this.store.permits.resultChecked(r,true,'VALID','UNKNOWN');
    this.store.permits.signed(r,encryptPermit(verified,this.config.wallet.permitKey,r.id+':'+r.user_id+':'+r.version));
    let chainStatus='MATCH';try{await this.chain.permit(p.deployment,p.quote);}catch(e){chainStatus=(e as{code?:string}).code==='INVALID_PERMIT'?'MISMATCH':'UNKNOWN';}
    this.store.permits.resultChecked(r,true,'VALID',chainStatus);
    return this.view(this.store.permits.row(id,s.user_id)!,language,s);
  }
  fail(s:Session,id:string,version:string,code:'USER_REJECTED'|'WALLET_TIMEOUT'|'WALLET_TRANSPORT_ERROR'|'INVALID_PERMIT'|'WALLET_REQUIRED'|'QUOTE_STALE',rpc:number|null,language:Language){const r=this.owned(s,id,version);requireThat(r.session_id===s.id&&r.epoch===s.epoch&&r.state==='PERMIT_REQUESTED','PERMIT_LOCKED');this.store.permits.failed(r,code==='USER_REJECTED'?'USER_REJECTED':'RESULT_UNKNOWN',code,rpc);return this.view(this.store.permits.row(id,s.user_id)!,language,s);}
  observation(s:Session,id:string,version:string,kind:Extract<PermitEvent,'RPC_DISPATCHED'|'SDK_INVOKED'|'SDK_RETURNED'|'HANDOFF_REQUESTED'|'HANDOFF_FAILED'|'HANDOFF_REOPENED'|'CALLBACK_RECEIVED'|'CLIENT_QUOTE_STALE'|'CLIENT_OWNERSHIP_EXPIRED'|'CLIENT_PRE_DISPATCH_REJECTED'>){
    const r=this.owned(s,id,version);requireThat(r.session_id===s.id&&r.epoch===s.epoch&&r.state==='PERMIT_REQUESTED'&&r.closed_at===null,'PERMIT_LOCKED');
    if(!this.store.permits.events(r).some(e=>e.kind===kind))this.store.permits.event(r,kind);return{ok:true};
  }
  status(s:Session,language:Language){const c=this.owner(s),r=this.store.permits.forWallet(c.wallet!);requireThat(!r||r.user_id===s.user_id,'TRADE_STATE');return r?this.view(r,language,s):null;}
  private view(r:PermitRow,language:Language,s:Session){const p=this.snapshot(r),v=acceptanceReview(p,language),ko=language==='ko',current=this.store.wallet.current(s);
    v.details.title='TESTNET — PERMIT 1/2 · 50 test USDC → XSGD';
    v.details.notes=v.details.notes.filter(n=>!n.includes('읽기 전용 검토 단계')&&!n.includes('Read-only review:'));
    v.details.notes.push(ko?'이번 단계는 금융 승인인 Permit 한 번만 요청합니다. 최대 50 USDC이며 교환을 실행하지 않습니다. Intent 서명은 별도이며 현재 요청하지 않습니다. 릴레이 제출도 하지 않습니다.':'This step requests one financial Permit authorization for at most 50 USDC. It does not execute a swap. Intent is separate and is not requested. No relayer submission occurs.');
    v.details.notes.push(ko?'Quote 만료나 거래 요청 취소는 이미 서명한 Permit을 취소하지 않습니다. 제출 기한 전에는 nonce 등 온체인 조건에 따라 유효할 수 있습니다. 다른 Quote에 자동 재사용하지 않습니다.':'Quote expiry or request cancellation does not revoke an already signed Permit. It may remain valid before its deadline, subject to on-chain nonce and other checks. It is never automatically reused for another quote.');
    for(const step of v.details.steps)if(step.id==='intent'){step.title=ko?'다음 Intent · 비교용 미리보기':'Future Intent · comparison only';step.purpose=ko?'같은 Quote의 금액·최소 수령액·수령인을 비교합니다. 이번 단계에서는 서명하지 않습니다.':'Compare the same quote input, minimum output and recipient. Do not sign it in this phase.';step.notes=[ko?'이 단계에서는 Intent 서명이나 제출 버튼이 없습니다.':'No Intent signing or submission controls exist in this step.'];}
    v.details.technical=v.details.technical.filter(([k])=>k!=='Wallet RPC'&&k!=='Relayer endpoint');v.details.technical.push(['Wallet RPC','eth_signTypedData_v4 × 1 (Permit only)']);
    const quoteExpired=p.quote.expires_at*1000<=this.now(),intentExpired=p.quote.route_params.deadline*1000<=this.now(),permitExpired=p.quote.permit.eip712.message.deadline*1000<=this.now();
    // Display-only expiry metadata. A proof from another session/epoch cannot enable this review.
    const ownershipExpiresAt=current.id===r.session_id&&current.epoch===r.epoch?current.expires_at:0;
    const contextExpiresAt=this.store.continuations.get(r.intent_id,r.user_id)?.expires_at??0;
    const closedAt=r.closed_at,retryEligible=this.store.permits.canRetry(r,current,this.store.continuations.pending(s.user_id)?.id??''),events=this.store.permits.events(r);
    const retired=this.store.permits.retirement(r),retirement=retired?{classification:retired.classification,retiredAt:retired.retired_at}:undefined;
    const result=this.store.permits.result(r),signatureClassification=closedAt?'A':r.state==='PERMIT_SIGNED'&&r.encrypted_signature?'B':result?.crypto_valid===0?'C':'D';
    // Historical callback metadata does not prove signature bytes or cryptographic invalidity.
    const unexamined=r.state==='PERMIT_INVALID'&&!result,state=unexamined?'RESULT_UNKNOWN':r.state;
    const summary={minimum:fromRawUnits(p.quote.route_params.minOutputAmount,6),cost:p.quote.fee_breakdown?.gas_cost_from_token??'',before:fromRawUnits(v.economics.beforeRaw??'0',6),deducted:fromRawUnits(v.economics.deductedRaw??'0',6),costShare:v.economics.costSharePercent??''};
    const stage=r.state==='PERMIT_SIGNED'?'PERMIT_SIGNED':result?.crypto_valid===0?'SIGNATURE_INVALID':state==='RESULT_UNKNOWN'?'RESULT_UNKNOWN':r.requested_at!==null?(events.some(e=>e.kind==='SDK_RETURNED'||e.kind==='CALLBACK_RECEIVED')?'WALLET_DISPATCHED':events.some(e=>e.kind==='SDK_INVOKED')?'SDK_INVOKED':'REQUEST_RESERVED'):events.at(-1)?.kind.startsWith('PRE_DISPATCH_REJECTED:')?'PRE_DISPATCH_REJECTED':quoteExpired?'EXPIRED':'REVIEW';
    return{id:r.id,version:r.version,state,stage,closedAt,retirement,retryEligible,events,result,signatureClassification,summary,details:v.details,economics:v.economics,context:v.context,ownershipExpiresAt,contextExpiresAt,quoteExpiresAt:p.quote.expires_at*1000,permitDeadline:p.quote.permit.eip712.message.deadline*1000,permitDigest:r.digest,permitNonce:String(p.quote.permit.nonce),permitToken:USDC,permitSpender:PERMIT_SPENDER,permitAmount:PERMIT_RAW,quoteExpired,intentExpired,permitExpired,
      permitValidity:permitExpired?'DEADLINE_EXPIRED':r.state==='PERMIT_SIGNED'?'MAY_REMAIN_VALID_UNTIL_DEADLINE':'NOT_VERIFIED_SIGNED',signatureStored:r.state==='PERMIT_SIGNED',requested:r.requested_at!==null,error:unexamined?'PERMIT_RESULT_UNKNOWN':r.error_code,rpcCode:r.rpc_code,intentSigningAvailable:false,submissionAvailable:false};
  }
}
