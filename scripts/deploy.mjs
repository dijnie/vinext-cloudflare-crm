import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main as migrate, parseConfiguration } from "./d1-migrations.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function deployWorker(args) {
  await new Promise((accept, reject) => {
    const child = spawn("npm", ["exec", "--no", "--", "vinext-cloudflare", "deploy", ...args], {
      cwd: projectRoot, stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) accept();
      else reject(new Error(`Worker deployment failed (${signal ?? code})`));
    });
  });
}

export async function deploy(args = [], dependencies = {}) {
  // Reject target overrides: migration and publication must use the same config.
  if (args.length > 1 || args.some(arg => !["--dry-run", "--help"].includes(arg))) {
    throw new Error("Deploy accepts only --dry-run or --help; configure the Worker and DB in wrangler.jsonc");
  }
  if (args[0] === "--help") {
    console.log("Usage: npm run deploy [-- --dry-run]\nApplies pending migrations to the configured remote DB before deploying. Dry-run performs no migration or deployment.");
    return;
  }
  const publish = dependencies.deployWorker ?? deployWorker;
  if (args.length === 0) {
    const config = await (dependencies.readConfiguration ?? (() => readFile(resolve(projectRoot, "wrangler.jsonc"), "utf8")))();
    const { database } = parseConfiguration(config);
    // Invoking deploy authorizes pending migrations for this configured DB only.
    // The migration runner still rejects collisions and verifies the final ledger.
    await (dependencies.migrate ?? migrate)(["--target", "production", "--apply", "--approve-remote", database.database_id]);
  }
  await publish(args);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  deploy(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
