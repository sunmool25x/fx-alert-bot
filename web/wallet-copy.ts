export const routingText={
  ko:{title:"지갑 연결",choose:"사용할 지갑을 선택해주세요.",loading:"안전하게 연결을 준비하고 있어요.",change:"다른 지갑 선택",cancel:"연결 취소",close:"닫기",retry:"다시 연결",back:"뒤로",cancelSelection:"취소",
    privacy:"개인키와 시드 문구는 FX Alert Bot에 전달되지 않습니다.",
    okxVersion:"OKX App 6.88.0 이상을 사용해주세요. 설치된 버전은 여기서 확인할 수 없어요.",
    mobile:(name:string)=>`${name}에서 계속하면 연결 승인 화면이 열려요.`,
    desktop:(name:string)=>`휴대폰의 ${name}에서 QR을 스캔해주세요. 지갑 안의 스캔 기능을 사용해주세요.`,
    open:(name:string)=>`${name}에서 계속`,waiting:(name:string)=>`${name}에서 연결을 승인해주세요.`,
    appHelp:"앱이 열리지 않았다면 아래 버튼으로 다시 열 수 있어요.",
    connected:"마지막으로 지갑 소유권만 확인하면 연결이 완료돼요.",ownershipTitle:"지갑 연결 확인",
    verifyIn:(name:string)=>`${name}에서 확인`,
    reopen:(name:string)=>`${name} 다시 열기`,
    ownershipNote:"이 서명은 지갑 소유권 확인용이며, 토큰을 이동하거나 거래를 실행하지 않습니다.",
    verify:"지갑에서 확인",signing:"지갑에서 확인 메시지에 서명해주세요.",verifying:"확인 메시지를 준비하고 있어요.",
    return:"승인이 끝나면 열어둔 Telegram 화면으로 돌아오세요.",
    cancelled:"지갑 연결을 취소했어요.",expired:"지갑 연결 시간이 만료됐어요. 다시 시도해주세요.",
    success:"지갑이 연결됐어요",successNote:"이제 잔액을 확인할 수 있어요.",balance:"잔액 보기",errorTitle:"연결을 마치지 못했어요",
    reload:"화면을 업데이트하고 있어요. 지갑 연결 중에는 업데이트를 미룹니다."},
  en:{title:"Connect wallet",choose:"Choose the wallet you want to use.",loading:"Preparing your secure connection.",change:"Choose another wallet",cancel:"Cancel connection",close:"Close",retry:"Try again",back:"Back",cancelSelection:"Cancel",
    privacy:"Your private key and seed phrase never reach FX Alert Bot.",
    okxVersion:"Use OKX App 6.88.0 or later. We cannot detect your installed version here.",
    mobile:(name:string)=>`Continue in ${name} to open connection approval.`,
    desktop:(name:string)=>`Scan with ${name} on your phone. Use the scanner inside your wallet.`,
    open:(name:string)=>`Continue in ${name}`,waiting:(name:string)=>`Approve the connection in ${name}.`,
    appHelp:"If the app did not open, use the button below to try again.",
    connected:"One last step: confirm that this wallet belongs to you.",ownershipTitle:"Verify your wallet",
    verifyIn:(name:string)=>`Verify in ${name}`,
    reopen:(name:string)=>`Reopen ${name}`,
    ownershipNote:"This signature only proves wallet ownership. It does not move tokens or execute a trade.",
    verify:"Verify in wallet",signing:"Review and sign the ownership message in your wallet.",verifying:"Preparing your ownership message.",
    return:"After approval, return to this open Telegram screen.",
    cancelled:"Wallet connection cancelled.",expired:"The connection timed out. Please try again.",
    success:"Your wallet is connected",successNote:"You can now check your balances.",balance:"View balances",errorTitle:"Connection not completed",
    reload:"Updating this screen. Updates wait while a wallet connection is in progress."},
} as const;
export function connectionError(language:"ko"|"en",code:string){
  const ko=language==="ko",m=routingText[language];
  if(code==="CONNECTION_TIMEOUT")return m.expired;
  if(code==="HANDOFF_FAILED")return ko?"지갑 앱을 열지 못했어요. 다시 연결해주세요.":"We could not open your wallet. Please try connecting again.";
  if(code==="NETWORK_MISMATCH")return ko?"지갑에서 Sepolia 테스트넷을 선택한 뒤 다시 연결해주세요.":"Choose Sepolia testnet in your wallet, then connect again.";
  if(code==="OWNERSHIP_REJECTED")return ko?"지갑 확인을 완료하지 못했어요. 서명을 취소했다면 다시 연결할 수 있어요.":"Wallet verification was not completed. You can reconnect if you declined the signature.";
  if(code==="CONNECTION_LOST"||code==="WALLET_REQUIRED")return ko?"지갑 연결이 변경되었거나 끊겼어요. 다시 연결해주세요.":"Your wallet connection changed or was lost. Please reconnect.";
  if(code==="WALLET_CONNECT_CANCELLED")return ko?"지갑 연결이 취소됐거나 완료되지 않았어요. 다시 시도할 수 있어요.":"The connection was cancelled or did not complete. You can try again.";
  if(code==="AUTH_STALE"||code==="AUTH_INVALID"||code==="AUTH_REPLAY")return ko?"Telegram에서 /wallet을 다시 보내 새 지갑 화면을 열어주세요.":"Send /wallet in Telegram again to open a fresh wallet screen.";
  return ko?"지금은 연결을 완료하지 못했어요. 잠시 후 다시 시도해주세요.":"We could not finish connecting. Please try again shortly.";
}
