"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/lib/i18n/config";
type Workspace = {
  profile: { name: string; revision: number; hasLogo: boolean };
  deletion?: { status: string; executeAfter: string } | null;
  general: { timeZone: string; countryCode: string; calendarRevision: number };
  sources: { id: string; label: string | null; labelKey: string }[];
  deletionImpact: Record<string, number> | null;
};
type Dashboard = {
  apps: {
    id: string;
    name: string;
    status: string;
    revision: number;
    grants: string[];
  }[];
  endpoints: {
    id: string;
    name: string;
    url: string;
    active: boolean;
    revision: number;
    events: string[];
  }[];
  templates: { id: string; name: string }[];
  rules: { id: string; name: string; enabled: boolean; revision: number }[];
  segments: { id: string; name: string; kind: string; entity: string }[];
  ai: {
    enabled: boolean;
    provider: string | null;
    monthlyBudgetMinor: number;
    usedMinor: number;
  };
};
type FormRow = {
  id: string;
  name: string;
  slug: string;
  entity: "lead" | "ticket";
  mode: "public" | "signed_system";
  active: boolean;
};
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const isWorkspace = (value: unknown): value is Workspace =>
  object(value) &&
  object(value.profile) &&
  typeof value.profile.name === "string" &&
  typeof value.profile.revision === "number" &&
  typeof value.profile.hasLogo === "boolean" &&
  (value.deletion === undefined ||
    value.deletion === null ||
    (object(value.deletion) &&
      typeof value.deletion.status === "string" &&
      typeof value.deletion.executeAfter === "string")) &&
  object(value.general) &&
  typeof value.general.timeZone === "string" &&
  typeof value.general.countryCode === "string" &&
  typeof value.general.calendarRevision === "number" &&
  Array.isArray(value.sources) &&
  value.sources.every(
    (source) =>
      object(source) &&
      typeof source.id === "string" &&
      (source.label === null || typeof source.label === "string") &&
      typeof source.labelKey === "string",
  ) &&
  (value.deletionImpact === null ||
    (object(value.deletionImpact) &&
      Object.values(value.deletionImpact).every(
        (count) => typeof count === "number",
      )));
const isDashboard = (value: unknown): value is Dashboard =>
  object(value) &&
  Array.isArray(value.apps) &&
  value.apps.every(
    (app) =>
      object(app) &&
      typeof app.id === "string" &&
      typeof app.name === "string" &&
      typeof app.status === "string" &&
      typeof app.revision === "number" &&
      strings(app.grants),
  ) &&
  Array.isArray(value.endpoints) &&
  value.endpoints.every(
    (endpoint) =>
      object(endpoint) &&
      typeof endpoint.id === "string" &&
      typeof endpoint.name === "string" &&
      typeof endpoint.url === "string" &&
      typeof endpoint.active === "boolean" &&
      typeof endpoint.revision === "number" &&
      strings(endpoint.events),
  ) &&
  Array.isArray(value.templates) &&
  value.templates.every(
    (template) =>
      object(template) &&
      typeof template.id === "string" &&
      typeof template.name === "string",
  ) &&
  Array.isArray(value.rules) &&
  value.rules.every(
    (rule) =>
      object(rule) &&
      typeof rule.id === "string" &&
      typeof rule.name === "string" &&
      typeof rule.enabled === "boolean" &&
      typeof rule.revision === "number",
  ) &&
  Array.isArray(value.segments) &&
  value.segments.every(
    (segment) =>
      object(segment) &&
      typeof segment.id === "string" &&
      typeof segment.name === "string" &&
      typeof segment.kind === "string" &&
      typeof segment.entity === "string",
  ) &&
  object(value.ai) &&
  typeof value.ai.enabled === "boolean" &&
  (value.ai.provider === null || typeof value.ai.provider === "string") &&
  typeof value.ai.monthlyBudgetMinor === "number" &&
  typeof value.ai.usedMinor === "number";
const isWebforms = (value: unknown): value is FormRow[] =>
  Array.isArray(value) &&
  value.every(
    (row) =>
      object(row) &&
      typeof row.id === "string" &&
      typeof row.name === "string" &&
      typeof row.slug === "string" &&
      ["lead", "ticket"].includes(String(row.entity)) &&
      ["public", "signed_system"].includes(String(row.mode)) &&
      typeof row.active === "boolean",
  );
async function read<T>(
  url: string,
  validate: (value: unknown) => value is T,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store" }),
    value = await response.json().catch(() => null);
  if (!response.ok || !validate(value)) throw new Error("refresh_failed");
  return value;
}
async function json<T = Record<string, unknown>>(
  url: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(url, {
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
export function OperationsSettings({
  locale,
  initialWorkspace,
  initialDashboard,
  initialWebforms,
  membershipId,
}: {
  locale: AppLocale;
  initialWorkspace: Workspace;
  initialDashboard: Dashboard;
  initialWebforms: FormRow[];
  membershipId: string;
}) {
  const vi = locale === "vi",
    [workspace, setWorkspace] = useState(initialWorkspace),
    [dashboard, setDashboard] = useState(initialDashboard),
    [webforms, setWebforms] = useState(initialWebforms),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [secret, setSecret] = useState("");
  const errorText = error
    ? error === "refresh_failed"
      ? vi
        ? "Không thể tải dữ liệu mới. Dữ liệu hợp lệ gần nhất vẫn được giữ lại."
        : "Unable to refresh. The last valid data is still shown."
      : vi
        ? "Không thể hoàn tất thao tác. Hãy kiểm tra dữ liệu và thử lại."
        : "Unable to complete the operation. Check the data and try again."
    : "";
  const impactLabels: Record<string, string> = vi
    ? {
        companies: "Công ty",
        contacts: "Liên hệ",
        leads: "Tiềm năng",
        deals: "Cơ hội",
        orders: "Đơn hàng",
        private_files: "Tệp riêng tư",
      }
    : {};
  const run = async (action: () => Promise<unknown>, message: string) => {
    setError("");
    setNotice("");
    try {
      const result = await action();
      setNotice(message);
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "internal_error");
    }
  };
  const refresh = async () => {
    const [w, d, f] = await Promise.all([
      read("/api/crm/workspace", isWorkspace),
      read("/api/crm/integrations", isDashboard),
      read("/api/crm/webforms", isWebforms),
    ]);
    setWorkspace(w);
    setDashboard(d);
    setWebforms(f);
  };
  function submit(
    handler: (data: FormData) => Promise<unknown>,
    message: string,
  ) {
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const result = await run(
        () => handler(new FormData(event.currentTarget)),
        message,
      );
      if (result)
        try {
          await refresh();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "refresh_failed");
        }
    };
  }
  return (
    <div className="crm-page">
      <header className="space-y-2">
        <h1 className="crm-page-title">
          {vi ? "Tích hợp và vận hành" : "Integrations and operations"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {vi
            ? "Quản lý nguồn vào, ứng dụng, webhook, tự động hóa và vòng đời workspace."
            : "Manage intake, apps, webhooks, automations, and workspace lifecycle."}
        </p>
      </header>
      {error && (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-sm text-destructive">
            {errorText}
          </p>
          {error === "refresh_failed" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void refresh()
                  .then(() => setError(""))
                  .catch(() => setError("refresh_failed"))
              }
            >
              {vi ? "Tải lại dữ liệu" : "Retry refresh"}
            </Button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
      {secret && (
        <p role="status" className="rounded-md border bg-muted p-3 text-xs">
          <strong>{vi ? "Chỉ hiển thị một lần" : "Shown once"}:</strong>{" "}
          <code className="break-all">{secret}</code>
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{vi ? "Không gian làm việc" : "Workspace"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex gap-2"
              onSubmit={submit(
                (data) =>
                  json("/api/crm/workspace", {
                    action: "rename",
                    name: data.get("name"),
                    expectedRevision: workspace.profile.revision,
                  }),
                vi ? "Đã đổi tên." : "Name updated.",
              )}
            >
              <Input
                name="name"
                aria-label={vi ? "Tên không gian làm việc" : "Workspace name"}
                defaultValue={workspace.profile.name}
                maxLength={120}
                required
              />
              <Button type="submit">{vi ? "Lưu" : "Save"}</Button>
            </form>
            <form
              className="space-y-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const file = new FormData(event.currentTarget).get("logo");
                if (!(file instanceof File)) return;
                const result = await run(
                  async () => {
                    const response = await fetch(
                      `/api/crm/workspace/logo?revision=${workspace.profile.revision}`,
                      {
                        method: "PUT",
                        headers: {
                          "content-type": file.type,
                          "x-file-name": file.name,
                        },
                        body: file,
                      },
                    );
                    if (!response.ok)
                      throw new Error(
                        (
                          (await response.json()) as {
                            error?: { code?: string };
                          }
                        ).error?.code,
                      );
                  },
                  vi
                    ? "Đã lưu logo riêng tư trên R2."
                    : "Private R2 logo saved.",
                );
                if (result)
                  try {
                    await refresh();
                  } catch (reason) {
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "refresh_failed",
                    );
                  }
              }}
            >
              <Input
                name="logo"
                aria-label={vi ? "Logo không gian làm việc" : "Workspace logo"}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                required
              />
              <Button type="submit" variant="outline">
                {vi ? "Tải logo lên" : "Upload logo"}
              </Button>
            </form>
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={submit(
                (data) =>
                  json("/api/crm/workspace", {
                    action: "copy-configuration",
                    configuration: {
                      workspaceName: data.get("workspaceName"),
                      timeZone: data.get("timeZone"),
                      countryCode: data.get("countryCode"),
                      sources: workspace.sources.map((source) => ({
                        id: source.id,
                        label: source.label ?? source.labelKey,
                      })),
                      workspaceRevision: workspace.profile.revision,
                      calendarRevision: workspace.general.calendarRevision,
                      apply: data.get("intent") === "apply",
                    },
                  }),
                vi
                  ? "Đã xử lý bản sao cấu hình an toàn."
                  : "Safe configuration copy processed.",
              )}
            >
              <Input
                name="workspaceName"
                aria-label={
                  vi
                    ? "Tên cấu hình không gian làm việc"
                    : "Configuration workspace name"
                }
                defaultValue={workspace.profile.name}
                required
              />
              <Input
                name="timeZone"
                aria-label={vi ? "Múi giờ" : "Time zone"}
                defaultValue={workspace.general.timeZone}
                required
              />
              <Input
                name="countryCode"
                aria-label={vi ? "Mã quốc gia" : "Country code"}
                defaultValue={workspace.general.countryCode}
                minLength={2}
                maxLength={2}
                required
              />
              <div className="flex gap-2">
                <Button
                  name="intent"
                  value="preview"
                  type="submit"
                  variant="outline"
                >
                  {vi ? "Xem trước" : "Preview"}
                </Button>
                <Button name="intent" value="apply" type="submit">
                  {vi ? "Áp dụng" : "Apply"}
                </Button>
              </div>
            </form>
            <p className="text-xs text-muted-foreground">
              {vi
                ? "Nội dung file nằm trong R2 riêng tư; D1 chỉ giữ metadata."
                : "File bytes stay in private R2; D1 stores metadata only."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{vi ? "Biểu mẫu web" : "Webforms"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={submit(
                async (data) => {
                  const entity = String(data.get("entity"));
                  const result = await json("/api/crm/webforms", {
                    name: data.get("name"),
                    slug: data.get("slug"),
                    entity,
                    mode: data.get("mode"),
                    source: entity === "lead" ? "manual" : "website",
                    mapping:
                      entity === "lead"
                        ? { name: "firstName", email: "email" }
                        : { subject: "subject", description: "description" },
                    allowMissingRequired: false,
                    rateLimitHour: 60,
                  });
                  if (typeof result.token === "string") setSecret(result.token);
                  return result;
                },
                vi ? "Đã tạo webform." : "Webform created.",
              )}
            >
              <Input
                name="name"
                aria-label={vi ? "Tên biểu mẫu" : "Form name"}
                placeholder={vi ? "Tên form" : "Form name"}
                required
              />
              <Input
                name="slug"
                aria-label={vi ? "Đường dẫn biểu mẫu" : "Form slug"}
                placeholder="website-leads"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
              />
              <select
                name="entity"
                aria-label={vi ? "Loại bản ghi" : "Record type"}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="lead">{vi ? "Tiềm năng" : "Lead"}</option>
                <option value="ticket">Ticket</option>
              </select>
              <select
                name="mode"
                aria-label={vi ? "Chế độ truy cập" : "Access mode"}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="public">{vi ? "Công khai" : "Public"}</option>
                <option value="signed_system">
                  {vi ? "Hệ thống có chữ ký" : "Signed system"}
                </option>
              </select>
              <Button className="sm:col-span-2" type="submit">
                {vi ? "Tạo form" : "Create form"}
              </Button>
            </form>
            <ul className="space-y-1 text-xs">
              {webforms.map((form) => (
                <li key={form.id}>
                  {form.name} · <code>{form.slug}</code> ·{" "}
                  {form.entity === "lead"
                    ? vi
                      ? "Tiềm năng"
                      : "Lead"
                    : "Ticket"}{" "}
                  ·{" "}
                  {form.active
                    ? vi
                      ? "đang bật"
                      : "active"
                    : vi
                      ? "đang tắt"
                      : "disabled"}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Webhooks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="grid gap-2"
              onSubmit={submit(
                async (data) => {
                  const result = await json("/api/crm/integrations", {
                    action: "create-endpoint",
                    data: {
                      name: data.get("name"),
                      url: data.get("url"),
                      events: String(data.get("events"))
                        .split(",")
                        .map((x) => x.trim()),
                    },
                  });
                  if (typeof result.secret === "string")
                    setSecret(result.secret);
                  return result;
                },
                vi ? "Đã tạo webhook." : "Webhook created.",
              )}
            >
              <Input
                name="name"
                aria-label={vi ? "Tên webhook" : "Webhook name"}
                placeholder={vi ? "Đầu nhận CRM" : "CRM receiver"}
                required
              />
              <Input
                name="url"
                aria-label="Webhook URL"
                type="url"
                placeholder="https://example.com/hooks"
                required
              />
              <Input
                name="events"
                aria-label={vi ? "Sự kiện webhook" : "Webhook events"}
                defaultValue="lead.created"
                required
              />
              <Button type="submit">
                {vi ? "Tạo endpoint" : "Create endpoint"}
              </Button>
            </form>
            <ul className="text-xs">
              {dashboard.endpoints.map((item) => (
                <li
                  className="flex items-center justify-between gap-2"
                  key={item.id}
                >
                  <span>
                    {item.name} · {item.url} · {item.events.join(", ")}
                  </span>
                  {item.active && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void run(
                          async () => {
                            await json("/api/crm/integrations", {
                              action: "disable-endpoint",
                              id: item.id,
                              revision: item.revision,
                            });
                            await refresh();
                          },
                          vi ? "Đã ngắt webhook." : "Webhook disconnected.",
                        )
                      }
                    >
                      {vi ? "Ngắt" : "Disconnect"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{vi ? "Mẫu email" : "Email templates"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="grid gap-2"
              onSubmit={submit(
                (data) =>
                  json("/api/crm/integrations", {
                    action: "create-template",
                    data: {
                      name: data.get("name"),
                      subject: data.get("subject"),
                      body: data.get("body"),
                      requiredVariables: String(data.get("variables"))
                        .split(",")
                        .filter(Boolean),
                    },
                  }),
                vi ? "Đã tạo mẫu." : "Template created.",
              )}
            >
              <Input
                name="name"
                aria-label={vi ? "Tên mẫu" : "Template name"}
                placeholder={vi ? "Tên mẫu" : "Template name"}
                required
              />
              <Input
                name="subject"
                aria-label={vi ? "Tiêu đề email" : "Email subject"}
                placeholder={vi ? "Xin chào {{name}}" : "Hello {{name}}"}
                required
              />
              <textarea
                name="body"
                aria-label={vi ? "Nội dung email" : "Email body"}
                className="min-h-24 rounded-md border bg-background p-3 text-sm"
                placeholder={
                  vi ? "Tài khoản: {{account}}" : "Account: {{account}}"
                }
                required
              />
              <Input
                name="variables"
                aria-label={vi ? "Biến bắt buộc" : "Required variables"}
                placeholder="name,account"
              />
              <Button type="submit">
                {vi ? "Tạo mẫu" : "Create template"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              {vi
                ? "Bản xem trước sẽ chặn khi thiếu biến bắt buộc. Gửi email chưa bật khi chưa cấu hình kênh."
                : "Preview blocks missing variables. Sending remains off until a channel is configured."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {vi ? "Tự động hóa và phân khúc" : "Automation and segments"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="grid gap-2"
              onSubmit={submit(
                (data) =>
                  json("/api/crm/integrations", {
                    action: "create-automation",
                    data: {
                      name: data.get("name"),
                      eventType: "lead.created",
                      condition: { field: "source", equals: "website" },
                      action: {
                        type: "set-lead-owner",
                        leadIdField: "leadId",
                        membershipId,
                      },
                      enabled: true,
                      maxDepth: 3,
                    },
                  }),
                vi ? "Đã tạo tự động hóa." : "Automation created.",
              )}
            >
              <Input
                name="name"
                aria-label={vi ? "Tên tự động hóa" : "Automation name"}
                placeholder={vi ? "Gán lead website" : "Assign website leads"}
                required
              />
              <Button type="submit">
                {vi ? "Tạo tự động hóa" : "Create automation"}
              </Button>
            </form>
            <ul className="space-y-2 text-xs">
              {dashboard.rules.map((rule) => (
                <li
                  className="flex items-center justify-between gap-2"
                  key={rule.id}
                >
                  <span>
                    {rule.name} ·{" "}
                    {rule.enabled
                      ? vi
                        ? "đang bật"
                        : "enabled"
                      : vi
                        ? "đang tắt"
                        : "disabled"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void run(
                        async () => {
                          await json("/api/crm/integrations", {
                            action: "set-automation-enabled",
                            id: rule.id,
                            revision: rule.revision,
                            enabled: !rule.enabled,
                          });
                          await refresh();
                        },
                        vi ? "Đã cập nhật tự động hóa." : "Automation updated.",
                      )
                    }
                  >
                    {rule.enabled
                      ? vi
                        ? "Tắt"
                        : "Disable"
                      : vi
                        ? "Bật"
                        : "Enable"}
                  </Button>
                </li>
              ))}
            </ul>
            <form
              className="grid gap-2"
              onSubmit={submit(
                (data) =>
                  json("/api/crm/integrations", {
                    action: "create-segment",
                    data: {
                      name: data.get("name"),
                      entity: "lead",
                      kind: "dynamic",
                      filter: { field: "status", equals: "new" },
                      memberIds: [],
                    },
                  }),
                vi ? "Đã tạo phân khúc." : "Segment created.",
              )}
            >
              <Input
                name="name"
                aria-label={vi ? "Tên phân khúc" : "Segment name"}
                placeholder={vi ? "Lead mới" : "New leads"}
                required
              />
              <Button type="submit">
                {vi ? "Tạo phân khúc động" : "Create dynamic segment"}
              </Button>
            </form>
            <p className="text-xs">
              {dashboard.segments
                .map(
                  (item) =>
                    `${item.name} (${vi && item.kind === "dynamic" ? "động" : vi && item.kind === "static" ? "tĩnh" : item.kind})`,
                )
                .join(" · ") || (vi ? "Chưa có phân khúc." : "No segments.")}
            </p>
            <p className="text-xs text-muted-foreground">
              {vi
                ? "Tự động hóa chỉ chạy khi chủ sở hữu bật, giữ quyền thực thi và giới hạn vòng lặp 1–5."
                : "Automations run only when enabled by the owner, retain execution authority, and cap loops at 1–5."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {dashboard.ai.enabled
                ? vi
                  ? "Đang bật"
                  : "Enabled"
                : vi
                  ? "Đang tắt"
                  : "Disabled"}{" "}
              ·{" "}
              {dashboard.ai.provider ??
                (vi ? "chưa chọn nhà cung cấp" : "no provider")}{" "}
              · {dashboard.ai.usedMinor}/{dashboard.ai.monthlyBudgetMinor}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {vi
                ? "AI không phát sinh cuộc gọi hoặc chi phí khi chưa chọn nhà cung cấp và ngân sách bằng 0."
                : "AI makes no calls and incurs no cost while provider is unset and budget is zero."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {vi ? "Xóa không gian làm việc" : "Workspace deletion"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {vi
                ? "Chủ sở hữu phải nhập đúng tên. Có 30 ngày để hủy; dữ liệu và lịch sử được giữ tới thời điểm thực thi."
                : "Owner must enter the exact name. Cancellation remains available for 30 days; data and history remain until execution."}
            </p>
            <p className="text-xs">
              {workspace.deletionImpact &&
                Object.entries(workspace.deletionImpact)
                  .map(
                    ([key, value]) => `${impactLabels[key] ?? key}: ${value}`,
                  )
                  .join(" · ")}
            </p>
            <form
              className="flex gap-2"
              onSubmit={submit(
                (data) =>
                  json("/api/crm/workspace", {
                    action: "schedule-deletion",
                    confirmation: data.get("confirmation"),
                  }),
                vi ? "Đã lên lịch xóa." : "Deletion scheduled.",
              )}
            >
              <Input
                name="confirmation"
                aria-label={
                  vi
                    ? "Xác nhận tên không gian làm việc"
                    : "Confirm workspace name"
                }
                placeholder={workspace.profile.name}
                required
              />
              <Button type="submit" variant="destructive">
                {vi ? "Lên lịch xóa" : "Schedule deletion"}
              </Button>
            </form>
            {workspace.deletion?.status === "scheduled" &&
              Date.parse(workspace.deletion.executeAfter) <= Date.now() && (
                <Button
                  variant="destructive"
                  onClick={() =>
                    void run(
                      () =>
                        json("/api/crm/workspace", {
                          action: "execute-deletion",
                          confirmation: workspace.profile.name,
                        }),
                      vi
                        ? "Không gian làm việc đã bị xóa."
                        : "Workspace deleted.",
                    )
                  }
                >
                  {vi ? "Xóa vĩnh viễn" : "Delete permanently"}
                </Button>
              )}
            {workspace.deletion?.status === "scheduled" && (
              <Button
                variant="outline"
                onClick={() =>
                  void run(
                    async () => {
                      await json("/api/crm/workspace", {
                        action: "cancel-deletion",
                      });
                      await refresh();
                    },
                    vi ? "Đã hủy yêu cầu xóa." : "Deletion cancelled.",
                  )
                }
              >
                {vi ? "Hủy yêu cầu" : "Cancel request"}
              </Button>
            )}
            {workspace.deletion?.status === "executing" && (
              <Button
                variant="outline"
                onClick={() =>
                  void run(
                    async () => {
                      await json("/api/crm/workspace", {
                        action: "retry-deletion",
                      });
                      await refresh();
                    },
                    vi ? "Đã thử lại việc xóa file R2." : "R2 cleanup retried.",
                  )
                }
              >
                {vi ? "Thử lại xóa file" : "Retry file cleanup"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
