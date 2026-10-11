import{checkWallet,WalletFlowError,type WalletProvider,type WalletApi}from'./connection.js';
/** One explicit owner tap; no resizing, retries, wallet requests or financial API calls. */
export async function requestTwoUsdcPreview(id:string,claimedWallet:string,o:{api:WalletApi;provider:()=>WalletProvider|undefined;owner:()=>string;epoch:()=>number;swapsEnabled:()=>boolean;originGuard:()=>void}){
  const provider=o.provider(),wallet=o.owner(),epoch=o.epoch();
  const check=()=>{o.originGuard();if(o.swapsEnabled())throw new WalletFlowError('EXECUTION_DISABLED');if(provider!==o.provider()||epoch!==o.epoch()||wallet!==o.owner()||wallet.toLowerCase()!==claimedWallet.toLowerCase())throw new WalletFlowError('WALLET_REQUIRED');checkWallet(provider,wallet);};
  check();const value=await o.api('claim/preview',{id,amount:'2'});check();
  if(value.state!=='PREVIEW'||value.version!==null||value.financialAuthorizationAvailable!==false)throw new WalletFlowError('TRADE_STATE');return value;
}
