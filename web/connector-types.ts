import type { WalletProvider } from "./connection.js";
import type { WalletChoice,TelegramEnvironment } from "./routing.js";
export interface ConnectedProvider extends WalletProvider {
  disconnect():Promise<void>;
  on(event:string,listener:(...args:any[])=>void):unknown;
}
export interface WalletConnection {
  readonly choice:WalletChoice;
  readonly environment:TelegramEnvironment;
  handoffUri?:string;
  start(onUri:(uri:string)=>void,onExpired:()=>void):Promise<ConnectedProvider>;
  assert():void;
  assertActive():void;
  cancel():void;
}
