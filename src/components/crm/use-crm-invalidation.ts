"use client";

import { useSyncExternalStore } from "react";

// Keep only a mutation counter for this browser document, never CRM records.
// RSC navigation may remount both lists and layouts while reusing old snapshots.
let revision = 0;
let listening = false;
const subscribers = new Set<() => void>();

function subscribe(listener: () => void) {
  if (!listening) {
    listening = true;
    window.addEventListener("crm:invalidate", () => {
      revision += 1;
      subscribers.forEach(notify => notify());
    });
  }
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}

export function useCrmInvalidation() {
  return useSyncExternalStore(subscribe, () => revision, () => 0);
}
