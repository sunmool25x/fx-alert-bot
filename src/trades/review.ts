import type { Language } from "../database/store.js";
import type { Snapshot } from "./service.js";
import { fromRawUnits } from "../sera/precision.js";

export interface AuthorizationStep {id:"permit"|"intent";title:string;purpose:string;rows:[string,string][];notes:string[]}
export interface AuthorizationReview {title:string;rows:[string,string][];notes:string[];steps:AuthorizationStep[];technicalTitle:string;technical:[string,string][];footer:string}
export function authorizationReview(p:Snapshot,language:Language):AuthorizationReview {
  const ko=language==="ko",q=p.quote,r=q.route_params,permit=q.permit;
  const input=fromRawUnits(r.initialDepositAmount,6),maximum=fromRawUnits(r.maxInputAmount,6),minimum=fromRawUnits(r.minOutputAmount,6);
  const short=(a:string)=>a.slice(0,6)+"…"+a.slice(-4),date=(n:number)=>new Date(n*1000).toISOString();
  const rows:[string,string][]=[
    [ko?"교환 자산":"Pair","USDC → XSGD"],[ko?"보내기":"Input",input+" test USDC"],
    [ko?"예상 수령":"Expected receive",ko?"별도 예상 체결량은 제공되지 않았습니다.":"A separate expected fill was not provided."],
    [ko?"최소 수령":"Minimum receive",minimum+" test XSGD"],[ko?"네트워크":"Network","Sepolia Testnet"],
    [ko?"지갑":"Wallet",short(r.taker)],[ko?"받는 지갑":"Recipient",(ko?"같은 지갑 · ":"Same wallet · ")+short(r.recipient)],
    [ko?"최대 사용 금액":"Maximum token spend",maximum+" USDC"],
    [ko?"제공된 실행 비용":"Quoted execution cost",q.fee_breakdown?.gas_cost_from_token!==undefined?q.fee_breakdown.gas_cost_from_token+" USDC":ko?"제공되지 않음":"Not provided"],
    [ko?"비용의 USD 참고값":"Cost in USD reference",q.fee_breakdown?.gas_cost_usd??(ko?"제공되지 않음":"Not provided")],
    [ko?"Quote 만료":"Quote expiry",date(q.expires_at)],
  ];
  const steps:AuthorizationStep[]=[
    {id:"permit",title:ko?"1/2 · USDC 사용 승인":"1/2 · Authorize USDC use",purpose:ko?"Sera의 거래 계약이 정해진 USDC 금액을 사용할 수 있도록 서명합니다.":"Authorize the Sera swap contract to use the specified USDC amount.",
      rows:[[ko?"토큰":"Token","Sepolia test USDC"],[ko?"최대 승인 금액":"Maximum allowance",fromRawUnits(permit.value_raw,6)+" USDC"],
        [ko?"사용 승인 대상":"Spender",short(permit.spender)],[ko?"서명 제출 기한":"Signature submission deadline",date(permit.eip712.message.deadline)],
        [ko?"수령인 지정":"Recipient binding",ko?"Permit에는 수령인이 없습니다. 다음 Intent에서 지정합니다.":"Permit has no recipient field. The next Intent binds the recipient."],[ko?"네트워크":"Network","Sepolia"]],
      notes:ko?["서명만으로 토큰이 이동하거나 교환이 실행되지는 않습니다. 릴레이어가 나중에 서명을 제출할 수 있습니다.","이 기한은 서명을 제출할 수 있는 기한입니다. 이미 온체인에 반영된 사용 한도가 그때 자동으로 없어지지는 않습니다.","Permit 자체는 교환 자산·최소 수령액·Quote ID를 지정하지 않습니다. 앱이 이번 Quote와 함께 묶어 검증합니다."]:
        ["Signing alone does not transfer tokens or execute a swap. A relayer can later submit the signature.","This is the deadline for submitting the signature. An allowance already recorded on-chain does not automatically expire then.","Permit itself does not bind the output token, minimum receive or quote ID. The app checks it together with this quote."]},
    {id:"intent",title:ko?"2/2 · 이번 교환 승인":"2/2 · Authorize this swap",purpose:ko?"보낼 금액·최소 수령액·수령인·기한을 지정해 이번 교환에 서명합니다.":"Sign this swap's input, minimum output, recipient and deadline.",
      rows:[[ko?"최대 보내기":"Maximum input",maximum+" USDC"],[ko?"최소 수령":"Minimum receive",minimum+" XSGD"],
        [ko?"받는 지갑":"Recipient",(ko?"같은 지갑 · ":"Same wallet · ")+short(r.recipient)],[ko?"교환 기한":"Swap deadline",date(r.deadline)],[ko?"네트워크":"Network","Sepolia"]],
      notes:ko?["소유 확인이나 로그인 서명이 아닌 금융 승인입니다.","이 화면은 자동 제출하지 않습니다. 두 서명 후 별도의 제출 버튼을 누르면 Sera 릴레이어에 한 번 전달합니다.","지갑이 직접 ETH 거래를 보내는 방식이 아닙니다. 릴레이어의 온체인 정산과 실제 토큰 수령까지 확인해야 완료입니다."]:
        ["This is financial authorization, separate from ownership verification or login.","This screen does not submit automatically. After both signatures, a separate Submit button sends them to Sera once.","Your wallet does not directly send an ETH transaction. Completion requires the relayer's on-chain settlement and actual token receipt."]},
  ];
  return {title:ko?"🧪 TESTNET · 교환 조건 확인":"🧪 TESTNET · Review swap terms",rows,steps,
    notes:ko?["소유 확인 서명은 로그인용입니다. 아래 두 서명은 별도의 금융 승인입니다.","제공된 비용은 Quote에 반영돼 있습니다. 최소 수령액에서 다시 빼지 않습니다.","Quote가 만료되면 새 조건을 조회하고 다시 확인해야 합니다. 이전 서명이나 확인을 재사용하지 않습니다."]:
      ["Ownership verification signs in to the app. The two authorizations below are separate financial approvals.","Quoted costs are already reflected in the quote. Do not subtract them again from minimum receive.","An expired quote requires fresh terms and a new review. Previous signatures and consent are not reused."],
    technicalTitle:ko?"계약·서명 기술 정보":"Contract and signature details",technical:[
      ["chainId","11155111"],["USDC",r.inputToken],["XSGD",r.outputToken],["Owner",r.taker],["Recipient",r.recipient],
      ["Permit spender (SOR)",permit.spender],["Permit token / verifying contract",permit.eip712.domain.verifyingContract],
      ["Permit domain",permit.eip712.domain.name+" / "+permit.eip712.domain.version],["Permit nonce",String(permit.nonce)],["Permit value (raw)",permit.value_raw],
      ["Intent verifying contract",p.deployment.sera_address],["Quote UUID",q.uuid],["Intent UUID",r.uuid],["Intent struct hash",p.intentHash],
      ["Wallet RPC","eth_signTypedData_v4 × 2"],["Relayer endpoint","POST https://api.testnet.sera.cx/api/v1/swap"],
      [ko?"지갑 직접 전송":"Wallet native send",ko?"없음 · 지갑용 to/data/value 요청을 만들지 않습니다.":"None · no wallet to/data/value request is constructed."],
      [ko?"정산 확인":"Settlement proof","IntentMatched + exact token transfers + finalized canonical receipt"],
    ],footer:"Testnet trading powered by Sera Protocol"};
}
