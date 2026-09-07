import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const runtimeRoot = fileURLToPath(new URL("../../src/lib/", import.meta.url));
const adapterPath = "src/lib/db/database.ts";

async function typescriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  }));
  return nested.flat();
}

test("runtime D1 access stays behind the Drizzle database adapter", async () => {
  const violations = [];
  for (const path of await typescriptFiles(runtimeRoot)) {
    const projectPath = relative(root, path);
    if (projectPath === adapterPath) continue;
    const source = await readFile(path, "utf8");
    if (source.includes(".$client")) violations.push(projectPath);
  }
  assert.deepEqual(violations, [], `Direct D1 access found outside ${adapterPath}`);
});
