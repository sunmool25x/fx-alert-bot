import {formatEther,formatUnits} from 'viem';
import {FAUCET,CLAIM_DATA,ClaimError,type ClaimView} from '../src/claims/protocol.js';
import {walletError,safeWalletCode} from '../src/i18n/wallet.js';
import {ClaimFlow} from './claim-flow.js';
import {claimStatus,ClaimStatusPolling} from './claim-status.js';
import {WalletFlowError,type WalletApi,type WalletProvider} from './connection.js';
export const claimCopy={
  ko:{title:'무료 Sepolia 테스트 자금 받기',review:'TESTNET CLAIM · 수령 내용 확인',prepare:'수령 내용 확인',continue:'OKX에서 수령 확인',cancel:'취소',details:'기술 정보',network:'네트워크',wallet:'수령 지갑',contract:'수령 계약',action:'동작',value:'보내는 ETH',receive:'예상 수령',gas:'최대 예상 가스비',note:'테스트 전용 자금입니다. ETH 0.01개와 여러 테스트 토큰이 함께 지급됩니다. 수령량은 고정이며 가스비는 별도로 지불합니다. 실제 수령은 온체인 확인 후 확정됩니다.',pending:'지갑에서 수령 내용을 확인해 주세요. 거절·연결 끊김·응답 지연 시 자동 재요청하지 않습니다.',refresh:'수령 상태 확인',reopen:'OKX 다시 열기',hash:'응답을 놓쳤다면 거래 해시로 확인',verify:'거래 확인',success:'테스트 토큰 수령 확인 완료',preview:'1 테스트 USDC → XSGD 최신 Quote 확인',wait:'최종 확정과 토큰 잔액을 확인 중입니다.',connect:'연결된 OKX 지갑의 소유 확인을 완료하면 수령 내용을 볼 수 있어요.',attribution:'Testnet funding powered by Sera Protocol'},
  en:{title:'Get free Sepolia test funds',review:'TESTNET CLAIM · Review',prepare:'Review test funding',continue:'Continue to OKX',cancel:'Cancel',details:'Technical details',network:'Network',wallet:'Receiving wallet',contract:'Faucet contract',action:'Action',value:'ETH sent',receive:'Expected receive',gas:'Maximum estimated gas cost',note:'Test funds only. The fixed bundle includes 0.01 ETH and multiple test tokens. Gas is paid separately. Actual receipt requires on-chain verification.',pending:'Review the claim in your wallet. Rejection, connection loss or a missing response never causes an automatic retry.',refresh:'Check claim status',reopen:'Reopen OKX',hash:'If the response was lost, enter the transaction hash',verify:'Verify transaction',success:'Test token balances verified',preview:'Check fresh 1 test USDC → XSGD quote',wait:'Checking finality and actual token balances.',connect:'Verify ownership of your connected OKX wallet to review the claim.',attribution:'Testnet funding powered by Sera Protocol'}
} as const;
export const tokenAmount=(raw:string)=>formatUnits(BigInt(raw),6).replace(/^\d+/,whole=>whole.replace(/\B(?=(\d{3})+(?!\d))/g,','));
export const claimReceived=(raw:string,language:'ko'|'en')=>raw==='1000000000000000'?(language==='ko'?'10억':'1 billion'):tokenAmount(raw);
export function claimPanel(o:{root:HTMLElement;language:'ko'|'en';api:WalletApi;provider:()=>WalletProvider|undefined;owner:()=>string;epoch:()=>number;swapsEnabled:()=>boolean;originGuard:()=>void;ready:()=>boolean;handoff:()=>void;pending:(v:boolean)=>void;preview:(value:any)=>void}){
  const m=claimCopy[o.language],flow=new ClaimFlow(o.api,o.provider,o.owner,o.epoch,o.swapsEnabled,o.originGuard);
  let generation=0,working=false,active:ClaimView|undefined,prepareButton:HTMLButtonElement|undefined;
  const polling=new ClaimStatusPolling();
  const message=document.createElement('p');message.setAttribute('role','status');
  const controls=document.createElement('div'),review=document.createElement('section');o.root.append(controls,message,review);
  const paragraph=(parent:HTMLElement,value:string)=>{const p=document.createElement('p');p.textContent=value;parent.append(p);};
  const error=(e:unknown)=>{const code=e instanceof WalletFlowError||e instanceof ClaimError?safeWalletCode(e.code):'UNAVAILABLE';if(['AUTH_STALE','AUTH_INVALID','WALLET_REQUIRED'].includes(code))polling.stop();message.textContent=walletError(o.language,code)+' ['+code+']';};
  const button=(parent:HTMLElement,title:string,action:()=>Promise<void>|void)=>{
    const b=document.createElement('button');b.type='button';b.textContent=title;parent.append(b);
    b.onclick=()=>{if(working)return;working=true;b.disabled=true;message.textContent='';void Promise.resolve().then(action).catch(error).finally(()=>{working=false;if(b.isConnected)b.disabled=false;});};return b;
  };
  const draw=(r:ClaimView)=>{
    active=r;if(prepareButton)prepareButton.hidden=r.attempted;review.replaceChildren();const h=document.createElement('h3');h.textContent=r.state==='CLAIM_BALANCES_VERIFIED'?m.success:m.review;review.append(h);
    paragraph(review,m.network+': Sepolia');paragraph(review,m.wallet+': '+r.wallet.slice(0,6)+'…'+r.wallet.slice(-4));
    const snap=r.snapshot;
    if(snap){
      paragraph(review,m.contract+': '+FAUCET.slice(0,6)+'…'+FAUCET.slice(-5));paragraph(review,m.action+': claim()');paragraph(review,m.value+': 0');
      paragraph(review,m.receive+':\n'+claimReceived(snap.receive.usdc,o.language)+' test USDC\n'+claimReceived(snap.receive.xsgd,o.language)+' test XSGD\n'+formatEther(BigInt(snap.receive.eth))+' Sepolia ETH');
      paragraph(review,m.gas+': '+formatEther(BigInt(snap.transaction.gas)*BigInt(snap.transaction.maxFeePerGas))+' Sepolia ETH');paragraph(review,m.note);
      const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent=m.details;
      pre.textContent='Chain ID: 11155111\nFrom: '+r.wallet+'\nTo: '+FAUCET+'\nFunction: claim()\nCalldata: '+CLAIM_DATA+'\nValue: 0 wei\nGas limit: '+BigInt(snap.transaction.gas)+'\nMax fee/gas: '+BigInt(snap.transaction.maxFeePerGas)+' wei\nPriority fee/gas: '+BigInt(snap.transaction.maxPriorityFeePerGas)+' wei\nNonce: '+BigInt(snap.transaction.nonce)+'\nSimulation block: '+snap.block+'\nRaw USDC/XSGD allocation each: '+snap.receive.usdc;
      details.append(summary,pre);review.append(details);
    }
    if(r.state==='CLAIM_SIMULATED'&&!r.attempted){
      button(review,m.continue,async()=>{
        if(Date.now()>=r.expiresAt)throw new WalletFlowError('CLAIM_STALE');
        if(!o.ready())throw new WalletFlowError('WALLET_REQUIRED');
        const current=generation;
        // Remove the consumed review action before any asynchronous work.
        draw({...r,state:'CLAIM_USER_CONFIRMED',attempted:true});o.pending(true);
        try{const result=await flow.send(r,()=>{if(current===generation){message.textContent=m.pending;o.handoff();}});if(current===generation)draw(result);}
        finally{o.pending(false);}
      });
      button(review,m.cancel,async()=>{draw(await o.api('claim/cancel',{id:r.id}));});
    }
    if(r.attempted){
      if(r.error)paragraph(review,walletError(o.language,r.error));
      if(r.txHash&&/^0x[0-9a-fA-F]{64}$/.test(r.txHash)){const a=document.createElement('a');a.href='https://sepolia.etherscan.io/tx/'+r.txHash;a.textContent=o.language==='ko'?'Sepolia에서 거래 보기':'View transaction on Sepolia';a.target='_blank';a.rel='noopener noreferrer';review.append(a);}
      if(r.balances)paragraph(review,'Sepolia ETH: '+formatEther(BigInt(r.balances.eth))+'\nTest USDC: '+tokenAmount(r.balances.usdc)+'\nTest XSGD: '+tokenAmount(r.balances.xsgd));
      if(r.state==='CLAIM_BALANCES_VERIFIED'){
        paragraph(review,o.language==='ko'?'거래가 최종 확정됐으며 실제 수령을 확인했습니다.':'Transaction finalized and actual receipt verified.');
        if(r.evidence){const e=r.evidence;
          paragraph(review,(o.language==='ko'?'수령 완료':'Received')+':\n'+claimReceived(e.usdc.receivedRaw,o.language)+' test USDC\n'+claimReceived(e.xsgd.receivedRaw,o.language)+' test XSGD\n'+formatEther(BigInt(e.nativeReceivedRaw))+' Sepolia ETH');
          paragraph(review,(o.language==='ko'?'실제 가스비: ':'Actual gas paid: ')+formatEther(BigInt(e.gasPaidRaw))+' Sepolia ETH');
          if(e.feeAdjusted)paragraph(review,o.language==='ko'?'지갑에서 가스 설정이 조정됐습니다. 총비용은 수령 검토 화면의 최대 가스비 이내이며, ETH 잔액에는 실제 가스비가 반영됐습니다.':'The wallet adjusted gas settings. Total cost stayed within the reviewed maximum; the ETH balance includes actual gas paid.');
        }
        button(review,m.preview,async()=>o.preview(await o.api('claim/preview',{id:r.id})));
      }
      else{
        if(claimStatus(r)==='pending')paragraph(review,o.language==='ko'?'온체인 수령 확인 중':'Verifying on-chain receipt');
        button(review,m.refresh,async()=>{draw(await o.api('claim/refresh',{id:r.id}));});
        if(!r.txHash){
          button(review,m.reopen,()=>o.handoff());
          const label=document.createElement('label'),input=document.createElement('input');label.textContent=m.hash;input.type='text';input.placeholder='0x…';input.autocomplete='off';input.maxLength=66;label.append(input);review.append(label);
          button(review,m.verify,async()=>{if(!/^0x[0-9a-fA-F]{64}$/.test(input.value))throw new WalletFlowError('CLAIM_INVALID');draw(await o.api('claim/report',{id:r.id,hash:input.value}));});
        }
      }
    }else if(r.error)paragraph(review,walletError(o.language,r.error));
    paragraph(review,m.attribution);
  };
  async function refresh(){
    if(!o.owner()){review.replaceChildren();active=undefined;return;}
    const current=generation;const result=await o.api('claim/list');
    if(current!==generation)return;const row=(result.claims as ClaimView[])[0];if(row)draw(row);
  }
  const title=document.createElement('h2');title.textContent=m.title;controls.append(title);
  prepareButton=button(controls,m.prepare,async()=>{if(!o.ready()||!o.owner())throw new WalletFlowError('WALLET_REQUIRED');const current=generation;const row=await o.api('claim/prepare');if(current===generation)draw(row);});
  button(controls,m.refresh,refresh);paragraph(controls,m.connect);
  // Read-only reconciliation only; no automatic confirmation or transaction request.
  setInterval(()=>{
    if(working||document.visibilityState!=='visible'||!o.owner()||!active||!['CLAIM_BROADCAST','CLAIM_MINED'].includes(active.state))return;
    if(!polling.take()){message.textContent=o.language==='ko'?'자동 확인을 마쳤습니다. 수령 상태 확인으로 기존 거래만 다시 조회할 수 있습니다.':'Automatic checking has stopped. Check claim status to re-read the existing transaction.';return;}
    working=true;const id=active.id,current=generation;
    void o.api('claim/refresh',{id}).then(r=>{if(current===generation&&active?.id===id)draw(r);}).catch(error).finally(()=>{working=false;});
  },20000);
  return {refresh,invalidate(){generation++;active=undefined;review.replaceChildren();message.textContent='';}};
}
