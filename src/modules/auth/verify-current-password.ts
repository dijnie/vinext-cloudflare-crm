import type { createAuth } from "./auth";

export async function verifyCurrentPassword(auth: ReturnType<typeof createAuth>, userId: string, password: string): Promise<boolean> {
  // Use the configured verifier directly: the server endpoint's rejected dispatch
  // leaves an unhandled promise in the pinned Worker runtime on a bad password.
  const context = await auth.$context;
  const credential = await context.internalAdapter.findCredentialAccount(userId);
  if (!credential?.password) return false;
  return context.password.verify({ hash: credential.password, password });
}
