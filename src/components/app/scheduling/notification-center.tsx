"use client";
import { useEffect, useRef, useState } from "react";
import { Notification as NotificationIcon } from "@carbon/icons-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppLocale } from "@/lib/i18n/config";
import { getSchedulingDictionary } from "@/lib/i18n/scheduling-dictionary";
import type { z } from "zod";
import type {
  notificationListOutputSchema,
  notificationPreferenceSchema,
} from "@/lib/services/notifications/notification-contract";
import { crmRequest } from "../record-types";
import { useRouter } from "next/navigation";
type Data = z.infer<typeof notificationListOutputSchema>;
type Preferences = z.infer<typeof notificationPreferenceSchema>;
export function NotificationCenter({
  locale,
  base,
}: {
  locale: AppLocale;
  base: string;
}) {
  const copy = getSchedulingDictionary(locale),
    router = useRouter(),
    [data, setData] = useState<Data>({ browserEnabled: false, rows: [] }),
    [error, setError] = useState(""),
    loadGeneration = useRef(0),
    browserDeliveries = useRef(new Set<string>());
  async function reportBrowserFailure(id: string) {
    try {
      await crmRequest("/api/crm/notifications", {
        method: "PATCH",
        body: JSON.stringify({
          action: "browser-result",
          id,
          delivered: false,
          error: "browser_delivery_failed",
        }),
      });
    } catch {
      setError(copy.errors);
    }
  }
  async function load() {
    const generation = ++loadGeneration.current;
    try {
      const next = await crmRequest<Data>("/api/crm/notifications");
      if (generation !== loadGeneration.current) return;
      setData(next);
      setError("");
      if (
        next.browserEnabled &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      )
        for (const row of next.rows.filter((r) => r.browserRetryReady)) {
          if (generation !== loadGeneration.current) break;
          if (browserDeliveries.current.has(row.id)) continue;
          browserDeliveries.current.add(row.id);
          let notice: Notification;
          try {
            notice = new Notification(row.title, {
              body: row.body ?? undefined,
              tag: row.id,
            });
          } catch {
            await reportBrowserFailure(row.id);
            browserDeliveries.current.delete(row.id);
            continue;
          }
          notice.onclick = () => router.push(`${base}${row.targetUrl}`);
          try {
            await crmRequest("/api/crm/notifications", {
              method: "PATCH",
              body: JSON.stringify({
                action: "browser-result",
                id: row.id,
                delivered: true,
              }),
            });
          } catch {
            setError(copy.errors);
          }
        }
    } catch {
      if (generation === loadGeneration.current) setError(copy.errors);
    }
  }
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => {
      loadGeneration.current += 1;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  async function enable() {
    if (typeof Notification === "undefined") {
      setError(copy.errors);
      return;
    }
    const permission = await Notification.requestPermission();
    const pref = await crmRequest<Preferences>(
      "/api/crm/notification-preferences",
    );
    await crmRequest("/api/crm/notification-preferences", {
      method: "PATCH",
      body: JSON.stringify({
        ...pref,
        browserEnabled: permission === "granted",
      }),
    });
    if (permission !== "granted") setError(copy.permissionDenied);
    else {
      setError("");
      void load();
    }
  }
  async function open(id: string, url: string) {
    loadGeneration.current += 1;
    await crmRequest("/api/crm/notifications", {
      method: "PATCH",
      body: JSON.stringify({ action: "read", id }),
    });
    setData((old) => ({
      ...old,
      rows: old.rows.filter((row) => row.id !== id),
    }));
    router.push(`${base}${url}`);
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={copy.reminder}
          className="relative"
        >
          <NotificationIcon />
          {data.rows.some((r) => !r.readAt) && (
            <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{copy.reminder}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {error && (
          <p role="alert" className="p-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {!data.browserEnabled && (
          <Button
            className="m-2"
            size="sm"
            variant="outline"
            onClick={() => void enable()}
          >
            {copy.enableBrowser}
          </Button>
        )}
        {data.rows.map((row) => (
          <button
            key={row.id}
            className="block w-full border-t p-3 text-left text-sm hover:bg-muted"
            onClick={() => void open(row.id, row.targetUrl)}
          >
            <span className="font-medium">{row.title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {new Date(row.dueAt).toLocaleString(locale)}
            </span>
          </button>
        ))}
        {!data.rows.length && (
          <p className="p-3 text-sm text-muted-foreground">{copy.noItems}</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
