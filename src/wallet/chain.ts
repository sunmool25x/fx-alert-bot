import { createPublicClient,http,parseAbi,parseAbiItem,decodeEventLog,hashTypedData,type Hex,type Address } from "viem";
import { sepolia } from "viem/chains";
import { CHAIN,USDC,XSGD,same,requireThat,domainHash,intentData,type Deployment,type ExecutionQuote } from "../trades/contract.js";
const erc20=parseAbi(["function balanceOf(address) view returns (uint256)","function decimals() view returns (uint8)","function nonces(address) view returns (uint256)","function DOMAIN_SEPARATOR() view returns (bytes32)"]);
const sorAbi=parseAbi(["function sera() view returns (address)"]);
const intentEvent=parseAbiItem("event IntentMatched(bytes32 indexed intentHash, address indexed taker, uint256 legCount)");
const transferEvent=parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
export interface Evidence { txHash:string;blockNumber:string;blockHash:string;intentHash:string;inputRaw:string;outputRaw:string;finalizedAtBlock:string }
export interface ChainReads {
  eoa(address:string):Promise<void>;
  deployment(d:Deployment):Promise<void>;
  permit(d:Deployment,q:ExecutionQuote):Promise<void>;
  balances(wallet:string):Promise<{symbol:string;amountRaw:string;decimals:number}[]>;
  block():Promise<bigint>;
  settle(d:Deployment,q:ExecutionQuote,hash:string,cursor:bigint):Promise<{evidence?:Evidence;next:bigint}>;
  canonical(e:Evidence):Promise<boolean>;
}
export class SepoliaReads implements ChainReads {
  private client;
  constructor(url:string) {
    this.client=createPublicClient({chain:sepolia,transport:http(url,{retryCount:0,timeout:10000,fetchOptions:{redirect:"error"}})});
  }
  async network() {requireThat(await this.client.getChainId()===CHAIN,"NETWORK_MISMATCH");}
  async readiness(d:Deployment) {
    await this.deployment(d);
    const finalized=await this.client.getBlock({blockTag:"finalized"});
    await this.client.getLogs({address:d.sor_address as Address,event:intentEvent,fromBlock:finalized.number,toBlock:finalized.number});
    // Query a real public transaction if present; no wallet or broadcast method is used.
    const first=finalized.transactions[0];
    requireThat(first,"UNAVAILABLE");await this.client.getTransactionReceipt({hash:first});
  }
  async eoa(address:string) {await this.network();const code=await this.client.getCode({address:address as Address});requireThat(!code||code==="0x","EOA_REQUIRED");}
  async deployment(d:Deployment) {
    await this.network();
    for(const a of [d.sera_address,d.sor_address,d.vault_address,USDC,XSGD]) {
      const code=await this.client.getCode({address:a as Address});requireThat(code&&code!=="0x","UNEXPECTED_CONTRACT");
    }
    const domain=await this.client.readContract({address:d.sera_address as Address,abi:erc20,functionName:"DOMAIN_SEPARATOR"});
    requireThat(same(domain,domainHash(d.eip712_domain)),"UNEXPECTED_CONTRACT");
    const sera=await this.client.readContract({address:d.sor_address as Address,abi:sorAbi,functionName:"sera"});
    requireThat(same(sera,d.sera_address),"UNEXPECTED_CONTRACT");
    for(const address of [USDC,XSGD] as Address[]) requireThat(await this.client.readContract({address,abi:erc20,functionName:"decimals"})===6,"UNSUPPORTED_TRADE");
  }
  async permit(d:Deployment,q:ExecutionQuote) {
    await this.network();
    const domain=await this.client.readContract({address:USDC,abi:erc20,functionName:"DOMAIN_SEPARATOR"});
    const nonce=await this.client.readContract({address:USDC,abi:erc20,functionName:"nonces",args:[q.route_params.taker as Address]});
    requireThat(same(domain,domainHash(q.permit.eip712.domain))&&nonce===BigInt(q.permit.nonce),"INVALID_PERMIT");
    const r=q.route_params;
    const actual=await this.client.readContract({address:d.sera_address as Address,
      abi:parseAbi(["function getIntentDigest(address,address,address,uint256,uint256,address,uint256,uint256,uint48) view returns (bytes32)"]),
      functionName:"getIntentDigest",args:[r.taker as Address,r.inputToken as Address,r.outputToken as Address,BigInt(r.maxInputAmount),BigInt(r.minOutputAmount),r.recipient as Address,BigInt(r.initialDepositAmount),BigInt(r.uuid),r.deadline]});
    requireThat(same(actual,hashTypedData(intentData(d,q))),"UNEXPECTED_CONTRACT");
  }
  async balances(wallet:string) {
    await this.network();const result=[];
    for(const [symbol,address] of [["USDC",USDC],["XSGD",XSGD]] as const) {
      const amount=await this.client.readContract({address,abi:erc20,functionName:"balanceOf",args:[wallet as Address]});
      result.push({symbol,amountRaw:amount.toString(),decimals:6});
    }return result;
  }
  async block() {await this.network();return this.client.getBlockNumber({cacheTime:0});}
  async settle(d:Deployment,q:ExecutionQuote,hash:string,cursor:bigint) {
    await this.network();
    const finalized=await this.client.getBlock({blockTag:"finalized"});
    if(finalized.number<cursor) return {next:cursor};
    const end=cursor+1999n<finalized.number?cursor+1999n:finalized.number;
    const logs=await this.client.getLogs({address:d.sor_address as Address,event:intentEvent,
      args:{intentHash:hash as Hex,taker:q.route_params.taker as Address},fromBlock:cursor,toBlock:end,strict:true});
    for(const log of logs) {
      if(!log.transactionHash||log.removed) continue;
      const receipt=await this.client.getTransactionReceipt({hash:log.transactionHash});
      const canonical=await this.client.getBlock({blockNumber:receipt.blockNumber});
      const evidence=receiptEvidence(d,q,hash,{status:receipt.status,transactionHash:receipt.transactionHash,blockHash:receipt.blockHash,
        blockNumber:receipt.blockNumber,logs:receipt.logs},canonical.hash,finalized.number);
      if(evidence) return {evidence,next:end+1n};
    }return {next:end+1n};
  }
  async canonical(e:Evidence) {await this.network();return same((await this.client.getBlock({blockNumber:BigInt(e.blockNumber)})).hash,e.blockHash);}
}
export function receiptEvidence(d:Deployment,q:ExecutionQuote,hash:string,
  receipt:{status:string;transactionHash:string;blockHash:string;blockNumber:bigint;logs:{address:string;data:Hex;topics:readonly Hex[]}[]},canonicalHash:string,finalized:bigint):Evidence|undefined {
  if(receipt.status!=="success"||receipt.blockNumber>finalized||!same(receipt.blockHash,canonicalHash))return;
  let matched=false,input=0n,output=0n;
  for(const log of receipt.logs) {
    try {
      if(same(log.address,d.sor_address)) {
        const event=decodeEventLog({abi:[intentEvent],data:log.data,topics:log.topics as [Hex,...Hex[]]});
        if(same(event.args.intentHash,hash)&&same(event.args.taker,q.route_params.taker)&&event.args.legCount>0n)matched=true;
      } else if(same(log.address,USDC)||same(log.address,XSGD)) {
        const event=decodeEventLog({abi:[transferEvent],data:log.data,topics:log.topics as [Hex,...Hex[]]});
        if(same(log.address,USDC)&&same(event.args.from,q.route_params.taker))input+=event.args.value;
        if(same(log.address,XSGD)&&same(event.args.to,q.route_params.recipient))output+=event.args.value;
      }
    } catch { /* Unrelated receipt logs are not settlement evidence. */ }
  }
  if(!matched||input<=0n||input>BigInt(q.route_params.maxInputAmount)||output<BigInt(q.route_params.minOutputAmount))return;
  return {txHash:receipt.transactionHash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,intentHash:hash,inputRaw:input.toString(),outputRaw:output.toString(),finalizedAtBlock:finalized.toString()};
}
