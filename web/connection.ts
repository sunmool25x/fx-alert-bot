export interface WalletProvider {
  accounts:string[];chainId:number|string;session?:unknown;
  connect():Promise<unknown>;
  request(args:{method:string;params:unknown[]}):Promise<unknown>;
}
export class WalletFlowError extends Error {constructor(readonly code:string){super(code);}}
export type WalletApi=(path:string,body?:unknown)=>Promise<any>;
export type PreparedOwnership={verify:(onRequest?:()=>void)=>Promise<string>};
export async function connectAndVerify(provider:WalletProvider,api:WalletApi,epoch:()=>number,onConnected:()=>void=()=>{},routingGuard:()=>void=()=>{},onSignatureRequest:()=>void=()=>{}) {
  routingGuard();
  onConnected();
  const prepared=await prepareOwnership(provider,api,epoch,routingGuard);
  return prepared.verify(onSignatureRequest);
}
/** Fetch only: no wallet prompt. The proof stays bound to this account/session/epoch. */
export async function prepareOwnership(provider:WalletProvider,api:WalletApi,epoch:()=>number,routingGuard:()=>void=()=>{},now=Date.now):Promise<PreparedOwnership> {
  routingGuard();
  try {if(!provider.session)await provider.connect();} catch {throw new WalletFlowError("WALLET_CONNECT_CANCELLED");}
  routingGuard();
  const account=provider.accounts[0],start=epoch();
  if(Number(provider.chainId)!==11155111)throw new WalletFlowError("NETWORK_MISMATCH");
  if(!account)throw new WalletFlowError("WALLET_CONNECT_CANCELLED");
  const unchanged=()=>{
    routingGuard();
    if(Number(provider.chainId)!==11155111)throw new WalletFlowError("NETWORK_MISMATCH");
    if(epoch()!==start||provider.accounts[0]?.toLowerCase()!==account.toLowerCase())throw new WalletFlowError("WALLET_REQUIRED");
  };
  const started=now();
  const challenge=await api("challenge",{address:account,chainId:11155111});
  unchanged(); // A delayed challenge must not prompt the account that has since disconnected/changed.
  const message="0x"+Array.from(new TextEncoder().encode(challenge.message),b=>b.toString(16).padStart(2,"0")).join("");
  let used=false;
  return {verify:async(onRequest=()=>{})=>{
    unchanged();
    // Conservative local lifetime; backend nonce, expiry and session checks remain authoritative.
    if(used||now()-started>=90_000)throw new WalletFlowError("AUTH_STALE");
    used=true;
    let signature:unknown;
    try {
      const request=provider.request({method:"personal_sign",params:[message,account]});
      // No backend await between the user's tap, dispatch and mobile handoff.
      void request.catch(()=>{});
      onRequest();
      signature=await request;
    }catch {throw new WalletFlowError("OWNERSHIP_REJECTED");}
    unchanged();const result=await api("verify",{id:challenge.id,signature});unchanged();
    if(result.wallet?.toLowerCase()!==account.toLowerCase())throw new WalletFlowError("AUTH_INVALID");
    return result.wallet as string;
  }};
}
export async function switchSepolia(provider:WalletProvider) {
  try {await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:"0xaa36a7"}]});}
  catch {throw new WalletFlowError("NETWORK_MISMATCH");}
  if(Number(provider.chainId)!==11155111)throw new WalletFlowError("NETWORK_MISMATCH");
}
export function checkWallet(provider:WalletProvider|undefined,wallet:string,expiresAt?:number,now=Date.now()) {
  if(!provider||!wallet||provider.accounts[0]?.toLowerCase()!==wallet.toLowerCase())throw new WalletFlowError("WALLET_REQUIRED");
  if(Number(provider.chainId)!==11155111)throw new WalletFlowError("NETWORK_MISMATCH");
  if(expiresAt!==undefined&&now>=expiresAt)throw new WalletFlowError("QUOTE_STALE");
}
