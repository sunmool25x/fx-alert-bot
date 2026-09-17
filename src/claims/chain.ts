import {createPublicClient,http,parseAbi,encodeFunctionData,decodeFunctionResult,decodeEventLog,keccak256,type Address,type Hex} from 'viem';
import {sepolia} from 'viem/chains';
import {USDC,XSGD} from '../trades/contract.js';
import {receiptCosts,nativeAccounting} from './receipt-evidence.js';
import type {ClaimEvidence} from './protocol.js';
import {FAUCET,FAUCET_CODE_HASH,CLAIM_DATA,CLAIM_ALLOCATION,CLAIM_ETH,claimTransaction,assertClaimTransaction,claimAssert,ClaimError,equalAddress,quantity,type ClaimSnapshot,type ClaimBalances} from './protocol.js';
export const faucetAbi=parseAbi(['function claim()','function hasClaimed(address) view returns(bool)','function hasClaimedEth(address) view returns(bool)','function userTokenClaimed(address,address) view returns(bool)','function getTokens() view returns(address[])','function claimAmount() view returns(uint256)','function ethPerUser() view returns(uint256)','function claimEpoch() view returns(uint256)','event EthClaimed(address indexed user,uint256 amount)']);
const tokenAbi=parseAbi(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','event Transfer(address indexed from,address indexed to,uint256 value)']);
export type ClaimReceiptResult={state:'pending'|'mined'|'verified'|'reverted'|'invalid';balances?:ClaimBalances;reason?:string;evidence?:ClaimEvidence};
export interface ClaimChain {simulate(wallet:string):Promise<ClaimSnapshot>;receipt(wallet:string,hash:Hex,snapshot:ClaimSnapshot,prior?:ClaimEvidence):Promise<ClaimReceiptResult>}
export const claimClient=(url:string)=>createPublicClient({chain:sepolia,transport:http(url,{retryCount:0,timeout:12000,fetchOptions:{redirect:'error'}})});
type Client=ReturnType<typeof claimClient>;
type Log={address:string;data:Hex;topics:readonly Hex[]};
export function claimTransfers(logs:readonly Log[],wallet:string){
  let usdc=0n,xsgd=0n,eth=0n;
  for(const log of logs){try{
    if(equalAddress(log.address,FAUCET)){
      const e=decodeEventLog({abi:faucetAbi,eventName:'EthClaimed',data:log.data,topics:log.topics as [Hex,...Hex[]]});
      if(equalAddress(e.args.user,wallet))eth+=e.args.amount;
    }else if(equalAddress(log.address,USDC)||equalAddress(log.address,XSGD)){
      const e=decodeEventLog({abi:tokenAbi,eventName:'Transfer',data:log.data,topics:log.topics as [Hex,...Hex[]]});
      if(equalAddress(e.args.from,FAUCET)&&equalAddress(e.args.to,wallet)){if(equalAddress(log.address,USDC))usdc+=e.args.value;else xsgd+=e.args.value;}
    }
  }catch{/* Ignore unrelated events; required exact-token transfers must still be present. */}}
  return {usdc,xsgd,eth};
}
export class SepoliaClaimChain implements ClaimChain {
  constructor(private client:Client,private now=Date.now){}
  private async verified(block:bigint){
    claimAssert(await this.client.getChainId()===11155111,'NETWORK_MISMATCH');
    const code=await this.client.getCode({address:FAUCET,blockNumber:block});
    claimAssert(code&&keccak256(code)===FAUCET_CODE_HASH,'CLAIM_CONTRACT_MISMATCH');
    claimAssert(encodeFunctionData({abi:faucetAbi,functionName:'claim'})===CLAIM_DATA,'CLAIM_CONTRACT_MISMATCH');
  }
  private async balances(wallet:Address,block:bigint):Promise<ClaimBalances>{
    return {eth:String(await this.client.getBalance({address:wallet,blockNumber:block})),
      usdc:String(await this.client.readContract({address:USDC,abi:tokenAbi,functionName:'balanceOf',args:[wallet],blockNumber:block})),
      xsgd:String(await this.client.readContract({address:XSGD,abi:tokenAbi,functionName:'balanceOf',args:[wallet],blockNumber:block}))};
  }
  async simulate(wallet:string):Promise<ClaimSnapshot>{
    try{return await this.simulation(wallet as Address);}catch(e){throw e instanceof ClaimError?e:new ClaimError('CLAIM_SIMULATION_FAILED');}
  }
  private async simulation(wallet:Address):Promise<ClaimSnapshot>{
    const c=this.client,block=await c.getBlock({blockTag:'latest'});await this.verified(block.number);
    claimAssert(Math.abs(this.now()-Number(block.timestamp)*1000)<120000,'CLAIM_STALE');
    const code=await c.getCode({address:wallet,blockNumber:block.number});claimAssert(!code||code==='0x','EOA_REQUIRED');
    const read=<N extends 'claimEpoch'|'claimAmount'|'ethPerUser'|'getTokens'>(functionName:N)=>c.readContract({address:FAUCET,abi:faucetAbi,functionName,blockNumber:block.number});
    claimAssert(!await c.readContract({address:FAUCET,abi:faucetAbi,functionName:'hasClaimed',args:[wallet],blockNumber:block.number}),'CLAIM_ALREADY');
    claimAssert(!await c.readContract({address:FAUCET,abi:faucetAbi,functionName:'hasClaimedEth',args:[wallet],blockNumber:block.number}),'CLAIM_ALREADY');
    const allocation=await read('claimAmount'),eth=await read('ethPerUser'),epoch=await read('claimEpoch'),tokens=await read('getTokens');
    claimAssert(allocation===CLAIM_ALLOCATION&&eth===CLAIM_ETH&&tokens.length>0,'CLAIM_CONTRACT_MISMATCH');
    for(const address of [USDC,XSGD] as Address[]){
      claimAssert(tokens.some(t=>equalAddress(t,address)),'CLAIM_CONTRACT_MISMATCH');
      claimAssert(await c.readContract({address,abi:tokenAbi,functionName:'decimals',blockNumber:block.number})===6,'CLAIM_CONTRACT_MISMATCH');
      claimAssert(!await c.readContract({address:FAUCET,abi:faucetAbi,functionName:'userTokenClaimed',args:[wallet,address],blockNumber:block.number}),'CLAIM_ALREADY');
      claimAssert(await c.readContract({address,abi:tokenAbi,functionName:'balanceOf',args:[FAUCET],blockNumber:block.number})>=allocation,'CLAIM_STOCK');
    }
    claimAssert(await c.getBalance({address:FAUCET,blockNumber:block.number})>=eth,'CLAIM_STOCK');
    const nonce=await c.getTransactionCount({address:wallet,blockTag:'latest'});
    claimAssert(nonce===await c.getTransactionCount({address:wallet,blockTag:'pending'}),'CLAIM_BUSY');
    const before=await this.balances(wallet,block.number),data=encodeFunctionData({abi:tokenAbi,functionName:'balanceOf',args:[wallet]});
    // Read-only sequential simulation: balances are read AFTER the simulated claim.
    // An eth_call success alone cannot prove either ERC-20 transfer.
    const result=await c.request({method:'eth_simulateV1',params:[{blockStateCalls:[{calls:[
      {from:wallet,to:FAUCET,data:CLAIM_DATA,value:'0x0',gas:'0xb71b00'},
      {to:USDC,data,gas:'0x186a0'},{to:XSGD,data,gas:'0x186a0'}]}],validation:false,traceTransfers:true},quantity(block.number) as Hex]}) as unknown as {calls:{status:string;returnData:Hex;logs:Log[]}[]}[];
    const calls=result[0]?.calls;
    claimAssert(calls?.length===3&&calls.every(x=>x.status==='0x1'),'CLAIM_SIMULATION_FAILED');
    const afterU=decodeFunctionResult({abi:tokenAbi,functionName:'balanceOf',data:calls[1]!.returnData});
    const afterX=decodeFunctionResult({abi:tokenAbi,functionName:'balanceOf',data:calls[2]!.returnData});
    const deltas=claimTransfers(calls[0]!.logs,wallet);
    claimAssert(afterU-BigInt(before.usdc)===allocation&&afterX-BigInt(before.xsgd)===allocation&&deltas.usdc===allocation&&deltas.xsgd===allocation&&deltas.eth===eth,'CLAIM_SIMULATION_FAILED');
    const gas=await c.estimateGas({account:wallet,to:FAUCET,data:CLAIM_DATA,value:0n});
    const fees=await c.estimateFeesPerGas();
    const tx=claimTransaction(wallet,(gas*120n+99n)/100n,fees.maxFeePerGas*2n,fees.maxPriorityFeePerGas,BigInt(nonce));
    claimAssert(BigInt(before.eth)>=BigInt(tx.gas)*BigInt(tx.maxFeePerGas),'CLAIM_GAS');
    return {transaction:tx,block:String(block.number),blockHash:block.hash,epoch:String(epoch),before,receive:{usdc:String(allocation),xsgd:String(allocation),eth:String(eth)},gasEstimate:String(gas),simulatedAt:this.now()};
  }
  async receipt(wallet:string,hash:Hex,s:ClaimSnapshot,prior?:ClaimEvidence):Promise<ClaimReceiptResult>{
    try {
      assertClaimTransaction(s.transaction,wallet);
      const c=this.client,head=await c.getBlockNumber({cacheTime:0});await this.verified(head);
      let tx,receipt;
      try{tx=await c.getTransaction({hash});receipt=await c.getTransactionReceipt({hash});}catch{return {state:'pending',reason:'CLAIM_VERIFICATION_PENDING'};}
      if(tx.hash!==hash||tx.chainId!==11155111||!tx.to||!equalAddress(tx.to,FAUCET)||!equalAddress(tx.from,wallet)||tx.input!==CLAIM_DATA||tx.value!==0n||BigInt(tx.nonce)!==BigInt(s.transaction.nonce)||receipt.blockNumber<BigInt(s.block)||receipt.transactionHash!==hash||!equalAddress(receipt.from,wallet)||!receipt.to||!equalAddress(receipt.to,FAUCET))return {state:'invalid',reason:'CLAIM_TX_MISMATCH'};
      const block=await c.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash||tx.blockHash!==receipt.blockHash)return {state:'pending',reason:'CLAIM_VERIFICATION_PENDING'};
      const final=await c.getBlock({blockTag:'finalized'});
      if(receipt.blockNumber>final.number)return {state:'mined',reason:'CLAIM_VERIFICATION_PENDING'};
      if(receipt.status!=='success')return {state:'reverted'};
      const costs=receiptCosts(s.transaction,tx,receipt);
      if(!costs.valid)return {state:'invalid',reason:'CLAIM_FEE_EXCEEDED'};
      const transfers=claimTransfers(receipt.logs,wallet);
      if(BigInt(s.receive.usdc)!==CLAIM_ALLOCATION||BigInt(s.receive.xsgd)!==CLAIM_ALLOCATION||BigInt(s.receive.eth)!==CLAIM_ETH||transfers.usdc!==BigInt(s.receive.usdc)||transfers.xsgd!==BigInt(s.receive.xsgd)||transfers.eth!==BigInt(s.receive.eth))return {state:'invalid',reason:'CLAIM_TRANSFER_MISMATCH'};
      // Only an already VERIFIED database record supplies prior evidence. Initial
      // reconciliation always proves historical state below. Later read-only quote
      // preparation rebinds that retained proof to the live finalized receipt so a
      // non-archive RPC cannot erase an already proven receipt as it prunes state.
      if(prior){
        const matches=prior.finalized===true&&prior.nativeAccountingVerified===true&&prior.transactionHash===hash&&prior.blockHash===receipt.blockHash&&prior.blockNumber===String(receipt.blockNumber)&&
          prior.usdc?.contract===USDC&&prior.xsgd?.contract===XSGD&&prior.usdc.decimals===6&&prior.xsgd.decimals===6&&prior.usdc.receivedRaw===String(transfers.usdc)&&prior.xsgd.receivedRaw===String(transfers.xsgd)&&
          prior.nativeReceivedRaw===String(transfers.eth)&&prior.gasPaidRaw===String(costs.paid)&&prior.reviewedMaximumCostRaw===String(costs.reviewedMaximum)&&prior.actualMaximumCostRaw===String(costs.actualMaximum)&&prior.feeAdjusted===costs.feeAdjusted&&
          /^[1-9]\d*$/.test(prior.confirmations)&&BigInt(prior.confirmations)<=head-receipt.blockNumber+1n&&/^\d+$/.test(prior.nativeBeforeRaw)&&/^\d+$/.test(prior.nativeAfterRaw)&&
          nativeAccounting(BigInt(prior.nativeBeforeRaw),transfers.eth,costs.paid,BigInt(prior.nativeAfterRaw));
        if(!matches)return {state:'invalid',reason:'CLAIM_BALANCES_FAILED'};
        for(const address of [USDC,XSGD] as Address[])if(await c.readContract({address,abi:tokenAbi,functionName:'decimals',blockNumber:head})!==6)return {state:'invalid',reason:'CLAIM_DECIMALS_MISMATCH'};
        const current=await this.balances(wallet as Address,head),latest=await c.getBlockNumber({cacheTime:0});
        if((await c.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash||latest<head)return {state:'pending',reason:'CLAIM_VERIFICATION_PENDING'};
        return {state:'verified',balances:current,evidence:{...prior,confirmations:String(latest-receipt.blockNumber+1n)}};
      }
      await this.verified(receipt.blockNumber);
      const decimals=[];for(const address of [USDC,XSGD] as Address[])decimals.push(await c.readContract({address,abi:tokenAbi,functionName:'decimals',blockNumber:receipt.blockNumber}));
      if(decimals.some(d=>d!==6))return {state:'invalid',reason:'CLAIM_DECIMALS_MISMATCH'};
      const balances=await this.balances(wallet as Address,receipt.blockNumber);
      // Historical balance reads can lag a valid receipt. Keep the same claim pending;
      // the next bounded, read-only status check re-reads the same canonical block.
      if(BigInt(balances.usdc)-BigInt(s.before.usdc)<transfers.usdc||BigInt(balances.xsgd)-BigInt(s.before.xsgd)<transfers.xsgd)return {state:'mined',reason:'CLAIM_VERIFICATION_PENDING'};
      const nativeBefore=await c.getBalance({address:wallet as Address,blockNumber:receipt.blockNumber-1n});
      if(!nativeAccounting(nativeBefore,transfers.eth,costs.paid,BigInt(balances.eth)))return {state:'mined',reason:'CLAIM_NATIVE_PENDING'};
      const claimed=await c.readContract({address:FAUCET,abi:faucetAbi,functionName:'hasClaimed',args:[wallet as Address],blockNumber:receipt.blockNumber});
      if(!claimed)return {state:'mined',reason:'CLAIM_VERIFICATION_PENDING'};
      const latest=await c.getBlockNumber({cacheTime:0});
      const rechecked=await c.getBlock({blockNumber:receipt.blockNumber});
      if(rechecked.hash!==receipt.blockHash||latest<receipt.blockNumber)return {state:'pending',reason:'CLAIM_VERIFICATION_PENDING'};
      return {state:'verified',balances,evidence:{transactionHash:hash,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash,confirmations:String(latest-receipt.blockNumber+1n),finalized:true,
        usdc:{contract:USDC,decimals:decimals[0]!,receivedRaw:String(transfers.usdc)},xsgd:{contract:XSGD,decimals:decimals[1]!,receivedRaw:String(transfers.xsgd)},
        nativeReceivedRaw:String(transfers.eth),nativeBeforeRaw:String(nativeBefore),nativeAfterRaw:balances.eth,gasPaidRaw:String(costs.paid),nativeAccountingVerified:true,
        reviewedMaximumCostRaw:String(costs.reviewedMaximum),actualMaximumCostRaw:String(costs.actualMaximum),feeAdjusted:costs.feeAdjusted}};
    }catch(e){if(e instanceof ClaimError)throw e;return {state:'pending',reason:'CLAIM_RPC'};}
  }
}
