import type { Market,Token } from "../sera/schemas.js";
export type IntentType="RATE_QUERY"|"QUOTE_QUERY"|"CREATE_RATE_ALERT"|"CREATE_MOVEMENT_ALERT"|"SHOW_ALPHA"|"SHOW_ALERTS"|"PREPARE_SWAP"|"HELP_OR_UNKNOWN";
export type Pair={base:string;quote:string};
export type ActionOrigin="command"|"button"|"natural_language";
export type Issue="unknown"|"unsupported_token"|"unsupported_pair"|"ambiguous"|"invalid_number"|"invalid_window";
export interface Intent {type:IntentType;pair?:Pair;amount?:string;threshold?:string;direction?:"RATE_ABOVE"|"RATE_BELOW";windowSeconds?:number;issue?:Issue}
export type Registry={tokens:Token[];markets:Market[]};
const unknown=(issue:Issue="unknown"):Intent=>({type:"HELP_OR_UNKNOWN",issue});
const normalize=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/g," ");
/** Strings only: financial precision is validated by the existing service, never Number/parseFloat. */
export function decimalText(s:string):string|undefined {
  return s.length<=100&&/^\d+(\.\d+)?$/.test(s)&&/[1-9]/.test(s)?s:undefined;
}
export function supportedPair(pair:Pair,registry:Registry):boolean {
  const a=registry.tokens.filter(t=>t.symbol.toUpperCase()===pair.base),b=registry.tokens.filter(t=>t.symbol.toUpperCase()===pair.quote);
  if(a.length!==1||b.length!==1||a[0]!.address.toLowerCase()===b[0]!.address.toLowerCase())return false;
  const from=a[0]!.address.toLowerCase(),to=b[0]!.address.toLowerCase();
  return registry.markets.some(m=>{const x=m.base_address.toLowerCase(),y=m.quote_address.toLowerCase();return (x===from&&y===to)||(x===to&&y===from);});
}
function entities(input:string,registry:Registry):{pair?:Pair;rest:string;issue?:Issue} {
  const symbols:string[]=[];let issue:Issue|undefined;
  // Mask recognized symbols before inspecting numbers (some supported symbols contain digits).
  const rest=input.replace(/[A-Za-z][A-Za-z0-9_-]*/g,(word,offset:number)=>{
    const upper=word.toUpperCase();
    if(["H","HR"].includes(upper)&&/\d\s*$/.test(input.slice(0,offset)))return word.toLowerCase();
    if(["FX","QUOTE"].includes(upper))return " ";
    const matches=registry.tokens.filter(t=>t.symbol.toUpperCase()===upper);
    if(matches.length!==1)issue=matches.length?"ambiguous":"unsupported_token";
    symbols.push(upper);return " ";
  });
  if(issue)return {rest,issue};
  if(symbols.length===1||symbols.length>2||symbols[0]===symbols[1]&&symbols.length===2)return {rest,issue:"ambiguous"};
  const pair=symbols.length===2?{base:symbols[0]!,quote:symbols[1]!}:undefined;
  if(pair&&!supportedPair(pair,registry))return {rest,issue:"unsupported_pair"};
  if(pair){
    const first=input.search(new RegExp(pair.base,"i")),suffix=input.slice(first+pair.base.length).trimStart();
    if(/^(으로|로)/.test(suffix))return {rest,issue:"ambiguous"}; // Destination-first phrasing needs clarification.
  }
  return {pair,rest};
}
export function pairReply(input:string,registry:Registry):Pair|undefined {
  const s=normalize(input),e=entities(s,registry);
  return !e.issue&&e.pair&&/^[\s/→>\-]*(?:에서|를|을|로|으로|가|기준)?[\s/→>\-]*$/.test(e.rest)?e.pair:undefined;
}
export function amountReply(input:string):string|undefined {
  return decimalText(normalize(input).replace(/\s*개(?:요)?$/,""));
}
export function parseKorean(input:string,registry:Registry):Intent {
  if(input.length>512)return unknown();
  const s=normalize(input),compact=s.replace(/\s/g,"");
  if(/[−–—]\s*\d/.test(s))return unknown("invalid_number");
  // This is an intent mapper, not an instruction-following agent. Refuse negated,
  // multiple-action and financial authorization language rather than extracting a fragment.
  if(/취소|삭제|하지마|않|싫|알리지마|말고|아니라|자동|서명|승인|실행|송금|보내줘|보장|무시|그리고|동시에|하지말/.test(compact))return unknown("ambiguous");
  if(/^(내알림보여줘|설정한알림뭐있어)[?!.]*$/.test(compact))return {type:"SHOW_ALERTS"};
  if(/^(지금볼만한(FX조건|거)(있어)?|지금FX조건뭐있어|시장움직임보여줘)[?!.]*$/i.test(compact))return {type:"SHOW_ALPHA"};
  const e=entities(s,registry);
  if(e.issue)return unknown(e.issue);
  const numbers=[...e.rest.matchAll(/[+-]?(?:\d[\d.,]*|\.\d+)(?:[eE][+-]?\d+)?/g)].map(m=>m[0]);
  if(numbers.some(n=>!decimalText(n)))return unknown("invalid_number");
  const alert=/알려|알림/.test(compact),movement=/움직|변동/.test(compact);
  const above=/넘으면|이상|보다\s*높으면|≥|>/.test(e.rest),below=/밑으로|이하|보다\s*낮으면|≤|</.test(e.rest);
  if(alert&&movement){
    if(/오르|내려|상승|하락|미만/.test(compact))return unknown("ambiguous"); // Existing movement alerts compare absolute change only.
    const percent=[...e.rest.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|퍼센트|퍼)/g)];
    const window=[...e.rest.matchAll(/(\d+)\s*(?:시간|hr|h)(?![a-z])/gi)];
    if(percent.length!==1||window.length!==1||numbers.length!==2||below)return unknown("ambiguous");
    const hours=window[0]![1]!;
    if(!["1","6","24"].includes(hours))return unknown("invalid_window");
    return {type:"CREATE_MOVEMENT_ALERT",pair:e.pair,threshold:percent[0]![1]!,windowSeconds:hours==="1"?3600:hours==="6"?21600:86400};
  }
  if(alert&&(above||below)){
    if(above&&below||numbers.length!==1||/%|퍼|시간/.test(e.rest))return unknown("ambiguous");
    return {type:"CREATE_RATE_ALERT",pair:e.pair,threshold:numbers[0]!,direction:above?"RATE_ABOVE":"RATE_BELOW"};
  }
  if(alert&&/좋아지|도달|오르|내려|높아지|낮아지|알림/.test(compact))return unknown("ambiguous");
  if(/환율/.test(compact)||/지금얼마야/.test(compact)){
    if(numbers.length||/알림|되면|넘으면|이상|이하|밑으로/.test(compact))return unknown("ambiguous");
    return {type:"RATE_QUERY",pair:e.pair};
  }
  const swap=/바꾸고싶|교환하고싶/.test(compact);
  const quote=/바꾸면|얼마받|얼마야|견적|quote|교환결과/i.test(compact)||/→/.test(s);
  if(swap||quote){
    if(numbers.length>1||/%|퍼|시간|이상|이하|넘으면|알림/.test(e.rest))return unknown("ambiguous");
    if(e.pair&&numbers.length){
      const base=e.pair.base.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),amount=numbers[0]!.replace(".","\\.");
      if(!new RegExp(`(?:^|\\s)${amount}\\s*${base}(?![A-Za-z0-9_-])|${base}\\s+${amount}(?![0-9.])`,"i").test(s))return unknown("ambiguous");
    }
    return {type:swap?"PREPARE_SWAP":"QUOTE_QUERY",pair:e.pair,amount:numbers[0]};
  }
  return unknown();
}
