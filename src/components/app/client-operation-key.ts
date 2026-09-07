export type PendingClientOperation = {
  fingerprint: string;
  key: string;
};

export function clientOperationKey(
  pending: { current: PendingClientOperation | null },
  payload: unknown,
): string {
  const fingerprint = JSON.stringify(payload);
  if (pending.current?.fingerprint !== fingerprint) {
    pending.current = { fingerprint, key: crypto.randomUUID() };
  }
  return pending.current.key;
}
