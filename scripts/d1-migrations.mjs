import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";

const execute = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceConfig = resolve(projectRoot, "wrangler.jsonc");

export function parseArguments(args) {
  const options = { target: undefined, apply: false, built: false, approveRemote: undefined, persistTo: undefined };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--help") return { help: true };
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === "--apply") options.apply = true;
    else if (flag === "--built") options.built = true;
    else if (["--target", "--approve-remote", "--persist-to"].includes(flag)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
      options[flag === "--target" ? "target" : flag === "--approve-remote" ? "approveRemote" : "persistTo"] = value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (!["local", "preview", "production"].includes(options.target)) throw new Error("Specify --target local, preview, or production");
  if (options.target !== "local" && (options.built || options.persistTo)) throw new Error("--built and --persist-to are local-only options");
  if (options.target === "local" && options.approveRemote) throw new Error("Remote approval cannot be used for local migrations");
  return options;
}

export function parseConfiguration(text, filename = "wrangler.jsonc") {
  const parsed = ts.parseConfigFileTextToJson(filename, text);
  if (parsed.error) throw new Error(`Invalid configuration: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, " ")}`);
  const config = parsed.config;
  const bindings = config?.d1_databases?.filter(binding => binding.binding === "DB");
  if (typeof config?.name !== "string" || !config.name || bindings?.length !== 1) throw new Error("Configuration must name one Worker and exactly one DB binding");
  const database = bindings[0];
  if (typeof database.database_id !== "string" || !database.database_id || typeof database.migrations_dir !== "string" || !database.migrations_dir) throw new Error("DB must have an explicit database_id and migrations_dir; automatic provisioning is not allowed");
  if (database.migrations_pattern || config.env) throw new Error("This migration runner requires the reviewed flat migration directory and top-level Worker configuration");
  if (database.migrations_table && database.migrations_table !== "d1_migrations") throw new Error("This migration runner requires the default d1_migrations ledger table");
  return { worker: config.name, database };
}

export function targetFlags(options) {
  if (options.target === "local") return ["--local", "--persist-to", resolve(projectRoot, options.persistTo ?? ".wrangler/state")];
  return options.target === "preview" ? ["--preview"] : ["--remote"];
}

export function migrationCompatibility(expected, ledger, tables) {
  if (ledger.some((name, index) => name !== expected[index])) return { safeToApply: false, reason: "Applied migration history is not a prefix of the authoritative CRM history. Choose and verify a transition strategy; never reset or rewrite the ledger automatically." };
  const applicationTables = tables.filter(name => !name.startsWith("sqlite_") && !["_cf_KV", "d1_migrations"].includes(name));
  if (ledger.length === 0 && applicationTables.length > 0) return { safeToApply: false, reason: "Tables already exist without the CRM migration ledger. Applying the fresh baseline would collide; inspect the database before choosing recovery." };
  return { safeToApply: true, pending: expected.slice(ledger.length) };
}

export function assertApplyAllowed(options, databaseId, compatibility) {
  if (!compatibility.safeToApply) throw new Error(compatibility.reason);
  if (options.target !== "local" && options.approveRemote !== databaseId) throw new Error("Remote apply requires separately approved backup, account/data policy and rollback, then --approve-remote with the exact printed database ID");
}

async function migrationNames(configPath, database) {
  const directory = isAbsolute(database.migrations_dir) ? database.migrations_dir : resolve(dirname(configPath), database.migrations_dir);
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries.filter(entry => entry.isFile() && entry.name.endsWith(".sql")).map(entry => entry.name).sort();
  if (!names.length) throw new Error(`No SQL migrations in ${directory}`);
  return { directory, names };
}

async function runWrangler(args) {
  return execute(process.execPath, [resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js"), ...args], { cwd: projectRoot, maxBuffer: 4 * 1024 * 1024 });
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    console.log("Usage: node scripts/d1-migrations.mjs --target local|preview|production [--apply] [--built] [--persist-to <local-directory>] [--approve-remote <database-id>]\nDefault: inspect only. --built uses the built Worker's local configuration after checking it against source. No reset, deployment, or automatic remote migration is performed.");
    return;
  }
  const source = parseConfiguration(await readFile(sourceConfig, "utf8"), sourceConfig);
  const sourceMigrations = await migrationNames(sourceConfig, source.database);
  const configPath = options.built ? resolve(projectRoot, "dist/server/wrangler.json") : sourceConfig;
  const selected = options.built ? parseConfiguration(await readFile(configPath, "utf8"), configPath) : source;
  const selectedMigrations = await migrationNames(configPath, selected.database);
  if (selected.worker !== source.worker || selected.database.database_id !== source.database.database_id || JSON.stringify(selectedMigrations.names) !== JSON.stringify(sourceMigrations.names)) throw new Error("Built Worker bindings or migration history differ from source. Rebuild before local preview.");
  const databaseId = options.target === "preview" ? selected.database.preview_database_id : selected.database.database_id;
  if (typeof databaseId !== "string" || !databaseId) throw new Error("Preview migrations require an explicit preview_database_id");
  const flags = [...targetFlags(options), "--config", configPath];
  const sql = async command => {
    const { stdout } = await runWrangler(["d1", "execute", "DB", ...flags, "--command", command, "--json"]);
    const result = JSON.parse(stdout);
    if (!Array.isArray(result) || !result[0]?.success) throw new Error("Unable to inspect the selected database");
    return result[0].results;
  };
  const inspect = async () => {
    const tables = (await sql("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")).map(row => row.name);
    const ledger = tables.includes("d1_migrations") ? (await sql("SELECT name FROM d1_migrations ORDER BY id")).map(row => row.name) : [];
    return { tables, ledger, compatibility: migrationCompatibility(sourceMigrations.names, ledger, tables) };
  };
  console.log(JSON.stringify({ target: options.target, worker: selected.worker, binding: "DB", databaseId, sharedWithProduction: options.target === "preview" && databaseId === source.database.database_id, configPath, sourceAuthority: sourceConfig, migrationsDirectory: selectedMigrations.directory, localPersistence: options.target === "local" ? resolve(projectRoot, options.persistTo ?? ".wrangler/state") : undefined }, null, 2));
  const before = await inspect();
  console.log(JSON.stringify(before, null, 2));
  if (!options.apply) return;
  assertApplyAllowed(options, databaseId, before.compatibility);
  const { stdout } = await runWrangler(["d1", "migrations", "apply", "DB", ...flags]);
  process.stdout.write(stdout);
  const after = await inspect();
  console.log(JSON.stringify(after, null, 2));
  if (!after.compatibility.safeToApply || after.compatibility.pending.length) throw new Error("Migration verification did not reach the authoritative ledger");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
