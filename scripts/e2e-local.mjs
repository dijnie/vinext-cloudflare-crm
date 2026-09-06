import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { request } from "@playwright/test";

// Only a fresh local D1 is provisioned. Browser sessions still use Better Auth.
const port = 8787;
const baseURL = `https://localhost:${port}`;
// Every suite gets a fresh database and server so destructive fixture changes
// cannot leak across suites. Sessions and auth rate limiters are isolated too.
const defaultGroups = [
  ["currency-dashboard"],
  ["legacy-routes"],
  ["activities-and-ownership"],
  ["lists-and-sheets"],
  ["auth-and-members"],
  ["custom-fields-and-saved-views"],
  ["access-settings"],
  ["business-settings"],
  ["default-saved-views"],
  ["extended-fields"],
  ["formula-fields"],
  ["field-conversion"],
  ["field-sorting"],
  ["field-conditions"],
  ["field-datetime"],
  ["file-fields"],
  ["module-lifecycle"],
  ["record-layouts"],
  ["deal-stage-settings"],
  ["leads"],
  ["catalog"],
];
const selectors = process.argv.slice(2);
const children = new Set();
const stopping = new WeakMap();
let interrupted = false;
function running(child) {
  return child?.pid && child.exitCode === null && child.signalCode === null;
}
function signal(child, name) {
  if (!child?.pid) return;
  // A command can exit before its descendants, so signal the owned group
  // even when the group leader has already exited. Nothing is unref'd.
  try { process.kill(-child.pid, name); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
}
function stop(child) {
  if (!child) return Promise.resolve();
  if (stopping.has(child)) return stopping.get(child);
  const cleanup = (async () => {
    const exited = running(child) ? once(child, "exit") : Promise.resolve();
    signal(child, "SIGTERM");
    const timer = setTimeout(() => signal(child, "SIGKILL"), 5000);
    try { await exited; } finally {
      clearTimeout(timer);
      signal(child, "SIGKILL");
      children.delete(child);
    }
  })();
  stopping.set(child, cleanup);
  return cleanup;
}
function interrupt(name) {
  interrupted = true;
  process.exitCode = name === "SIGINT" ? 130 : 143;
  for (const child of children) void stop(child).catch(error => console.error(error));
}
const onSigint = () => interrupt("SIGINT");
const onSigterm = () => interrupt("SIGTERM");
process.on("SIGINT", onSigint);
process.on("SIGTERM", onSigterm);

async function runGroup(group) {
  if (interrupted) throw new Error("E2E interrupted");
  console.log(`Local E2E fresh group: ${group.join(" ")}`);
  const probe = createServer();
  await new Promise((accept, reject) => probe.once("error", reject).listen(port, "127.0.0.1", accept));
  await new Promise((accept) => probe.close(accept));
  const directory = await mkdtemp(resolve(tmpdir(), "crm-e2e-"));
  const persist = resolve(directory, "state");
  const config = "dist/server/wrangler.json";
  const ownerPassword = randomBytes(24).toString("hex");
  const memberPassword = randomBytes(24).toString("hex");
  const environment = { ...process.env, AUTH_BASE_URL: baseURL, BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), E2E_BASE_URL: baseURL, E2E_OWNER_EMAIL: "owner@e2e.invalid", E2E_OWNER_PASSWORD: ownerPassword, E2E_MEMBER_EMAIL: "member@e2e.invalid", E2E_MEMBER_PASSWORD: memberPassword };
  environment.E2E_DISPOSABLE_MEMBER_EMAIL = "disposable@e2e.invalid";
  environment.E2E_DISPOSABLE_MEMBER_PASSWORD = randomBytes(24).toString("hex");
  const accounts = [
    [environment.E2E_OWNER_EMAIL, ownerPassword],
    [environment.E2E_MEMBER_EMAIL, memberPassword],
    [environment.E2E_DISPOSABLE_MEMBER_EMAIL, environment.E2E_DISPOSABLE_MEMBER_PASSWORD],
  ];
  let server;
  let commandProcess;
  let shuttingDown = false;
  let serverFailure;
  async function run(command, args) {
    if (interrupted) throw new Error("E2E interrupted");
    if (serverFailure) throw serverFailure;
    const child = spawn(command, args, { stdio: "inherit", env: environment, detached: true });
    children.add(child);
    commandProcess = child;
    try {
      const [code] = await once(child, "exit");
      if (serverFailure) throw serverFailure;
      if (interrupted) throw new Error("E2E interrupted");
      if (code !== 0) throw new Error(`${command} exited with ${code}`);
    } finally {
      await stop(child);
      commandProcess = undefined;
    }
  }
  try {
    await run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--config", config, "--persist-to", persist]);
    server = spawn("node", ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", config, "--persist-to", persist, "--port", String(port), "--local-protocol", "https", "--var", `AUTH_BASE_URL:${baseURL}`], { stdio: "inherit", env: environment, detached: true });
    children.add(server);
    console.log(`Local E2E server PID=${server.pid} port=${port} cwd=${process.cwd()} state=${persist}`);
    server.once("exit", (code, signal) => {
      console.log(`Local E2E server exited at=${new Date().toISOString()} code=${code} signal=${signal}`);
      if (!shuttingDown && !interrupted) {
        serverFailure = new Error(`E2E server exited unexpectedly: code=${code} signal=${signal}`);
        void stop(commandProcess).catch(error => console.error(error));
      }
    });
    server.once("error", error => {
      serverFailure = error;
      void stop(commandProcess).catch(cleanupError => console.error(cleanupError));
    });
    const api = await request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL } });
    try {
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (interrupted || !running(server)) throw new Error("E2E server exited before readiness");
        try { ready = (await api.get("/vi/sign-in", { timeout: 1000 })).ok(); } catch {}
        if (ready) break;
        await new Promise((accept) => setTimeout(accept, 500));
      }
      if (!ready) throw new Error("E2E server failed readiness");
      for (const [email, password] of accounts) {
        const response = await api.post("/api/auth/sign-up/email", { data: { name: email.split("@")[0], email, password } });
        if (!response.ok()) throw new Error(`Fixture sign-up failed: ${response.status()} ${await response.text()}`);
      }
      // The local email binding cannot deliver verification mail. Mark only the
      // fresh fixture addresses verified; real sign-in claims membership.
      const seed = resolve(directory, "verify-accounts.sql");
      await writeFile(seed, "UPDATE user SET email_verified=1 WHERE email IN ('owner@e2e.invalid','member@e2e.invalid','disposable@e2e.invalid');", { mode: 0o600 });
      await run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--config", config, "--persist-to", persist, "--file", seed]);
      for (const [email, password] of accounts) {
        const response = await api.post("/api/auth/sign-in/email", { data: { email, password } });
        if (!response.ok()) throw new Error(`Fixture sign-in failed: ${response.status()} ${await response.text()}`);
      }
    } finally { await api.dispose(); }
    // Cases within a suite share mutable memberships and CRM state.
    await run("npx", ["playwright", "test", ...group, ...(!selectors.length ? ["--workers=1", "--max-failures=1"] : [])]);
  } finally {
    shuttingDown = true;
    try {
      await Promise.all([stop(commandProcess), stop(server)]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

try {
  if (!selectors.length) {
    const files = (await readdir("tests/e2e", { recursive: true })).filter(name => /\.spec\.[cm]?[jt]sx?$/.test(name));
    const planned = defaultGroups.flat().map(name => `${name}.spec.ts`);
    const missing = files.filter(name => !planned.includes(name));
    if (missing.length) throw new Error(`Add new browser suites to the fresh E2E groups: ${missing.join(", ")}`);
    const stale = planned.filter(name => !files.includes(name));
    if (stale.length) throw new Error(`Fresh E2E groups reference missing suites: ${stale.join(", ")}`);
  }
  for (const group of selectors.length ? [selectors] : defaultGroups) await runGroup(group);
} finally {
  await Promise.all([...children].map(stop));
  process.removeListener("SIGINT", onSigint);
  process.removeListener("SIGTERM", onSigterm);
}
