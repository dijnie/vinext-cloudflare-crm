import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { request } from "@playwright/test";

// Only a fresh local D1 is provisioned. Browser sessions still use Better Auth.
const port = 8787;
const baseURL = `https://localhost:${port}`;
const probe = createServer();
await new Promise((accept, reject) => probe.once("error", reject).listen(port, "127.0.0.1", accept));
await new Promise((accept) => probe.close(accept));
const directory = await mkdtemp(resolve(tmpdir(), "crm-e2e-"));
const persist = resolve(directory, "state");
const config = "dist/server/wrangler.json";
const ownerPassword = randomBytes(24).toString("hex");
const memberPassword = randomBytes(24).toString("hex");
const environment = { ...process.env, AUTH_BASE_URL: baseURL, BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), E2E_BASE_URL: baseURL, E2E_OWNER_EMAIL: "owner@e2e.invalid", E2E_OWNER_PASSWORD: ownerPassword, E2E_MEMBER_EMAIL: "member@e2e.invalid", E2E_MEMBER_PASSWORD: memberPassword };
let server;
let commandProcess;
let interrupted = false;
function running(child) {
  return child && child.exitCode === null && child.signalCode === null;
}
function signal(child, name) {
  if (!running(child)) return;
  try { process.kill(-child.pid, name); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
}
async function stop(child) {
  if (!running(child)) return;
  const exited = once(child, "exit");
  signal(child, "SIGTERM");
  const timer = setTimeout(() => signal(child, "SIGKILL"), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}
function interrupt() {
  interrupted = true;
  signal(commandProcess, "SIGTERM");
  signal(server, "SIGTERM");
}
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
async function run(command, args) {
  if (interrupted) throw new Error("E2E interrupted");
  const child = spawn(command, args, { stdio: "inherit", env: environment, detached: true });
  commandProcess = child;
  const [code] = await once(child, "exit");
  commandProcess = undefined;
  if (code !== 0) throw new Error(`${command} exited with ${code}`);
}
try {
  await run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--config", config, "--persist-to", persist]);
  server = spawn("node", ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", config, "--persist-to", persist, "--port", String(port), "--local-protocol", "https"], { stdio: "inherit", env: environment, detached: true });
  console.log(`Local E2E server PID=${server.pid} port=${port} cwd=${process.cwd()} state=${persist}`);
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
    for (const [email, password] of [[environment.E2E_OWNER_EMAIL, ownerPassword], [environment.E2E_MEMBER_EMAIL, memberPassword]]) {
      const response = await api.post("/api/auth/sign-up/email", { data: { name: email.split("@")[0], email, password } });
      if (!response.ok()) throw new Error(`Fixture sign-up failed: ${response.status()} ${await response.text()}`);
    }
    // The local email binding cannot deliver verification mail. Mark only the
    // two fresh fixture addresses verified; real sign-in claims membership.
    const seed = resolve(directory, "verify-accounts.sql");
    await writeFile(seed, "UPDATE user SET email_verified=1 WHERE email IN ('owner@e2e.invalid','member@e2e.invalid');", { mode: 0o600 });
    await run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--config", config, "--persist-to", persist, "--file", seed]);
    for (const [email, password] of [[environment.E2E_OWNER_EMAIL, ownerPassword], [environment.E2E_MEMBER_EMAIL, memberPassword]]) {
      const response = await api.post("/api/auth/sign-in/email", { data: { email, password } });
      if (!response.ok()) throw new Error(`Fixture sign-in failed: ${response.status()} ${await response.text()}`);
    }
  } finally { await api.dispose(); }
  const selectors = process.argv.slice(2);
  await run("npx", ["playwright", "test", ...(selectors.length ? selectors : ["auth-and-members"])]);
} finally {
  try {
    await Promise.all([stop(commandProcess), stop(server)]);
  } finally {
    await rm(directory, { recursive: true, force: true });
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}
