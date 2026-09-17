import { RoutedConnection,createRoutedProvider } from "./routing-client.js";
import { OkxConnection } from "./okx-connector.js";
import type { WalletChoice,TelegramEnvironment } from "./routing.js";
import type { WalletConnection } from "./connector-types.js";
export function createWalletConnection(choice:WalletChoice,environment:TelegramEnvironment,config:{projectId:string;origin:string}):WalletConnection {
  if(choice==="okx")return new OkxConnection(environment);
  const reown=new RoutedConnection(choice,environment);
  return {choice,environment,
    start:(onUri,onExpired)=>reown.start(()=>createRoutedProvider(config.projectId,config.origin,environment),onUri,onExpired),
    assert:()=>reown.assert(),assertActive:()=>reown.attempt.assertActive(),cancel:()=>reown.cancel(),
  };
}
