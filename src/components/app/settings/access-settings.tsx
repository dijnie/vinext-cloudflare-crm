"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAccessDictionary, type AccessDictionary } from "@/lib/i18n/access-dictionary";
import type { AppLocale } from "@/lib/i18n/config";
import { accessMutationSchema, DEFAULT_PROFILE_ID, PERMISSIONS, type AccessMutation, type AccessSettings as Settings } from "@/lib/services/permissions/access-contracts";

type Editor =
  | { kind: "branch"; branch?: Settings["branches"][number] }
  | { kind: "profile"; profile?: Settings["profiles"][number] }
  | { kind: "member-profile" | "member-branches"; member: Settings["members"][number] }
  | { kind: "confirm"; input: AccessMutation; name: string; description: string };

export function AccessSettings({ initialData, locale }: { initialData: Settings; locale: AppLocale }) {
  const labels = getAccessDictionary(locale);
  const [data, setData] = useState(initialData);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const mounted = useRef(true);
  const trigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  function open(next: Editor) {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError(""); setNotice(""); setEditor(next);
  }
  async function mutate(input: AccessMutation) {
    if (pending.current) return;
    const parsed = accessMutationSchema.safeParse(input);
    if (!parsed.success) { setError(labels.errors.validation_failed); return; }
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/crm/access", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
        const code = body?.error?.code;
        throw new Error(code ?? (response.status === 401 ? "authentication_required" : "internal_error"));
      }
      const next = await response.json() as Settings;
      if (mounted.current) { setData(next); setNotice(labels.saved); setEditor(null); }
    } catch (reason) {
      if (mounted.current) {
        const code = reason instanceof Error ? reason.message : "internal_error";
        setError(labels.errors[code as keyof typeof labels.errors] ?? labels.errors.internal_error);
      }
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  const profileName = (profile: Settings["profiles"][number]) => profile.id === DEFAULT_PROFILE_ID ? labels.standard : profile.name;
  const title = !editor ? "" : editor.kind === "branch" ? editor.branch ? labels.renameBranch : labels.createBranch : editor.kind === "profile" ? editor.profile ? labels.editProfile : labels.createProfile : editor.kind === "member-profile" ? labels.assignProfile : editor.kind === "member-branches" ? labels.assignBranches : labels.confirm;
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
    <header className="space-y-2"><h1 ref={heading} tabIndex={-1} className="text-2xl font-medium tracking-tight md:text-3xl">{labels.title}</h1><p className="max-w-3xl text-sm text-muted-foreground">{labels.shared}</p></header>
    {notice && <p role="status" className="text-xs text-success">{notice}</p>}
    {!editor && error && <p ref={errorRef} tabIndex={-1} role="alert" className="text-xs text-destructive">{error}</p>}
    <Card><CardHeader><CardTitle><h2>{labels.branches}</h2></CardTitle><CardDescription>{labels.branchHelp}</CardDescription></CardHeader><CardContent>
      <div><Button disabled={busy} onClick={() => open({ kind: "branch" })}>{labels.createBranch}</Button></div>
      {data.branches.length === 0 && <p className="text-sm text-muted-foreground">{labels.empty}</p>}
      <ul className="divide-y">{data.branches.map(branch => <li key={branch.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="break-words text-sm font-medium">{branch.name}</p><p className="text-xs text-muted-foreground">{branch.isDefault ? labels.default : branch.archivedAt ? labels.archived : labels.active}</p></div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} aria-label={`${labels.renameBranch}: ${branch.name}`} onClick={() => open({ kind: "branch", branch })}>{labels.edit}</Button>
          {!branch.isDefault && !branch.archivedAt && <Button size="sm" variant="outline" disabled={busy} aria-label={`${labels.setDefault}: ${branch.name}`} onClick={() => void mutate({ action: "set-default-branch", id: branch.id })}>{labels.setDefault}</Button>}
          {branch.archivedAt ? <Button size="sm" variant="outline" disabled={busy} aria-label={`${labels.restore}: ${branch.name}`} onClick={() => void mutate({ action: "restore-branch", id: branch.id })}>{labels.restore}</Button> : <Button size="sm" variant="outline" disabled={busy || branch.isDefault} aria-label={`${labels.archive}: ${branch.name}`} onClick={() => open({ kind: "confirm", input: { action: "archive-branch", id: branch.id }, name: branch.name, description: labels.archiveHelp })}>{labels.archive}</Button>}
        </div>
      </li>)}</ul>
    </CardContent></Card>
    <Card><CardHeader><CardTitle><h2>{labels.profiles}</h2></CardTitle><CardDescription>{labels.profileHelp}</CardDescription></CardHeader><CardContent>
      <div><Button disabled={busy} onClick={() => open({ kind: "profile" })}>{labels.createProfile}</Button></div>
      <p className="text-xs text-muted-foreground">{labels.ownerHelp} {labels.exportHelp}</p>
      <ul className="divide-y">{data.profiles.map(profile => <li key={profile.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
        <div className="min-w-0 flex-1 space-y-1"><h3 className="break-words text-sm font-medium">{profileName(profile)}{profile.isDefault && <span className="ml-2 text-xs font-normal text-muted-foreground">{labels.default}</span>}</h3><p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{profile.grants.length ? profile.grants.map(grant => labels.permissions[grant]).join(" · ") : labels.noGrants}</p></div>
        {profile.id !== DEFAULT_PROFILE_ID && !profile.isDefault && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} aria-label={`${labels.editProfile}: ${profile.name}`} onClick={() => open({ kind: "profile", profile })}>{labels.edit}</Button><Button size="sm" variant="outline" disabled={busy} aria-label={`${labels.remove}: ${profile.name}`} onClick={() => open({ kind: "confirm", input: { action: "delete-profile", id: profile.id }, name: profile.name, description: labels.deleteHelp })}>{labels.remove}</Button></div>}
      </li>)}</ul>
    </CardContent></Card>
    <Card><CardHeader><CardTitle><h2>{labels.members}</h2></CardTitle><CardDescription>{labels.memberHelp}</CardDescription></CardHeader><CardContent>
      {data.members.length === 0 && <p className="text-sm text-muted-foreground">{labels.empty}</p>}
      <ul className="divide-y">{data.members.map(member => {
        const profile = data.profiles.find(item => item.id === member.profileId);
        return <li key={member.membershipId} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0 space-y-1"><h3 className="break-words text-sm font-medium">{member.name}</h3><p className="text-xs text-muted-foreground">{labels[member.role]} · {labels[member.status]}</p><p className="text-xs">{labels.profile}: {profile ? profileName(profile) : "—"}</p>
            <p className="text-xs text-muted-foreground">{member.branchIds.length ? member.branchIds.map(id => { const branch = data.branches.find(item => item.id === id); return `${branch?.name ?? "—"}${id === member.primaryBranchId ? ` (${labels.primary})` : ""}${branch?.archivedAt ? ` (${labels.archived})` : ""}`; }).join(" · ") : labels.noBranches}</p>
          </div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || member.status === "revoked"} aria-label={`${labels.assignProfile}: ${member.name}`} onClick={() => open({ kind: "member-profile", member })}>{labels.assignProfile}</Button><Button size="sm" variant="outline" disabled={busy || member.status === "revoked"} aria-label={`${labels.assignBranches}: ${member.name}`} onClick={() => open({ kind: "member-branches", member })}>{labels.assignBranches}</Button></div>
        </li>;
      })}</ul>
    </CardContent></Card>
    <Dialog open={editor !== null} onOpenChange={value => { if (!value && !pending.current) { setEditor(null); setError(""); } }}><DialogContent closeLabel={labels.close} showCloseButton={!busy} className="max-h-[90svh] overflow-y-auto" onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus(); else heading.current?.focus(); }}>
      <DialogTitle>{title}</DialogTitle><DialogDescription>{editor?.kind === "confirm" ? `${editor.name}. ${editor.description}` : editor?.kind === "profile" ? labels.profileHelp : editor?.kind === "branch" ? labels.branchHelp : editor && "member" in editor ? `${editor.member.name}. ${labels.memberHelp}` : labels.shared}</DialogDescription>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="text-xs text-destructive">{error}</p>}
      {editor && <EditorForm editor={editor} data={data} labels={labels} busy={busy} onSave={input => void mutate(input)} onCancel={() => { setEditor(null); setError(""); }} />}
    </DialogContent></Dialog>
  </div>;
}

function EditorForm({ editor, data, labels, busy, onSave, onCancel }: { editor: Editor; data: Settings; labels: AccessDictionary; busy: boolean; onSave: (input: AccessMutation) => void; onCancel: () => void }) {
  const [branchIds, setBranchIds] = useState(editor.kind === "member-branches" ? editor.member.branchIds : []);
  const [primary, setPrimary] = useState(editor.kind === "member-branches" ? editor.member.primaryBranchId ?? "" : "");
  const [profileId, setProfileId] = useState(editor.kind === "member-profile" ? editor.member.profileId : DEFAULT_PROFILE_ID);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (editor.kind === "confirm") return onSave(editor.input);
    if (editor.kind === "branch") return onSave(editor.branch ? { action: "rename-branch", id: editor.branch.id, name: String(form.get("name")) } : { action: "create-branch", name: String(form.get("name")) });
    if (editor.kind === "profile") {
      const grants = PERMISSIONS.filter(permission => form.has(permission));
      return onSave(editor.profile ? { action: "update-profile", id: editor.profile.id, name: String(form.get("name")), grants } : { action: "create-profile", name: String(form.get("name")), grants });
    }
    if (editor.kind === "member-profile") return onSave({ action: "assign-profile", membershipId: editor.member.membershipId, profileId });
    return onSave({ action: "assign-branches", membershipId: editor.member.membershipId, branchIds, primaryBranchId: primary || null });
  }
  return <form onSubmit={submit} className="space-y-4" aria-busy={busy}><fieldset disabled={busy} className="space-y-4">
    {(editor.kind === "branch" || editor.kind === "profile") && <label className="block space-y-1 text-xs"><span>{labels.name}</span><Input name="name" autoFocus required maxLength={120} defaultValue={editor.kind === "branch" ? editor.branch?.name : editor.profile?.name} /></label>}
    {editor.kind === "profile" && <fieldset className="space-y-3"><legend className="mb-2 text-xs font-medium">{labels.grants}</legend><div className="grid gap-3 sm:grid-cols-2">{PERMISSIONS.map(permission => <label key={permission} className="flex items-start gap-2 text-xs"><input type="checkbox" name={permission} defaultChecked={editor.profile?.grants.includes(permission) ?? false} className="mt-0.5 size-4 accent-primary" />{labels.permissions[permission]}</label>)}</div><p className="text-xs text-muted-foreground">{labels.exportHelp}</p></fieldset>}
    {editor.kind === "member-profile" && <div className="space-y-2"><p className="text-xs text-muted-foreground">{labels.ownerHelp}</p><Select value={profileId} onValueChange={setProfileId} disabled={busy}><SelectTrigger aria-label={labels.profile}><SelectValue /></SelectTrigger><SelectContent>{data.profiles.map(profile => <SelectItem key={profile.id} value={profile.id}>{profile.id === DEFAULT_PROFILE_ID ? labels.standard : profile.name}</SelectItem>)}</SelectContent></Select></div>}
    {editor.kind === "member-branches" && <><fieldset className="space-y-3"><legend className="mb-2 text-xs font-medium">{labels.branches}</legend>{data.branches.filter(branch => !branch.archivedAt || branchIds.includes(branch.id)).map(branch => <label key={branch.id} className="flex items-center gap-2 text-xs"><input type="checkbox" className="size-4 accent-primary" checked={branchIds.includes(branch.id)} onChange={event => { const next = event.currentTarget.checked ? [...branchIds, branch.id] : branchIds.filter(id => id !== branch.id); setBranchIds(next); if (!next.includes(primary)) setPrimary(next[0] ?? ""); }} />{branch.name}{branch.archivedAt ? ` (${labels.archived})` : ""}</label>)}</fieldset>{branchIds.length > 0 ? <Select value={primary} onValueChange={setPrimary} disabled={busy}><SelectTrigger aria-label={labels.primary}><SelectValue placeholder={labels.primary} /></SelectTrigger><SelectContent>{data.branches.filter(branch => branchIds.includes(branch.id)).map(branch => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select> : <p className="text-xs text-muted-foreground">{labels.noBranches}</p>}</>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{labels.cancel}</Button><Button type="submit" variant={editor.kind === "confirm" ? "destructive" : "default"} disabled={busy || editor.kind === "member-branches" && branchIds.length > 0 && !primary}>{busy ? labels.saving : editor.kind === "confirm" ? labels.confirm : labels.save}</Button></div>
  </fieldset></form>;
}
