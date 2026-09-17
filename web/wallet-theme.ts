export type TelegramTheme={colorScheme?:string;themeParams?:Record<string,unknown>;onEvent?:(name:string,handler:()=>void)=>void;offEvent?:(name:string,handler:()=>void)=>void};
const properties:Record<string,string>={bg_color:"--tg-theme-bg-color",secondary_bg_color:"--tg-theme-secondary-bg-color",text_color:"--tg-theme-text-color",hint_color:"--tg-theme-hint-color",button_color:"--tg-theme-button-color",button_text_color:"--tg-theme-button-text-color",link_color:"--tg-theme-link-color"};
export function themeValues(theme:TelegramTheme){
  const values:Record<string,string>={};for(const [key,css] of Object.entries(properties)){const value=theme.themeParams?.[key];if(typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value))values[css]=value;}
  return {scheme:theme.colorScheme==="dark"?"dark":"light",values};
}
export function bindWalletTheme(theme?:TelegramTheme,root:HTMLElement=document.documentElement){
  if(!theme)return ()=>{};
  const apply=()=>{const {scheme,values}=themeValues(theme);root.dataset.theme=scheme;for(const css of Object.values(properties)){root.style.removeProperty(css);if(values[css])root.style.setProperty(css,values[css]);}};
  apply();theme.onEvent?.("themeChanged",apply);return ()=>theme.offEvent?.("themeChanged",apply);
}
