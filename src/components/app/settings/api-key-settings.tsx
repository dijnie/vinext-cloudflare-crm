"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/lib/i18n/config";

const grants = [
  "events.write",
  "contacts.read",
  "leads.read",
  "leads.create",
  "tickets.create",
] as const;
type ApiKey = {
  id: string;
  name: string;
  tokenHint: string | null;
  grants: string[];
  status: "active" | "revoked";
  revision: number;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};
type Confirmation = { kind: "rotate" | "revoke"; key: ApiKey };

async function request<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/crm/api-keys", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      (data as { error?: { code?: string } } | null)?.error?.code ??
        "internal_error",
    );
  return data as T;
}

export function ApiKeySettings({
  locale,
  initialKeys,
}: {
  locale: AppLocale;
  initialKeys: ApiKey[];
}) {
  const vi = locale === "vi",
    [keys, setKeys] = useState(initialKeys),
    [secret, setSecret] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [copied, setCopied] = useState(false),
    secretHeading = useRef<HTMLHeadingElement>(null);
  const labels: Record<(typeof grants)[number], string> = {
    "events.write": vi ? "Ghi sự kiện" : "Write events",
    "contacts.read": vi ? "Đọc liên hệ" : "Read contacts",
    "leads.read": vi ? "Đọc tiềm năng" : "Read leads",
    "leads.create": vi ? "Tạo tiềm năng" : "Create leads",
    "tickets.create": vi ? "Tạo yêu cầu hỗ trợ" : "Create tickets",
  };
  const formatter = new Intl.DateTimeFormat(vi ? "vi-VN" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  useEffect(() => {
    if (secret) secretHeading.current?.focus();
  }, [secret]);
  async function refresh() {
    const response = await fetch("/api/crm/api-keys", { cache: "no-store" });
    if (!response.ok) throw new Error("refresh_failed");
    setKeys((await response.json()) as ApiKey[]);
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form),
      selected = data.getAll("grant").map(String);
    setError("");
    setNotice("");
    setCopied(false);
    if (!selected.length) {
      setError(
        vi ? "Chọn ít nhất một quyền." : "Select at least one permission.",
      );
      return;
    }
    setBusy(true);
    try {
      const result = await request<{ token: string }>({
        action: "create-app",
        data: { name: data.get("name"), grants: selected },
      });
      setSecret(result.token);
      setNotice(vi ? "Đã tạo API key." : "API key created.");
      form.reset();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "internal_error");
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!confirmation) return;
    setBusy(true);
    setError("");
    setNotice("");
    setCopied(false);
    try {
      if (confirmation.kind === "rotate") {
        const result = await request<{ token: string }>({
          action: "rotate-app",
          id: confirmation.key.id,
          revision: confirmation.key.revision,
        });
        setSecret(result.token);
        setNotice(
          vi
            ? "Đã xoay API key. Key cũ không còn hiệu lực."
            : "API key rotated. The old key is no longer valid.",
        );
      } else {
        await request({
          action: "revoke-app",
          id: confirmation.key.id,
          revision: confirmation.key.revision,
        });
        setSecret("");
        setNotice(vi ? "Đã thu hồi API key." : "API key revoked.");
      }
      setConfirmation(null);
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message === "conflict"
          ? vi
            ? "API key đã thay đổi. Danh sách đã được làm mới; hãy xác nhận lại."
            : "The API key changed. The list was refreshed; confirm again."
          : reason instanceof Error
            ? reason.message
            : "internal_error",
      );
      setConfirmation(null);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setError(
        vi
          ? "Không thể sao chép. Hãy chọn và sao chép key thủ công."
          : "Could not copy. Select and copy the key manually.",
      );
    }
  }
  return (
    <div className="crm-page">
      <header className="space-y-2">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h1 className="crm-page-title">
              {vi ? "Tài khoản và API" : "Account & API"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {vi
                ? "Tạo API key cho hệ thống bên thứ ba. Key thuộc workspace và chỉ Owner có thể quản lý."
                : "Create workspace API keys for third-party systems. Only owners can manage them."}
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="h-11 w-full sm:h-9 sm:w-auto"
          >
            <a href="/api-docs" target="_blank" rel="noreferrer">
              {vi ? "Mở Swagger" : "Open Swagger"}
            </a>
          </Button>
        </div>
      </header>
      <div aria-live="polite" className="space-y-2">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-success">
            {notice}
          </p>
        )}
        {copied && (
          <p role="status" className="text-sm text-success">
            {vi ? "Đã sao chép." : "Copied."}
          </p>
        )}
      </div>
      {secret && (
        <section className="rounded-xl border bg-muted/50 p-4">
          <h2
            ref={secretHeading}
            tabIndex={-1}
            className="text-sm font-semibold outline-none"
          >
            {vi ? "Sao chép key ngay bây giờ" : "Copy this key now"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {vi
              ? "Key chỉ hiển thị một lần và không thể xem lại."
              : "This key is shown once and cannot be viewed again."}
          </p>
          <code className="mt-3 block select-all break-all rounded-lg border bg-background p-3 font-mono text-sm">
            {secret}
          </code>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="h-11 sm:h-9"
              onClick={() => void copy()}
            >
              {vi ? "Sao chép key" : "Copy key"}
            </Button>
            <Button
              type="button"
              className="h-11 sm:h-9"
              variant="outline"
              onClick={() => {
                setSecret("");
                setCopied(false);
              }}
            >
              {vi ? "Đã lưu, đóng" : "I saved it, close"}
            </Button>
          </div>
        </section>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{vi ? "Tạo API key" : "Create API key"}</h2>
          </CardTitle>
          <CardDescription>
            {vi
              ? "Mỗi key chỉ nên có các quyền thực sự cần thiết."
              : "Give each key only the permissions it needs."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void create(event)}>
            <label className="block space-y-1 text-xs">
              <span>{vi ? "Tên key" : "Key name"}</span>
              <Input
                name="name"
                required
                maxLength={120}
                disabled={busy}
                placeholder={
                  vi ? "Ví dụ: Website bán hàng" : "For example: Sales website"
                }
              />
            </label>
            <fieldset disabled={busy} className="space-y-3">
              <legend className="text-xs font-medium">
                {vi ? "Quyền truy cập" : "Permissions"}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {grants.map((grant) => (
                  <label
                    key={grant}
                    className="flex min-h-11 items-start gap-2 text-xs"
                  >
                    <input
                      className="mt-0.5 size-4 accent-primary"
                      type="checkbox"
                      name="grant"
                      value={grant}
                    />
                    <span>
                      <span className="block font-medium">{labels[grant]}</span>
                      <code className="text-muted-foreground">{grant}</code>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Button
              className="h-11 w-full sm:h-9 sm:w-auto"
              disabled={busy}
              type="submit"
            >
              {busy
                ? vi
                  ? "Đang xử lý…"
                  : "Working…"
                : vi
                  ? "Tạo key"
                  : "Create key"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{vi ? "API key hiện có" : "Existing API keys"}</h2>
          </CardTitle>
          <CardDescription>
            {vi
              ? "Thời gian sử dụng gần nhất có thể trễ tối đa năm phút."
              : "Last-used time may lag by up to five minutes."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!keys.length ? (
            <p className="text-sm text-muted-foreground">
              {vi
                ? "Chưa có API key. Hãy tạo key ở biểu mẫu phía trên."
                : "No API keys yet. Create one using the form above."}
            </p>
          ) : (
            <ul className="divide-y">
              {keys.map((key) => (
                <li
                  key={key.id}
                  className="space-y-3 py-4 first:pt-0 last:pb-0"
                >
                  <div>
                    <h3 className="break-words text-sm font-medium">
                      {key.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {key.status === "active"
                        ? vi
                          ? "Đang hoạt động"
                          : "Active"
                        : vi
                          ? "Đã thu hồi"
                          : "Revoked"}{" "}
                      ·{" "}
                      {key.tokenHint
                        ? `•••• ${key.tokenHint}`
                        : vi
                          ? "Key cũ · không có mã gợi nhớ"
                          : "Legacy key · hint unavailable"}
                    </p>
                  </div>
                  <p className="break-words text-xs">
                    {key.grants
                      .map(
                        (grant) =>
                          labels[grant as keyof typeof labels] ?? grant,
                      )
                      .join(" · ")}
                  </p>
                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">
                        {vi ? "Ngày tạo" : "Created"}
                      </dt>
                      <dd>
                        <time dateTime={key.createdAt}>
                          {formatter.format(new Date(key.createdAt))}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {vi ? "Dùng gần nhất" : "Last used"}
                      </dt>
                      <dd>
                        {key.lastUsedAt ? (
                          <>
                            <span>{vi ? "Khoảng " : "Approximately "}</span>
                            <time dateTime={key.lastUsedAt}>
                              {formatter.format(new Date(key.lastUsedAt))}
                            </time>
                          </>
                        ) : vi ? (
                          "Chưa từng dùng"
                        ) : (
                          "Never used"
                        )}
                      </dd>
                    </div>
                  </dl>
                  {key.status === "active" && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 sm:h-9"
                        aria-label={`${vi ? "Xoay" : "Rotate"}: ${key.name}`}
                        disabled={busy}
                        onClick={() => setConfirmation({ kind: "rotate", key })}
                      >
                        {vi ? "Xoay key" : "Rotate"}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="h-11 sm:h-9"
                        aria-label={`${vi ? "Thu hồi" : "Revoke"}: ${key.name}`}
                        disabled={busy}
                        onClick={() => setConfirmation({ kind: "revoke", key })}
                      >
                        {vi ? "Thu hồi" : "Revoke"}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <DialogContent
          className="max-h-[90svh] overflow-y-auto"
          closeLabel={vi ? "Đóng" : "Close"}
        >
          <DialogHeader>
            <DialogTitle>
              {confirmation?.kind === "rotate"
                ? vi
                  ? `Xoay key ${confirmation.key.name}?`
                  : `Rotate ${confirmation.key.name}?`
                : vi
                  ? `Thu hồi key ${confirmation?.key.name ?? ""}?`
                  : `Revoke ${confirmation?.key.name ?? ""}?`}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.kind === "rotate"
                ? vi
                  ? "Key hiện tại sẽ ngừng hoạt động ngay. Hệ thống bên thứ ba phải dùng key mới."
                  : "The current key will stop working immediately. Third-party systems must use the new key."
                : vi
                  ? "Mọi request dùng key này sẽ bị từ chối."
                  : "Every request using this key will be rejected."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full sm:h-9 sm:w-auto"
                disabled={busy}
              >
                {vi ? "Hủy" : "Cancel"}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant={
                confirmation?.kind === "revoke" ? "destructive" : "default"
              }
              className="h-11 w-full sm:h-9 sm:w-auto"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {confirmation?.kind === "rotate"
                ? vi
                  ? "Xoay và vô hiệu key cũ"
                  : "Rotate and invalidate current key"
                : vi
                  ? "Thu hồi key"
                  : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
