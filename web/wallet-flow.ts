import { WalletFlowError,type PreparedOwnership } from "./connection.js";
import type { ConnectedProvider,WalletConnection } from "./connector-types.js";
import type { WalletChoice } from "./routing.js";
export const supportedWallets=["okx","metamask"] as const;
export type WalletStep="closed"|"selecting"|"preparing"|"opening"|"waiting"|"ownership"|"verifying"|"success"|"error";
export type WalletScreen={step:WalletStep;choice?:WalletChoice;uri?:string;address?:string;code?:string;busy?:boolean};
export interface WalletFlowOptions {
  create:(choice:WalletChoice)=>WalletConnection;view:(screen:WalletScreen)=>void;
  invalidate:()=>Promise<void>;connected:(provider:ConnectedProvider)=>void;
  prepare?:(provider:ConnectedProvider,guard:()=>void)=>Promise<PreparedOwnership>;
  verify:(provider:ConnectedProvider,guard:()=>void,onRequest:()=>void,prepared?:PreparedOwnership)=>Promise<void>;
  open:(connection:WalletConnection,uri?:string)=>void;pending:(value:boolean)=>void;
  error:(error:unknown)=>void;cancelled:()=>void;
}
/** Presentation state only; existing connectors and backend still enforce ownership. */
export class WalletFlow {
  private current?:WalletConnection;private provider?:ConnectedProvider;private generation=0;
  private prepared?:PreparedOwnership;
  screen:WalletScreen={step:"closed"};
  constructor(private options:WalletFlowOptions){}
  private show(screen:WalletScreen){this.screen=screen;this.options.view(screen);}
  private retire(){this.generation++;this.current?.cancel();this.current=undefined;this.provider=undefined;this.prepared=undefined;this.options.pending(false);}
  cancel(){this.retire();this.show({step:"closed"});}
  async stop(){this.cancel();try{await this.options.invalidate();this.options.cancelled();}catch(e){this.options.error(e);}}
  close(){if(this.screen.step==="success"){this.show({step:"closed"});return;}void this.stop();}
  async choose(){
    this.retire();const generation=this.generation;this.show({step:"selecting",busy:true});
    try{await this.options.invalidate();if(this.generation===generation)this.show({step:"selecting"});}
    catch(e){if(this.generation===generation)await this.fail(e);}
  }
  async select(choice:WalletChoice){
    if(this.screen.step!=="selecting"||this.screen.busy)return;
    this.retire();const generation=this.generation,connection=this.options.create(choice);this.current=connection;
    const current=()=>generation===this.generation&&this.current===connection;
    this.options.pending(true);this.show({step:"preparing",choice});
    try{
      await this.options.invalidate();if(!current())return;
      const provider=await connection.start(uri=>{if(current())this.show({step:"opening",choice,uri});},()=>{
        if(current())void this.fail(new WalletFlowError("CONNECTION_TIMEOUT"));
      });
      if(!current()){connection.cancel();return;}
      this.provider=provider;this.options.connected(provider);
      if(this.options.prepare){
        this.show({step:"ownership",choice,busy:true});
        const prepared=await this.options.prepare(provider,()=>{if(!current())connection.cancel();connection.assert();});
        if(!current())return;this.prepared=prepared;
      }
      this.options.pending(false);this.show({step:"ownership",choice});
    }catch(e){if(current())await this.fail(e);}
  }
  handoff(){
    if(!this.current||!["opening","waiting","verifying"].includes(this.screen.step))return;
    try{
      this.current.assertActive();
      // Keep this synchronous inside the user's tap; relay setup already finished.
      this.options.open(this.current,this.screen.uri??this.current.handoffUri);
      if(this.screen.step!=="verifying")this.show({...this.screen,step:"waiting"});
    }catch(e){void this.fail(e,"HANDOFF_FAILED");}
  }
  async verify(){
    if(this.screen.step!=="ownership"||this.screen.busy||!this.current||!this.provider)return;
    const connection=this.current,provider=this.provider,generation=this.generation,choice=this.screen.choice;
    const current=()=>generation===this.generation&&this.current===connection;
    this.options.pending(true);this.show({step:"verifying",choice,busy:true});
    try{
      await this.options.verify(provider,()=>{if(!current())connection.cancel();connection.assert();},()=>{
        if(current()){
          this.show({step:"verifying",choice,busy:false});
          // Prepared proof dispatch runs synchronously in the same explicit tap.
          // The existing SDK/session route is reused; no new pairing is created.
          if(this.prepared&&connection.environment!=="desktop")this.handoff();
        }
      },this.prepared);
      if(current()){this.options.pending(false);this.show({step:"success",choice,address:provider.accounts[0]});}
    }catch(e){if(current())await this.fail(e);}
  }
  lost(){const visible=this.screen.step!=="closed";this.retire();this.show(visible?{step:"error",code:"CONNECTION_LOST"}:{step:"closed"});}
  private async fail(error:unknown,code?:string){
    const choice=this.screen.choice;this.retire();const generation=this.generation;
    const reason=code??(error instanceof WalletFlowError?error.code:"UNAVAILABLE");
    this.show({step:"error",choice,code:reason,busy:true});this.options.error(error);
    try{await this.options.invalidate();}catch(e){this.options.error(e);}
    if(this.generation===generation)this.show({step:"error",choice,code:reason});
  }
}
