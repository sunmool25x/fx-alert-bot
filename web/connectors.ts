import { RoutedConnection,createRoutedProvider } from "./routing-client.js";
import { OkxConnection } from "./okx-connector.js";
import type { WalletChoice,TelegramEnvironment } from "./routing.js";
import type { WalletConnection } from "./connector-types.js";
import { assertWalletOrigin,assertWalletMetadata } from "./wallet-trust.js";
export function createWalletConnection(choice:WalletChoice,environment:TelegramEnvironment,config:{projectId:string;origin:string},currentOrigin=()=>location.origin):WalletConnection {
  const guard=()=>{assertWalletOrigin(config.origin,currentOrigin());};guard();
  if(choice==="okx")return new OkxConnection(environment,undefined,guard);
  const reown=new RoutedConnection(choice,environment,guard,s=>assertWalletMetadata(s?.self.metadata,config.origin,environment));
  return {choice,environment,
    start:(onUri,onExpired)=>reown.start(()=>createRoutedProvider(config.projectId,config.origin,environment),onUri,onExpired),
    assert:()=>reown.assert(),assertActive:()=>reown.assertActive(),cancel:()=>reown.cancel(),
  };
}
