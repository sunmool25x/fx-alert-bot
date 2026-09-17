import type { Store,User } from "../database/store.js";
import type { Config } from "../config/index.js";
import type { ChainReads } from "../wallet/chain.js";
import type { Output } from "./controller.js";
import { walletText,stateText } from "../i18n/wallet.js";
import { fromRawUnits } from "../sera/precision.js";
import { AppError } from "../utils/errors.js";
import { tradeView } from "../trades/view.js";
import { track } from "../analytics/actions.js";
import { entryFromOrigin } from "../analytics/types.js";
export class WalletController {
  constructor(private store:Store,private config:Config,private chain?:ChainReads,private reconcile?:(user:string)=>Promise<void>) {}
  async show(user:User,out:Output) {
    const m=walletText[user.language],wallet=this.store.wallet.address(user.id);
    const recent=this.store.wallet.list(user.id).map(row=>stateText(user.language,row.state)).join("\n");
    await out.reply({text:[wallet?m.title:m.emptyTitle,wallet??m.unlinked,wallet?m.network+" · "+m.connectedLabel:m.network,wallet?m.connectedSafety:m.safety,recent,this.config.wallet.enabled?"":m.disabled,"Telegram ID: "+user.id,m.attribution].filter(Boolean).join("\n\n"),
      buttons:[...(wallet?[[{text:m.balanceButton,data:"wallet:balance"}]]:[]),...(this.config.wallet.uiReady?[[{text:wallet?m.manage:m.connect,data:"wallet",webApp:this.config.wallet.origin}]]:[]),...(wallet?[[{text:m.disconnect,data:"wallet:disconnect"}]]:[]),...(recent?[[{text:m.refresh,data:"wallet:status"}]]:[])]});
    if(!this.config.wallet.ready)await out.reply({text:m.setup});
  }
  async status(user:User,out:Output) {
    await this.reconcile?.(user.id);
    const rows=this.store.wallet.list(user.id);
    if(!rows.length){await this.show(user,out);return;}
    const m=walletText[user.language];
    for(const row of rows){const view=tradeView(row,user.language);await out.reply({text:view.text,buttons:[[{text:m.refresh,data:"wallet:status"}],...(view.explorer?[[{text:m.explorer,data:"explorer",url:view.explorer}]]:[])]});}
  }
  async balance(user:User,out:Output) {
    const m=walletText[user.language],wallet=this.store.wallet.address(user.id);
    if(!wallet){await this.show(user,out);return;}
    if(!this.chain)throw new AppError("UNAVAILABLE");
    const rows=await this.chain.balances(wallet);
    await out.reply({text:m.balance+"\n"+wallet+"\n"+rows.map(r=>r.symbol+": "+fromRawUnits(r.amountRaw,r.decimals)).join("\n")});
  }
  async open(user:User,intentId:string,out:Output) {
    const m=walletText[user.language],intent=await this.store.intent(intentId,user.id);
    if(!intent)throw new AppError("TRADE_STATE");
    if(!this.config.wallet.ready){await out.reply({text:m.setup});return;}
    await out.reply({text:[m.safety,m.changed,m.infrastructure,m.attribution].join("\n\n"),buttons:[[{text:m.continue,data:"wallet",webApp:this.config.wallet.origin+"/#intent="+encodeURIComponent(intent.id)}]]});
    track(this.store,user,out,"trade_flow_started",{entry:entryFromOrigin(intent.origin),entityId:intent.id,parentId:intent.id,key:intent.id});
  }
  async disconnect(user:User,out:Output) {this.store.wallet.disconnect(user.id);await out.reply({text:walletText[user.language].disconnected});}
}
