import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  assertApplyAllowed,
  migrationCompatibility,
  parseArguments,
  parseConfiguration,
  targetFlags,
} from "../../scripts/d1-migrations.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const configuration = {
  name: "crm-test",
  d1_databases: [{ binding: "DB", database_id: "production-id", preview_database_id: "preview-id", migrations_dir: "migrations/crm" }],
};
const history = ["0001_crm_baseline.sql", "0002_deal_relationship_invariants.sql"];

test("inspection is the default and apply is explicit", () => {
  assert.deepEqual(parseArguments(["--target", "local"]), {
    target: "local", apply: false, built: false, approveRemote: undefined, persistTo: undefined,
  });
  assert.equal(parseArguments(["--target", "production", "--apply"]).apply, true);
  assert.deepEqual(parseArguments(["--help"]), { help: true });
});

test("rejects missing, unknown and duplicated CLI options", () => {
  for (const args of [
    [], ["--target", "staging"], ["--target"], ["--target", "--apply"],
    ["--target", "local", "--reset"], ["--target", "local", "--target", "production"],
    ["--target", "local", "--apply", "--apply"], ["--target", "local", "--persist-to"],
    ["--target", "production", "--approve-remote"],
  ]) assert.throws(() => parseArguments(args), Error, args.join(" "));
});

test("remote targets reject local configuration and persistence overrides", () => {
  for (const target of ["preview", "production"]) {
    assert.throws(() => parseArguments(["--target", target, "--built"]), /local-only/);
    assert.throws(() => parseArguments(["--target", target, "--persist-to", "/tmp/local-only"]), /local-only/);
  }
  assert.throws(() => parseArguments(["--target", "local", "--approve-remote", "production-id"]), /cannot be used for local/);
});

test("target flags isolate local persistence from preview and production", () => {
  assert.deepEqual(targetFlags(parseArguments(["--target", "local"])), ["--local", "--persist-to", resolve(root, ".wrangler/state")]);
  assert.deepEqual(targetFlags(parseArguments(["--target", "local", "--persist-to", "state-test"])), ["--local", "--persist-to", resolve(root, "state-test")]);
  assert.deepEqual(targetFlags(parseArguments(["--target", "local", "--persist-to", "/tmp/crm-migration-test"])), ["--local", "--persist-to", "/tmp/crm-migration-test"]);
  assert.deepEqual(targetFlags(parseArguments(["--target", "preview"])), ["--preview"]);
  assert.deepEqual(targetFlags(parseArguments(["--target", "production"])), ["--remote"]);
});

test("JSONC preserves the exact reviewed Worker and DB binding", () => {
  const jsonc = `// CRM configuration\n${JSON.stringify(configuration, null, 2)}`;
  assert.deepEqual(parseConfiguration(jsonc), { worker: "crm-test", database: configuration.d1_databases[0] });
});

test("rejects malformed configuration and ambiguous Worker or DB selection", () => {
  assert.throws(() => parseConfiguration("{"), /Invalid configuration/);
  for (const config of [
    {}, { ...configuration, name: "" }, { ...configuration, name: 5 },
    { ...configuration, d1_databases: [] },
    { ...configuration, d1_databases: [{ ...configuration.d1_databases[0], binding: "OTHER" }] },
    { ...configuration, d1_databases: [...configuration.d1_databases, ...configuration.d1_databases] },
  ]) assert.throws(() => parseConfiguration(JSON.stringify(config)), /exactly one DB binding/);
});

test("rejects implicit database provisioning and unreviewed environment or migration pattern", () => {
  const database = configuration.d1_databases[0];
  for (const override of [{ database_id: "" }, { database_id: null }, { migrations_dir: "" }, { migrations_dir: null }]) {
    assert.throws(() => parseConfiguration(JSON.stringify({ ...configuration, d1_databases: [{ ...database, ...override }] })), /explicit database_id and migrations_dir/);
  }
  assert.throws(() => parseConfiguration(JSON.stringify({ ...configuration, env: { preview: {} } })), /top-level Worker configuration/);
  assert.throws(() => parseConfiguration(JSON.stringify({ ...configuration, d1_databases: [{ ...database, migrations_pattern: "*.sql" }] })), /flat migration directory/);
  assert.throws(() => parseConfiguration(JSON.stringify({ ...configuration, d1_databases: [{ ...database, migrations_table: "custom_ledger" }] })), /migration/);
  assert.equal(parseConfiguration(JSON.stringify({ ...configuration, d1_databases: [{ ...database, migrations_table: "d1_migrations" }] })).database.migrations_table, "d1_migrations");
});

test("fresh empty database and internal SQLite/D1 tables permit baseline apply", () => {
  for (const tables of [[], ["sqlite_sequence", "sqlite_stat1", "_cf_KV", "d1_migrations"]]) {
    assert.deepEqual(migrationCompatibility(history, [], tables), { safeToApply: true, pending: history });
  }
});

test("only an exact ordered ledger prefix permits incremental or idempotent apply", () => {
  assert.deepEqual(migrationCompatibility(history, history.slice(0, 1), ["company"]), { safeToApply: true, pending: history.slice(1) });
  assert.deepEqual(migrationCompatibility(history, history, ["company"]), { safeToApply: true, pending: [] });
  for (const ledger of [
    [history[1]], [...history].reverse(), ["0004_runtime_compat.sql"],
    [...history, "0003_unreviewed.sql"], [history[0], history[0]],
  ]) {
    const result = migrationCompatibility(history, ledger, []);
    assert.equal(result.safeToApply, false);
    assert.match(result.reason, /not a prefix/);
  }
});

test("existing application tables without a ledger block fresh baseline collisions", () => {
  for (const table of ["company", "user", "customers", "subscriptions", "unknown_application_table"]) {
    const result = migrationCompatibility(history, [], ["_cf_KV", "d1_migrations", table]);
    assert.equal(result.safeToApply, false);
    assert.match(result.reason, /Tables already exist/);
  }
});

test("local apply requires compatible history but no remote approval", () => {
  assert.doesNotThrow(() => assertApplyAllowed({ target: "local" }, "production-id", { safeToApply: true }));
  assert.throws(() => assertApplyAllowed({ target: "local" }, "production-id", { safeToApply: false, reason: "existing tables collide" }), /existing tables collide/);
});

test("both remote targets require the exact selected database ID", () => {
  for (const [target, databaseId] of [["preview", "preview-id"], ["production", "production-id"]]) {
    for (const approveRemote of [undefined, "", "wrong-id", `${databaseId} `, databaseId.toUpperCase()]) {
      assert.throws(() => assertApplyAllowed({ target, approveRemote }, databaseId, { safeToApply: true }), /exact printed database ID/);
    }
    assert.doesNotThrow(() => assertApplyAllowed({ target, approveRemote: databaseId }, databaseId, { safeToApply: true }));
    assert.throws(() => assertApplyAllowed({ target, approveRemote: databaseId }, databaseId, { safeToApply: false, reason: "incompatible history" }), /incompatible history/);
  }
});
