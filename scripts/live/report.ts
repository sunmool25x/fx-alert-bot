import { type Check,setupAction } from "../../src/wallet/preflight.js";
export function liveSummary(checks:Check[]) {
  const groups:[string,string[]][]=[
    ["Telegram",["TG_CONFIG","TG_READ"]],["Sera Sepolia",["SERA_CONFIG","SERA_READ"]],
    ["Sepolia RPC",["NETWORK","RPC_CONFIG","RPC_READ"]],["Database",["DATABASE"]],
    ["Public HTTPS + signing page",["HTTPS_ORIGIN","HTTPS_READ","WEB_BUILD","TELEGRAM_LAUNCH"]],
    ["Single beta tester",["BETA_ALLOWLIST"]],["Reown Project ID (format only)",["REOWN_PROJECT"]],
  ];
  const lines=groups.map(([label,codes])=>{
    const rows=codes.map(code=>checks.find(c=>c.code===code));
    return (rows.some(c=>c?.status==="FAIL")?"✗ ":rows.every(c=>c?.status==="PASS")?"✓ ":"… ")+label;
  });
  if(checks.find(c=>c.code==="MAINNET")?.status==="PASS"&&checks.find(c=>c.code==="EXECUTION")?.message.includes("disabled"))lines.push("✓ Execution OFF · mainnet OFF");
  for(const check of checks.filter(c=>c.status==="FAIL"))lines.push("\n"+check.code+" — "+setupAction(check.code));
  return lines.join("\n");
}
