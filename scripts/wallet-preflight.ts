import { preflight,formatPreflight } from "../src/wallet/preflight.js";
import { preflightEnvironment,readState } from "./live/environment.js";
try {
  const root=process.cwd(),state=readState(root);
  if(state)console.info("Using the active dev:live runtime origin; .env is unchanged.");
  const result=await preflight(preflightEnvironment(root),{offline:process.argv.includes("--offline"),development:!!state});
  console.info(formatPreflight(result.checks));process.exitCode=result.exitCode;
}catch{console.error("Configuration invalid. Check .env.example; no secrets were printed.");process.exitCode=1;}
