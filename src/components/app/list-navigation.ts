"use client";

/** Update list/sheet state without requesting another server-rendered page. */
export function pushListQuery(href: string) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) {
    throw new Error("List query navigation must stay on the current page");
  }
  if (url.href === window.location.href) return;
  // Vinext synchronizes native history updates with useSearchParams. Passing
  // null lets the router preserve its own history metadata for Back/Forward.
  window.history.pushState(null, "", url);
}
