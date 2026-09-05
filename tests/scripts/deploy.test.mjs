import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { deploy } from "../../scripts/deploy.mjs";

const config = JSON.stringify({ name: "crm-test", d1_databases: [{ binding: "DB", database_id: "selected-db", migrations_dir: "migrations/crm" }] });

test("deploy migrates the configured remote database before publishing", async () => {
  const calls = [];
  await deploy([], {
    readConfiguration: async () => config,
    migrate: async args => { calls.push(["migrate", ...args]); },
    deployWorker: async args => { calls.push(["deploy", ...args]); },
  });
  assert.deepEqual(calls, [["migrate", "--target", "production", "--apply", "--approve-remote", "selected-db"], ["deploy"]]);
});

test("migration failure prevents publication", async () => {
  let published = false;
  await assert.rejects(deploy([], {
    readConfiguration: async () => config,
    migrate: async () => { throw new Error("incompatible migration history"); },
    deployWorker: async () => { published = true; },
  }), /incompatible migration history/);
  assert.equal(published, false);
});

test("dry-run and help never read or migrate remote configuration", async () => {
  for (const flag of ["--dry-run", "--help"]) {
    const calls = [];
    await deploy([flag], {
      readConfiguration: async () => assert.fail("configuration should not be read"),
      migrate: async () => assert.fail("migration should not run"),
      deployWorker: async args => { calls.push(args); },
    });
    assert.deepEqual(calls, flag === "--help" ? [] : [[flag]]);
  }
});

test("invalid configuration and target overrides fail before any writes", async () => {
  const dependencies = {
    readConfiguration: async () => "{}",
    migrate: async () => assert.fail("migration should not run"),
    deployWorker: async () => assert.fail("publication should not run"),
  };
  await assert.rejects(deploy([], dependencies), /exactly one DB binding/);
  for (const args of [["--env", "preview"], ["--config", "other.jsonc"], ["--name", "other"], ["--dry-run", "--help"]]) {
    await assert.rejects(deploy(args, dependencies), /Deploy accepts only/);
  }
});

test("publication failure is reported after successful migration", async () => {
  let migrated = false;
  await assert.rejects(deploy([], {
    readConfiguration: async () => config,
    migrate: async () => { migrated = true; },
    deployWorker: async () => { throw new Error("publication failed"); },
  }), /publication failed/);
  assert.equal(migrated, true);
});

test("npm deploy uses the migration-aware entry point", async () => {
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts.deploy, "node scripts/deploy.mjs");
});
