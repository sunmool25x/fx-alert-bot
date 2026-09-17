export const walletCardText={
  ko:{title:"내 지갑",emptyTitle:"지갑",empty:"아직 연결된 지갑이 없어요.",intro:"테스트넷 거래를 준비하려면 외부 지갑을 연결해주세요.",privacy:"개인키와 시드 문구는 FX Alert Bot에 전달되지 않습니다.",connect:"지갑 연결",connected:"연결됨",network:"네트워크",status:"상태",address:"전체 지갑 주소",balance:"잔액 보기",disconnect:"연결 해제",readOnly:"조회 모드 · 거래 실행 꺼짐",authenticated:"Telegram에서 안전하게 연결했어요",details:"연결 정보"},
  en:{title:"My wallet",emptyTitle:"Wallet",empty:"No wallet connected yet.",intro:"Connect an external wallet to prepare a testnet trade.",privacy:"Your private key and seed phrase never reach FX Alert Bot.",connect:"Connect wallet",connected:"Connected",network:"Network",status:"Status",address:"Full wallet address",balance:"View balances",disconnect:"Disconnect",readOnly:"Read-only · Trading is off",authenticated:"Securely connected through Telegram",details:"Connection details"},
} as const;
export function walletCardModel(language:"ko"|"en",address?:string){
  const m=walletCardText[language];return {connected:!!address,title:address?m.title:m.emptyTitle,address:address??"",shortAddress:address?address.slice(0,6)+"…"+address.slice(-4):"",network:"Sepolia Testnet"};
}
export function renderWalletCard(root:HTMLElement,language:"ko"|"en",address:string|undefined,actions:{connect:()=>void;balance:()=>void;disconnect:()=>void;ready?:boolean}){
  const m=walletCardText[language],model=walletCardModel(language,address);root.replaceChildren();root.className="wallet-card";root.dataset.connected=String(model.connected);
  const node=(tag:string,text:string,style="")=>{const el=document.createElement(tag);el.textContent=text;if(style)el.className=style;root.append(el);return el;};
  const emblem=node("span","","wallet-emblem");emblem.setAttribute("aria-hidden","true");
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("width","27");svg.setAttribute("height","27");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.6");svg.setAttribute("stroke-linejoin","round");
  const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d","M3 9V5a2 2 0 0 1 2-2h13v4M21 12h-5v5h5");
  const rect=document.createElementNS("http://www.w3.org/2000/svg","rect");rect.setAttribute("x","3");rect.setAttribute("y","7");rect.setAttribute("width","18");rect.setAttribute("height","14");rect.setAttribute("rx","2");svg.append(rect,path);emblem.append(svg);node("h2",model.title);
  const button=(text:string,action:()=>void,style:string)=>{const b=document.createElement("button");b.type="button";b.textContent=text;b.className=style;b.onclick=action;root.append(b);return b;};
  if(model.connected){
    node("p",model.shortAddress,"wallet-address");
    const details=document.createElement("details"),summary=document.createElement("summary");summary.textContent=m.address;const full=document.createElement("p");full.className="full-address";full.textContent=model.address;details.append(summary,full);root.append(details);
    const list=document.createElement("dl");for(const [label,value] of [[m.network,model.network],[m.status,m.connected]]){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label!;dd.textContent=value!;if(label===m.status)dd.className="connected-status";list.append(dt,dd);}root.append(list);
    button(m.balance,actions.balance,"primary");button(m.disconnect,actions.disconnect,"text-button");
  }else{
    node("p",m.empty,"card-lead");node("p",m.intro,"card-copy");node("p",m.privacy,"sheet-note");button(m.connect,actions.connect,"primary").disabled=actions.ready===false;
  }
}
