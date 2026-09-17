// Publication hygiene only. Does not import bot/wallet code or perform network writes.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const entries = value => value.split("\0").filter(Boolean);
const blockedFile = file => file !== ".env.example" && (
  /(?:^|\/)(?:\.env(?:\.|$)|data\/|\.dev-live\/|node_modules\/|dist\/|coverage\/|backups\/|logs\/|runtime\/|sessions\/|\.cloudflared\/|\.wrangler\/)/i.test(file) ||
  /\.(?:sqlite\w*|db|bak|backup|log|session|pem|key|p12|pfx)(?:[.-]|$)/i.test(file)
);
const publicRpc = value => {
  try { const u = new URL(value); return u.hostname === "ethereum-sepolia-rpc.publicnode.com" && !u.username && !u.password && !u.search && u.pathname === "/"; }
  catch { return false; }
};

export function checkPublication() {
  const env = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
  const configured = Object.entries(env).filter(([key, value]) => value && /TOKEN|SECRET|KEY|RPC|PROJECT_ID|USER_IDS|SIGNING_ORIGIN|REFERRAL/.test(key))
    .flatMap(([key, value]) => {
      if (/RPC/.test(key) && publicRpc(value)) return [];
      const values = /USER_IDS/.test(key) ? value.split(",").map(x => x.trim()) : [value];
      if (/RPC/.test(key)) { try { for (const [, v] of new URL(value).searchParams) values.push(v); } catch {} }
      return values.filter(x => x.length >= 8).map(value => ({ key, value }));
    });
  const failures = [];
  let inspected = 0;
  const inspect = (file, buffer, scope) => {
    inspected++;
    if (blockedFile(file)) failures.push({ scope, file, reason: "private_or_runtime_file" });
    if (buffer.includes(0)) return; // Binary artifacts still undergo filename checks.
    const lines = buffer.toString("utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], report = reason => failures.push({ scope, file, line: i + 1, reason });
      for (const item of configured) if (line.includes(item.value)) report("configured_" + item.key);
      if (/\b\d{5,20}:[A-Za-z0-9_-]{30,80}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9_.-]{20,}|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(line)) report("credential_pattern");
      if (/(?:C:[\\/]Users[\\/](?!Public\b)|\/Users\/|\/home\/(?!node\b))[A-Za-z0-9_.-]+/i.test(line)) report("personal_path");
      const tunnels = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
      if (tunnels && !file.startsWith("tests/") && !(file === "scripts/dev-live.ts" && tunnels.every(u => u === ["https://local-validation", "trycloudflare", "com"].join(".")))) report("temporary_tunnel_url");
    }
  };
  const files = new Set(entries(git("ls-files", "--cached", "--others", "--exclude-standard", "-z")));
  for (const file of files) if (existsSync(file) && statSync(file).isFile()) inspect(file, readFileSync(file), "working_tree");
  for (const file of entries(git("ls-files", "-z"))) inspect(file, Buffer.from(git("show", ":" + file)), "index");
  const commits = git("rev-list", "--all").trim().split("\n").filter(Boolean);
  for (const commit of commits) for (const file of entries(git("ls-tree", "-r", "--name-only", "-z", commit)))
    inspect(file, Buffer.from(git("show", commit + ":" + file)), "history:" + commit);
  if (failures.length) {
    // Never print matching values, source lines or raw command errors.
    console.error(JSON.stringify({ status: "BLOCKED", failures }, null, 2));
    throw new Error("Publication hygiene check failed; review paths privately.");
  }
  const result = { status: "SAFE", candidateFiles: files.size, commits: commits.length, inspectedVersions: inspected };
  console.info(JSON.stringify(result));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { checkPublication(); } catch { process.exitCode = 1; }
}
