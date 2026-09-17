// Operator recovery: read an already persisted claim hash, verify public chain
// evidence, and reconcile its existing row. Never creates a wallet request.
import {pathToFileURL} from 'node:url';
import {preflightEnvironment} from './live/environment.js';
import {loadConfig} from '../src/config/index.js';
import {SqliteStore} from '../src/database/store.js';
import {ClaimService} from '../src/claims/service.js';
import {SepoliaClaimChain,claimClient} from '../src/claims/chain.js';
import {claimAssert,ClaimError,equalAddress} from '../src/claims/protocol.js';
export async function reconcilePersistedClaim(root=process.cwd()){
  const env=preflightEnvironment(root),config=loadConfig(env);
  claimAssert((env.ENABLE_MAINNET??'false')==='false'&&(env.ENABLE_TESTNET_EXECUTION??'false')==='false'&&config.chainId===11155111&&config.wallet.users.length===1,'CLAIM_DISABLED');
  const store=new SqliteStore(config.databasePath,config.conversationTtlMs);
  try{
    const user=config.wallet.users[0]!,wallet=store.wallet.address(user);claimAssert(wallet,'WALLET_REQUIRED');
    const rows=store.claims.list(user).filter(r=>r.attempted&&r.tx_hash&&equalAddress(r.wallet,wallet));claimAssert(rows.length===1,'CLAIM_BUSY');
    const service=new ClaimService(store,new SepoliaClaimChain(claimClient(config.wallet.rpc)),config);
    const result=await service.reconcile(user,rows[0]!.id);
    return {state:result.state,transactionHash:result.txHash,wallet:wallet.slice(0,6)+'…'+wallet.slice(-4),balances:result.balances,evidence:result.evidence,error:result.error,mainnet:false,swapExecution:false};
  }finally{store.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.info(JSON.stringify(await reconcilePersistedClaim()));}
  catch(e){console.info(JSON.stringify({state:'RECONCILIATION_STOPPED',code:e instanceof ClaimError?e.code:'CLAIM_RPC'}));process.exitCode=1;}
}
