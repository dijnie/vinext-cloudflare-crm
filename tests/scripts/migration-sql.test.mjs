import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

const directory = new URL("../../migrations/crm/", import.meta.url);

test("all CRM migrations compile and trigger CASE expressions are safe for remote D1", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const name of (await readdir(directory)).filter(name => name.endsWith(".sql")).sort()) {
      db.exec(await readFile(new URL(name, directory), "utf8"));
    }
    const triggers = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger'").all();
    assert.ok(triggers.length > 0);
    for (const trigger of triggers) {
      // Remote D1 can mistake an unparenthesized CASE END for the trigger END.
      assert.doesNotMatch(trigger.sql, /\bSELECT\s+CASE\b/i, trigger.name);
    }
  } finally {
    db.close();
  }
});

test("parenthesized CASE keeps trigger rejection and successful inserts unchanged", () => {
  for (const expression of ["CASE WHEN NEW.id < 0 THEN RAISE(ABORT, 'negative id') END", "(CASE WHEN NEW.id < 0 THEN RAISE(ABORT, 'negative id') END)"]) {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE TABLE probe (id INTEGER); CREATE TRIGGER positive_id BEFORE INSERT ON probe BEGIN SELECT ${expression}; END;`);
      db.exec("INSERT INTO probe VALUES (1)");
      assert.throws(() => db.exec("INSERT INTO probe VALUES (-1)"), /negative id/);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM probe").get().count, 1);
    } finally {
      db.close();
    }
  }
});
