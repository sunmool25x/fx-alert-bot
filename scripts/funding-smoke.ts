// Verified faucet ABI facts only. Public reads; no claim, signature or broadcast.
import { createPublicClient,http,parseAbi,formatUnits } from "viem";
import { sepolia } from "viem/chains";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { loadConfig } from "../src/config/index.js";
import { USDC,XSGD } from "../src/trades/contract.js";
const faucet="0x4FAc3BB8B77547E2Da7ed903baDBeD2f46cBe65a";
// Source: official quickstart link -> Etherscan verified IssueTestTokenV3 contract.
const abi=parseAbi(["function getTokens() view returns (address[])","function claimAmount() view returns (uint256)","function ethPerUser() view returns (uint256)","function claimEpoch() view returns (uint256)"]);
const tokenAbi=parseAbi(["function balanceOf(address) view returns (uint256)","function decimals() view returns (uint8)"]);
try {
  if(existsSync(".env"))loadEnvFile(".env");const c=loadConfig();if(!c.wallet.rpc)throw new Error("RPC missing");
  const client=createPublicClient({chain:sepolia,transport:http(c.wallet.rpc,{retryCount:0,timeout:15000,fetchOptions:{redirect:"error"}})});
  if(await client.getChainId()!==11155111)throw new Error("Wrong chain");
  const tokens=await client.readContract({address:faucet,abi,functionName:"getTokens"});
  const amount=await client.readContract({address:faucet,abi,functionName:"claimAmount"});
  const epoch=await client.readContract({address:faucet,abi,functionName:"claimEpoch"});
  const eth=await client.readContract({address:faucet,abi,functionName:"ethPerUser"});
  const rows=[];
  for(const [symbol,address] of [["USDC",USDC],["XSGD",XSGD]] as const){
    const decimals=await client.readContract({address,abi:tokenAbi,functionName:"decimals"});
    const balance=await client.readContract({address,abi:tokenAbi,functionName:"balanceOf",args:[faucet]});
    rows.push({symbol,address,inFaucet:tokens.some(t=>t.toLowerCase()===address.toLowerCase()),claimAmount:formatUnits(amount,decimals),stockSufficient:balance>=amount});
  }
  console.info(JSON.stringify({at:new Date().toISOString(),chain:11155111,faucet,epoch:epoch.toString(),tokens:tokens.length,ethPerUser:formatUnits(eth,18),faucetEth:formatUnits(await client.getBalance({address:faucet}),18),rows,claimed:false,ownerEligibility:"NOT CHECKED"},null,2));
  if(!rows[0]?.inFaucet||!rows[0]?.stockSufficient)process.exitCode=1;
}catch{console.error("FAIL FUNDING_READ: faucet read failed; check Sepolia RPC. No secrets printed or tokens claimed.");process.exitCode=1;}
