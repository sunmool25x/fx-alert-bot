import "@reown/appkit-ui/wui-qr-code";
import { createWalletConnection } from "./connectors.js";
import type { ConnectedProvider,WalletConnection } from "./connector-types.js";
import { clearLegacyWalletRouting,openWallet,telegramEnvironment,walletRoutes,type WalletChoice } from "./routing.js";
import { routingText,connectionError } from "./wallet-copy.js";
import { WalletFlow,supportedWallets,type WalletScreen } from "./wallet-flow.js";
import type { PreparedOwnership } from "./connection.js";
type Telegram={platform?:string;openLink?(url:string):void};
export function walletPicker(options:{root:HTMLElement;language:"ko"|"en";telegram:Telegram;projectId:string;origin:string;
  message:(text:string)=>void;error:(error:unknown)=>void;invalidate:()=>Promise<void>;
  connected:(provider:ConnectedProvider)=>void;prepare?:(provider:ConnectedProvider,guard:()=>void)=>Promise<PreparedOwnership>;
  verify:(provider:ConnectedProvider,guard:()=>void,onRequest:()=>void,prepared?:PreparedOwnership)=>Promise<void>;
  pending:(value:boolean)=>void;balance?:()=>void;started?:()=>void;
  createConnection?:(choice:WalletChoice)=>WalletConnection}) {
  const {root,language,telegram}=options,m=routingText[language],environment=telegramEnvironment(telegram.platform);
  const dialog=document.createElement("dialog");dialog.className="wallet-sheet";dialog.setAttribute("aria-labelledby","wallet-sheet-title");
  const bar=document.createElement("div");bar.className="sheet-bar";
  const title=document.createElement("h2");title.id="wallet-sheet-title";title.tabIndex=-1;
  const close=document.createElement("button");close.type="button";close.className="icon-button";close.textContent="×";close.setAttribute("aria-label",m.close);
  bar.append(title,close);
  const body=document.createElement("div");body.className="sheet-body";
  const status=document.createElement("p");status.className="sr-only";status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  dialog.append(bar,body,status);root.replaceChildren(dialog);
  let lastStep="",opener:HTMLElement|undefined;
  const paragraph=(text:string,style="sheet-copy")=>{const p=document.createElement("p");p.className=style;p.textContent=text;body.append(p);return p;};
  const button=(label:string,action:()=>void,style="secondary")=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.className=style;b.onclick=action;body.append(b);return b;};
  const icon=(choice:WalletChoice)=>{const i=document.createElement("span");i.className="wallet-monogram";i.textContent=choice==="okx"?"OKX":"M";i.setAttribute("aria-hidden","true");return i;}; // Text fallback, not a fabricated wallet logo.
  const spinner=()=>{const s=document.createElement("span");s.className="spinner";s.setAttribute("aria-hidden","true");body.append(s);};
  const dismiss=()=>{if(dialog.open)dialog.close();document.body.classList.remove("wallet-sheet-open");if(opener?.isConnected)opener.focus();else document.querySelector<HTMLElement>("#account button:not(:disabled)")?.focus();};
  function render(screen:WalletScreen){
    if(screen.step==="closed"){dismiss();lastStep=screen.step;return;}
    const changed=lastStep!==screen.step;lastStep=screen.step;
    if(!dialog.open){opener=document.activeElement instanceof HTMLElement?document.activeElement:undefined;dialog.showModal();document.body.classList.add("wallet-sheet-open");}
    dialog.dataset.step=screen.step;body.replaceChildren();body.classList.toggle("is-loading",screen.step==="preparing");
    const name=screen.choice?walletRoutes[screen.choice].name:"";
    title.textContent=screen.step==="selecting"?m.title:screen.step==="success"?m.success:screen.step==="error"?m.errorTitle:["ownership","verifying"].includes(screen.step)?m.ownershipTitle:name;
    if(screen.step==="selecting"){
      paragraph(m.choose);
      for(const choice of supportedWallets){
        const row=button(walletRoutes[choice].name,()=>{void flow.select(choice);},"wallet-option");row.disabled=!!screen.busy;
        const label=document.createElement("span");label.textContent=walletRoutes[choice].name;
        const chevron=document.createElement("span");chevron.className="chevron";chevron.textContent="›";chevron.setAttribute("aria-hidden","true");
        row.replaceChildren(icon(choice),label,chevron);
      }
      paragraph(m.privacy,"sheet-note privacy-note");button(m.cancelSelection,()=>{void flow.stop();},"text-button");
    }else if(screen.step==="error"){
      paragraph(connectionError(language,screen.code??"UNAVAILABLE"));
      if(!["AUTH_STALE","AUTH_INVALID","AUTH_REPLAY"].includes(screen.code??""))button(m.retry,()=>{void flow.choose();},"primary").disabled=!!screen.busy;
      button(m.close,()=>flow.close(),"text-button");
    }else if(screen.step==="success"){
      paragraph("✓","success-mark");paragraph(screen.address?screen.address.slice(0,6)+"…"+screen.address.slice(-4):"","wallet-address");
      paragraph("Sepolia Testnet","sheet-note");paragraph(m.successNote);
      if(options.balance)button(m.balance,()=>{flow.close();options.balance?.();},"primary");
      button(m.close,()=>flow.close(),"text-button");
    }else{
      if(screen.choice)body.append(icon(screen.choice));
      if(screen.step==="preparing"){spinner();paragraph(m.loading);}
      if(screen.step==="opening"||screen.step==="waiting"){
        const uri=screen.uri!;
        if(environment==="desktop"){
          paragraph(m.desktop(name));const qr=document.createElement("wui-qr-code");qr.uri=uri;qr.size=272;qr.theme="light";qr.alt=name;qr.arenaClear=true;qr.setAttribute("aria-label",name+" QR");body.append(qr);
        }else{
          paragraph(screen.step==="waiting"?m.waiting(name):m.mobile(name));
          if(screen.step==="waiting"){spinner();paragraph(m.return,"sheet-note");}
          button(m.open(name),()=>flow.handoff(),"primary");
          if(screen.step==="waiting")paragraph(m.appHelp,"sheet-note");
        }
        if(screen.choice==="okx")paragraph(m.okxVersion,"sheet-note version-note");
      }
      if(screen.step==="ownership"){
        paragraph(m.connected);paragraph(m.ownershipNote,"ownership-note");
        if(screen.busy){spinner();paragraph(m.verifying);}
        else button(m.verifyIn(name),()=>{void flow.verify();},"primary");
      }
      if(screen.step==="verifying"){
        spinner();paragraph(screen.busy?m.verifying:m.signing);paragraph(m.return,"sheet-note");
        if(environment!=="desktop"&&!screen.busy){paragraph(m.appHelp,"sheet-note");button(m.reopen(name),()=>flow.handoff(),"primary");}
      }
      button(m.change,()=>{void flow.choose();},"text-button");button(m.cancel,()=>{void flow.stop();},"text-button");
    }
    status.textContent=title.textContent+". "+(body.querySelector("p")?.textContent??"");
    if(changed){title.focus({preventScroll:true});if(!matchMedia("(prefers-reduced-motion: reduce)").matches)body.animate?.([{opacity:.6},{opacity:1}],{duration:120,easing:"ease-out"});}
    if(screen.step==="ownership"&&!screen.busy)body.querySelector<HTMLButtonElement>("button.primary")?.focus({preventScroll:true});
  }
  const flow=new WalletFlow({
    create:choice=>{try{options.started?.();}catch{/* Analytics cannot prevent wallet selection. */}return options.createConnection?.(choice)??createWalletConnection(choice,environment,options);},view:render,
    invalidate:options.invalidate,connected:options.connected,pending:options.pending,error:options.error,
    cancelled:()=>options.message(m.cancelled),
    prepare:options.prepare,
    verify:(p,guard,onRequest,prepared)=>options.verify(p,()=>{guard();clearLegacyWalletRouting(localStorage);},onRequest,prepared),
    open:(connection,uri)=>openWallet(connection.choice,environment,uri,{
      https:url=>{if(telegram.openLink)telegram.openLink(url);else window.open(url,"_blank","noopener,noreferrer");},
      native:url=>{window.open(url,"_blank","noopener,noreferrer");},
    }),
  });
  close.onclick=()=>flow.close();dialog.addEventListener("cancel",e=>{e.preventDefault();flow.close();});
  return {choose:()=>flow.choose(),cancel:()=>flow.cancel(),lost:()=>flow.lost()};
}
