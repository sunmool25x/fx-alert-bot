import type { Language } from "../database/store.js";
export const walletText={
  ko:{
    emptyTitle:"👛 지갑",connectedLabel:"● 연결됨",manage:"내 지갑 보기",balanceButton:"잔액 보기",connectedSafety:"개인키나 시드 문구는 봇에 전달되지 않으며, 승인은 연결한 지갑에서 직접 진행합니다.",
    attribution: "Testnet trading powered by Sera Protocol",
    infrastructure: "이 거래는 Sera Protocol을 통해 처리됩니다.",title:"👛 내 지갑 · 테스트넷",network:"Sepolia 테스트넷",safety:"테스트 거래를 하려면 외부 지갑을 연결해야 합니다.\n\n개인키나 시드 문구는 봇에 전달되지 않으며,\n승인은 연결한 지갑에서 직접 진행합니다.",
    preview:"🧪 테스트 거래 준비 · 조회 전용\n이 Quote는 서명하거나 제출할 수 없습니다.",enabled:"테스트 거래 실행 활성화 · Sepolia만 지원",switchChain:"Sepolia로 전환",authenticated:"Telegram 본인 확인 완료",returned:"지갑 앱에서 돌아왔습니다. 진행 상태를 확인해 주세요.",
    steps:"거래를 계속하면 지갑에서 두 번 승인합니다.\n1. 이번 금액의 토큰 사용 승인 (Permit)\n2. 이번 교환 승인 (Intent)\n단순 로그인이 아닌 금융 승인입니다.",actualOutput:"확인된 수령액",actualInput:"확인된 사용액",explorer:"Sepolia 거래 보기",submitting:"테스트 거래를 제출하고 있습니다.",
    disabled:"현재는 조회 모드입니다.\n테스트넷 거래 기능은 아직 활성화되지 않았습니다. (조회 전용)",
    setup:"지갑 연결 준비가 아직 끝나지 않았어요. 지금은 환율과 알림을 이용할 수 있습니다. 연결 설정은 운영자가 확인해야 합니다.",
    connect:"지갑 연결",disconnect:"지갑 연결 해제",continue:"테스트 거래 계속",unlinked:"아직 연결된 지갑이 없어요.",
    disconnected:"지갑 연결을 해제하고 아직 제출하지 않은 거래를 취소했습니다. 이미 제출한 거래나 온체인 승인은 취소되지 않습니다.",
    balance:"내 지갑 잔액 · Sepolia (Vault 잔액 제외)",balanceRead:"잔액 새로 확인",prepare:"내 지갑의 최신 Quote 확인",confirm:"거래 조건 확인",cancel:"취소",refresh:"상태 새로 확인",
    ownership:"지갑 소유 확인 서명 (거래 승인 아님)",permit:"토큰 사용 승인",intent:"이번 교환 승인",submit:"서명한 교환 제출",
    changed:"알림 이후 시장 상황이 달라졌을 수 있습니다. 만료되면 새 Quote를 받아 다시 확인해야 합니다.",
    minimum:"최소 수령액",maximum:"최대 승인 금액",recipient:"받는 주소",wallet:"확인한 지갑",spend:"바꿀 금액",expiry:"Quote 만료",deadline:"교환 승인 기한",
    cost:"제공된 가스 비용 (USD)",unknownCost:"세부 비용은 제공되지 않았습니다.",costNote:"표시된 비용이 전체 비용 내역을 뜻하지는 않습니다. 수령액에서 다시 빼지 않습니다.",
    protection:"최소 수령액이 가격 보호 조건입니다. 별도 슬리피지 비율과 총 유동성은 제공되지 않았습니다.",
    consent:"이 화면의 금액과 주소를 확인했습니다. 다음 지갑 요청은 이번 교환에만 적용됩니다.",
    openTelegram:"Telegram 개인 대화의 지갑 버튼에서 열어 주세요. 외부 브라우저 링크만으로 로그인할 수 없습니다.",
    pending:"거래 요청은 접수됐지만 체결 완료는 아직 확인되지 않았습니다.",unknown:"거래 결과를 확인 중입니다. 중복 거래를 막기 위해 다시 제출하지 않습니다.",
    completed:"테스트넷 교환이 완료되었습니다.",rejected:"지갑 요청을 취소했거나 승인하지 않았습니다. 거래는 제출하지 않았습니다.",
    error:"요청을 처리하지 못했습니다. 거래 상태를 확인해 주세요.",
  },
  en:{
    emptyTitle:"👛 Wallet",connectedLabel:"● Connected",manage:"View my wallet",balanceButton:"View balances",connectedSafety:"Your private key and seed phrase never reach the bot. You approve each action directly in your connected wallet.",
    attribution: "Testnet trading powered by Sera Protocol",
    infrastructure: "This trade is processed through Sera Protocol.",title:"👛 My testnet wallet",network:"Sepolia testnet",safety:"Connect an external wallet to prepare a test trade.\n\nYour private key and seed phrase never reach the bot.\nYou approve each action directly in your connected wallet.",
    preview:"🧪 Test trade preparation · READ-ONLY\nThis quote cannot be signed or submitted.",enabled:"EXECUTION ENABLED · Sepolia only",switchChain:"Switch to Sepolia",authenticated:"Telegram identity verified",returned:"Returned from wallet. Check the current step.",
    steps:"Continuing requires two wallet approvals:\n1. Token use for this amount (Permit)\n2. This swap (Intent)\nThese are financial authorizations, not login.",actualOutput:"Verified received",actualInput:"Verified spent",explorer:"View Sepolia transaction",submitting:"Submitting the test trade.",
    disabled:"Read-only mode. Testnet execution has not been enabled.",setup:"Wallet connection isn't ready yet. You can still check rates and use alerts. The operator needs to complete the connection setup.",
    connect:"Connect wallet",disconnect:"Disconnect wallet",continue:"Continue test trade",unlinked:"You haven't connected a wallet yet.",
    disconnected:"Disconnected and cancelled local unsubmitted trades. This does not revoke on-chain approvals or cancel submitted trades.",
    balance:"My wallet balances · Sepolia (excludes Vault)",balanceRead:"Refresh balances",prepare:"Check fresh wallet quote",confirm:"Confirm trade terms",cancel:"Cancel",refresh:"Refresh status",
    ownership:"Verify wallet ownership (not trade authorization)",permit:"Authorize token use",intent:"Authorize this swap",submit:"Submit signed swap",
    changed:"Market conditions may have changed since the alert. An expired quote requires a new review and authorization.",
    minimum:"Minimum received",maximum:"Maximum authorized input",recipient:"Receiving address",wallet:"Verified wallet",spend:"Input",expiry:"Quote expires",deadline:"Swap authorization deadline",
    cost:"Provided gas cost (USD)",unknownCost:"Detailed costs were not provided.",costNote:"These items may not describe every cost. Do not subtract them again from output.",
    protection:"The minimum received is your price protection. Separate slippage percentage and total liquidity were not provided.",
    consent:"I checked these amounts and addresses. The following wallet requests authorize this swap only.",
    openTelegram:"Open from the wallet button in a private Telegram chat. An external browser link alone cannot sign you in.",
    pending:"The request was accepted, but completed settlement has not been verified.",unknown:"The outcome is being checked. We will not resubmit and risk a duplicate trade.",
    completed:"Testnet swap completed.",rejected:"The wallet request was rejected or cancelled. No trade was submitted.",error:"The request failed. Check the trade status.",
  }
} as const;
const reasons:Record<string,[string,string]>={
  WALLET_CONNECT_CANCELLED:["지갑 연결을 취소했거나 연결하지 못했습니다. 지갑 연결 버튼으로 다시 시도해 주세요.","Wallet connection was cancelled or failed. Use Connect wallet to try again."],
  OWNERSHIP_REJECTED:["소유 확인 서명을 취소했습니다. 지갑은 연결되지 않았습니다. 지갑 연결을 다시 눌러 주세요.","Ownership signature cancelled. No wallet was linked. Connect again."],
  PERMIT_REJECTED:["토큰 사용 승인을 취소했거나 완료하지 못했습니다. 제출하지 않았습니다. 새 Quote로 다시 시작해 주세요.","Token authorization was cancelled or failed. Nothing submitted. Start with a new quote."],
  INTENT_REJECTED:["교환 승인을 취소했거나 완료하지 못했습니다. 제출하지 않았습니다. 새 Quote로 다시 시작해 주세요.","Swap authorization was cancelled or failed. Nothing submitted. Start with a new quote."],
  RPC_UNAVAILABLE:["지갑 잔고 또는 네트워크를 확인하지 못했습니다. 잠시 후 상태를 다시 확인해 주세요.","Wallet balance or network read failed. Refresh status later."],
  RATE_LIMITED:["요청이 많습니다. 잠시 기다린 뒤 다시 확인해 주세요.","Too many requests. Wait before checking again."],
  EXECUTION_DISABLED:[walletText.ko.disabled,walletText.en.disabled],NOT_ALLOWLISTED:["이 계정은 테스트 거래 허용 목록에 없습니다.","This account is not on the test execution allowlist."],
  NO_LIQUIDITY:["현재 입력한 규모로 거래할 수 있는 Quote가 없습니다.","No executable quote is available at this size."],
  QUOTE_STALE:["Quote가 만료되었거나 조건이 바뀌었습니다. 새 Quote를 받고 다시 확인해 주세요.","The quote expired or changed. Obtain and review a new quote."],
  TRADE_STATE:["이 거래 화면은 더 이상 유효하지 않습니다. 상태를 확인해 주세요.","This trade screen is no longer valid. Check its status."],
  WALLET_BUSY:["이 지갑의 이전 거래 결과를 먼저 확인해야 합니다. 다시 제출하지 않습니다.","Resolve the wallet's existing trade first. It will not be resubmitted."],
  WALLET_REQUIRED:["지갑 소유 확인을 다시 진행해 주세요.","Verify wallet ownership again."],
  AUTH_INVALID:["본인 확인에 실패했습니다. Telegram에서 화면을 다시 열어 주세요.","Authentication failed. Reopen from Telegram."],
  AUTH_STALE:["로그인 시간이 만료되었습니다. Telegram에서 다시 열어 주세요.","Your session expired. Reopen from Telegram."],
  AUTH_REPLAY:["이미 사용한 확인 요청입니다. Telegram에서 다시 열어 주세요.","This authentication request was already used. Reopen from Telegram."],
  NETWORK_MISMATCH:["Sepolia 네트워크로 연결해 주세요.","Connect to Sepolia."],EOA_REQUIRED:["일반 테스트 지갑만 지원합니다. 스마트 지갑은 아직 지원하지 않습니다.","Only plain EOA test wallets are supported. Smart wallets are not supported."],
  UNSUPPORTED_TRADE:["현재 테스트 거래는 USDC → XSGD만 지원합니다.","Test execution currently supports only USDC → XSGD."],
  INSUFFICIENT_BALANCE:["테스트 USDC 잔고가 부족합니다. 자산을 구매하지 마세요.","Insufficient test USDC. Do not purchase assets."],
  TRADE_LIMIT:["설정된 테스트 USDC 금액 한도를 확인해 주세요 (최대 100).","Check the test USDC amount limit (maximum 100)."],
  INVALID_PERMIT:["토큰 승인 조건을 검증하지 못했습니다. 서명하거나 제출하지 않습니다.","Token authorization could not be verified. Signing/submission is blocked."],
  INVALID_SIGNATURE:["이번 교환의 지갑 서명이 일치하지 않습니다.","The wallet signature does not match this swap."],
  UNEXPECTED_CONTRACT:["Sera 계약 정보를 검증하지 못했습니다. 거래를 중단했습니다.","Sera contract validation failed. Trading stopped."],
  CLOCK_SKEW:["컴퓨터 시계를 동기화한 뒤 다시 확인해 주세요.","Synchronize the computer clock before continuing."],
};
export function walletError(lang:Language,code:string) {return reasons[code]?.[lang==="ko"?0:1]??walletText[lang].error;}
const diagnosticCodes=new Set(["OK","TG_SESSION_CREATED","MINI_APP_OPENED","WALLET_RETURNED","WALLET_CONNECTED","WALLET_CONNECT_STARTED","OWNERSHIP_VERIFIED","UNAVAILABLE","SUBMISSION_UNKNOWN","SETTLEMENT_PENDING",...Object.keys(reasons)]);
export const safeWalletCode=(code:string)=>diagnosticCodes.has(code)?code:"UNAVAILABLE";
export const walletFailure=(lang:Language,code:string)=>walletError(lang,safeWalletCode(code))+" ["+safeWalletCode(code)+"]";
export function stateText(lang:Language,state:string) {
  const m=walletText[lang];if(state==="CONFIRMED")return m.completed;if(state==="PENDING")return m.pending;
  if(state==="SUBMITTING")return m.submitting;
  if(state==="PREVIEW")return m.preview;
  if(state==="UNKNOWN")return m.unknown;
  const states:Record<string,[string,string]>={DRAFT:["거래 준비 중","Preparing"],REVIEW:["거래 조건 확인 대기","Awaiting review"],SIGNATURES:["지갑 승인 대기","Awaiting wallet authorization"],FAILED:["거래 요청 실패","Request failed"],EXPIRED:["Quote 만료 · 새 확인 필요","Expired · new review required"],CANCELLED:["제출 전 취소","Cancelled before submission"]};
  return states[state]?.[lang==="ko"?0:1]??m.unknown;
}
