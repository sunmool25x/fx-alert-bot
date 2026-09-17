// OWNER ACTION: running without --check creates a PUBLIC repository and pushes.
// No bot configuration is changed; this script cannot sign or submit transactions.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPublication } from "./check-publication.mjs";

let step = "local checks";
const run = (tool, args, input) => execFileSync(tool, args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] }).trim();
const git = (...args) => run("git", args);
const gh = (...args) => run("gh", args);
try {
  process.chdir(fileURLToPath(new URL("../", import.meta.url)));
  if (process.argv.slice(2).some(arg => arg !== "--check")) throw new Error();
  const metadata = JSON.parse(readFileSync(".github/repository.json", "utf8"));
  if (metadata.owner !== "sunmool25x" || metadata.name !== "fx-alert-bot" || metadata.visibility !== "public") throw new Error();
  const target = metadata.owner + "/" + metadata.name;
  const expected = ["https://github.com/" + target + ".git", "git@github.com:" + target + ".git"];
  if (git("branch", "--show-current") !== "main" || git("status", "--porcelain")) throw new Error();
  const head = git("rev-parse", "HEAD");
  for (const name of git("remote").split("\n").filter(Boolean)) {
    if (name !== "origin") throw new Error();
    for (const option of [[], ["--push"]]) for (const url of git("remote", "get-url", "--all", ...option, name).split("\n"))
      if (!expected.includes(url)) throw new Error();
  }
  const example = readFileSync(".env.example", "utf8");
  if (!/^ENABLE_MAINNET=false$/m.test(example) || !/^ENABLE_TESTNET_EXECUTION=false$/m.test(example)) throw new Error();
  checkPublication();
  step = "GitHub account verification";
  if (gh("api", "user", "--jq", ".login") !== metadata.owner) throw new Error();
  step = "target repository verification";
  let existing;
  try { existing = JSON.parse(gh("api", "repos/" + target)); }
  catch (error) { if (!String(error.stderr).includes("404")) throw error; }
  if (existing && (existing.fork || existing.private || existing.owner.login !== metadata.owner || !git("remote").split("\n").includes("origin"))) throw new Error();
  if (existing && existing.size > 0) {
    // Resume our publication only; never overwrite divergent remote history.
    if (gh("api", "repos/" + target + "/commits/main", "--jq", ".sha") !== head) throw new Error();
  }
  if (process.argv.includes("--check")) {
    console.info(JSON.stringify({ status: "READY", target, visibility: "public", commit: head, repositoryExists: !!existing, remoteWrites: false, topics: metadata.topics }));
  } else {
    step = "creating public original repository";
    if (!existing) gh("repo", "create", target, "--public", "--description", metadata.description, "--source", resolve("."), "--remote", "origin");
    step = "setting repository metadata";
    gh("repo", "edit", target, "--description", metadata.description);
    run("gh", ["api", "--method", "PUT", "repos/" + target + "/topics", "--input", "-"], JSON.stringify({ names: metadata.topics }));
    step = "enabling private vulnerability reporting";
    gh("api", "--method", "PUT", "repos/" + target + "/private-vulnerability-reporting");
    step = "pushing prepared main branch";
    git("push", "--set-upstream", "origin", "main");
    step = "verifying publication";
    const repo = JSON.parse(gh("api", "repos/" + target));
    if (repo.fork || repo.private || repo.owner.login !== metadata.owner || metadata.topics.some(topic => !repo.topics.includes(topic)) ||
      gh("api", "repos/" + target + "/commits/main", "--jq", ".sha") !== head) throw new Error();
    console.info("Published https://github.com/" + target + " as a public original repository. Execution/mainnet were not changed; XP/sync are not verified.");
  }
} catch {
  console.error("Publication stopped during " + step + ". No raw credentials/errors are printed. If a repository was created, rerunning this command can resume matching publication; divergent repositories/history are refused.");
  process.exitCode = 1;
}
