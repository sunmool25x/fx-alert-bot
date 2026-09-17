import {assertClaimTransaction,claimAssert,ClaimError,type ClaimView,type ClaimTransaction} from '../src/claims/protocol.js';
import {checkWallet,WalletFlowError,type WalletApi,type WalletProvider} from './connection.js';
// One controller per page and one consumed handoff per review; no auto-connect/retry.
export class ClaimFlow {
  private consumed=new Set<string>();
  constructor(private api:WalletApi,private provider:()=>WalletProvider|undefined,private owner:()=>string,private epoch:()=>number,private swapsEnabled:()=>boolean,private originGuard:()=>void,private now=Date.now){}
  async send(review:ClaimView,onRequest:()=>void):Promise<ClaimView>{
    claimAssert(review.state==='CLAIM_SIMULATED'&&review.snapshot&&!this.consumed.has(review.id),'CLAIM_STALE');
    this.originGuard();claimAssert(!this.swapsEnabled(),'CLAIM_DISABLED');
    const provider=this.provider(),wallet=this.owner(),epoch=this.epoch();checkWallet(provider,wallet,review.expiresAt,this.now());
    claimAssert(provider?.session&&review.wallet.toLowerCase()===wallet.toLowerCase(),'CLAIM_WALLET_CHANGED');
    assertClaimTransaction(review.snapshot.transaction,wallet);
    this.consumed.add(review.id); // Double taps are fenced before the first await.
    const unchanged=()=>{this.originGuard();claimAssert(!this.swapsEnabled(),'CLAIM_DISABLED');claimAssert(this.provider()===provider&&epoch===this.epoch(),'CLAIM_WALLET_CHANGED');checkWallet(provider,this.owner(),review.expiresAt,this.now());claimAssert(this.owner().toLowerCase()===wallet.toLowerCase(),'CLAIM_WALLET_CHANGED');};
    const authorized=await this.api('claim/confirm',{id:review.id,version:review.version});
    let requested=false,hash:unknown;
    try{
      unchanged();claimAssert(authorized.id===review.id&&authorized.version===review.version&&Number.isSafeInteger(authorized.expiresAt)&&authorized.expiresAt>this.now(),'CLAIM_STALE');
      assertClaimTransaction(authorized.transaction,wallet);
      const keys=Object.keys(review.snapshot.transaction) as (keyof ClaimTransaction)[];
      claimAssert(keys.every(k=>authorized.transaction[k]===review.snapshot!.transaction[k]),'CLAIM_INVALID');
      const transaction=Object.freeze({...authorized.transaction}) as ClaimTransaction;
      assertClaimTransaction(transaction,provider!.accounts[0]!);unchanged();
      requested=true;
      const promise=provider!.request({method:'eth_sendTransaction',params:[transaction]});
      void promise.catch(()=>{});
      // Opening the existing wallet app does not make another transaction request.
      try{onRequest();}catch{/* User can use the explicit reopen button. */}
      hash=await promise;
      claimAssert(typeof hash==='string'&&/^0x[0-9a-fA-F]{64}$/.test(hash),'CLAIM_UNRESOLVED');
    }catch{
      await this.api('claim/rejected',{id:review.id}).catch(()=>undefined);
      throw new WalletFlowError(requested?'CLAIM_UNRESOLVED':'CLAIM_STALE');
    }
    // Reporting can be retried by status UI; requesting a wallet transaction cannot.
    try{return await this.api('claim/report',{id:review.id,hash});}
    catch{throw new WalletFlowError('CLAIM_RPC');}
  }
}
