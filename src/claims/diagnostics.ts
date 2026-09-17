import {FAUCET,CLAIM_DATA,type ClaimSnapshot} from './protocol.js';
export function claimSimulationLog(wallet:string,s:ClaimSnapshot){
  // Explicit fields only. Never spread RPC/provider objects or exception messages.
  if(!/^0x[0-9a-fA-F]{40}$/.test(wallet)||!/^\d{1,8}$/.test(s.gasEstimate))return;
  console.info(JSON.stringify({event:'claim_simulated',at:new Date().toISOString(),wallet:wallet.slice(0,6)+'…'+wallet.slice(-4),chain:11155111,contract:FAUCET,selector:CLAIM_DATA,gasEstimate:s.gasEstimate}));
}
