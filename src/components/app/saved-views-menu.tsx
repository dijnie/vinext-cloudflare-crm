"use client";
import { pushListQuery } from "./list-navigation";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, Checkmark, OverflowMenuHorizontal } from "@carbon/icons-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { captureSavedViewState, type SavedView } from "@/lib/services/saved-views/saved-view-contracts";
import type { EntityType } from "@/lib/listing/list-state";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { crmRequest, requestError } from "./record-types";

export function SavedViewsMenu({ entity, labels }: { entity: EntityType; labels: CrmDictionary }) {
  const path = usePathname(); const search = useSearchParams();
  const [views, setViews] = useState<SavedView[]>([]); const [revision, setRevision] = useState(0); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SavedView | "new" | null>(null); const [name, setName] = useState(""); const [shared, setShared] = useState(false); const [deleting, setDeleting] = useState<SavedView | null>(null);
  useEffect(() => { const controller = new AbortController(); setLoading(true); crmRequest<SavedView[]>(`/api/crm/saved-views?entity=${entity}`, { signal: controller.signal }).then(setViews).catch(() => { if (!controller.signal.aborted) setError(labels.error); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [entity, revision, labels]);
  const [notice, setNotice] = useState("");
  const defaultPending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function setDefault(view: SavedView) {
    if (busy || defaultPending.current) return;
    defaultPending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await crmRequest<{ entity: EntityType; viewId: string | null }>("/api/crm/saved-views/default", { method: "PUT", body: JSON.stringify({ entity, viewId: view.isDefault ? null : view.id }) });
      if (mounted.current) { setRevision(value => value + 1); setNotice(labels.views.defaultSaved); }
    } catch (reason) { if (mounted.current) setError(requestError(reason, labels)); }
    finally { defaultPending.current = false; if (mounted.current) setBusy(false); }
  }
  const selected = views.find(view => view.id === search.get("view"));
  const changed = selected ? captureSavedViewState(entity, new URLSearchParams(search.toString())).query !== selected.state.query : false;
  async function mutate(method: string, id: string | null, body?: unknown) { setBusy(true); setError(""); try { const result = await crmRequest<SavedView>(`/api/crm/saved-views${id ? `/${id}` : ""}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }); setRevision(value => value + 1); setEditing(null); setDeleting(null); if (method === "POST") { const next = new URLSearchParams(search.toString()); next.set("view", result.id); pushListQuery(`${path}?${next}`); } if (method === "DELETE" && search.get("view") === id) { const next = new URLSearchParams(search.toString()); next.delete("view"); pushListQuery(`${path}?${next}`); } } catch (reason) { setError(requestError(reason, labels)); } finally { setBusy(false); } }
  function apply(view: SavedView) { const next = new URLSearchParams(view.state.query); for (const key of ["recordType", "recordId", "tab"]) { const value = search.get(key); if (value) next.set(key, value); } next.set("view", view.id); pushListQuery(`${path}?${next}`); }
  function edit(view: SavedView | "new") { setError(""); setEditing(view); setName(view === "new" ? "" : view.name); setShared(view === "new" ? false : view.shared); }
  return <>
    {notice && <span role="status" className="sr-only">{notice}</span>}
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" title={changed ? labels.views.changed : undefined}><Bookmark />{selected?.name ?? labels.views.title}{changed && <span aria-label={labels.views.changed}>•</span>}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-56 max-w-80">
      <DropdownMenuItem disabled={busy} onSelect={() => edit("new")}>{labels.views.add}</DropdownMenuItem>
      <DropdownMenuSeparator />
      {loading && <DropdownMenuItem disabled>{labels.loading}</DropdownMenuItem>}
      {!loading && !views.length && <DropdownMenuItem disabled>{labels.views.empty}</DropdownMenuItem>}
      {([true, false] as const).map(mine => <section key={String(mine)}>
        {views.some(view => view.mine === mine) && <DropdownMenuLabel>{mine ? labels.views.mine : labels.views.workspace}</DropdownMenuLabel>}
        {views.filter(view => view.mine === mine).map(view => <div key={view.id} className="flex items-center gap-1">
          <DropdownMenuItem aria-label={view.name} aria-describedby={view.isDefault ? `default-view-${view.id}` : undefined} className="min-w-0 flex-1" onSelect={() => apply(view)}><span className="min-w-0"><span className="block truncate">{view.name}</span>{view.isDefault && <span id={`default-view-${view.id}`} className="block text-[10px] text-muted-foreground">{labels.views.default}</span>}</span>{selected?.id === view.id && <Checkmark aria-hidden="true" className="ml-auto" />}</DropdownMenuItem>
          <DropdownMenuSub><DropdownMenuSubTrigger aria-label={`${view.mine ? labels.edit : labels.views.options} ${view.name}`} className="shrink-0"><OverflowMenuHorizontal /></DropdownMenuSubTrigger><DropdownMenuSubContent>
            <DropdownMenuLabel>{view.shared ? labels.views.shared : labels.views.private}</DropdownMenuLabel>
            <DropdownMenuItem disabled={busy || loading} onSelect={event => { event.preventDefault(); void setDefault(view); }}>{view.isDefault ? labels.views.clearDefault : labels.views.setDefault}</DropdownMenuItem>
            {view.mine && <><DropdownMenuSeparator /><DropdownMenuItem disabled={busy} onSelect={() => edit(view)}>{labels.edit}</DropdownMenuItem><DropdownMenuItem disabled={busy} onSelect={() => void mutate("PATCH", view.id, { state: captureSavedViewState(entity, new URLSearchParams(search.toString())) })}>{labels.views.update}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" disabled={busy} onSelect={() => { setError(""); setDeleting(view); }}>{labels.views.delete}</DropdownMenuItem></>}
          </DropdownMenuSubContent></DropdownMenuSub>
        </div>)}
      </section>)}
      {error && !editing && !deleting && <><DropdownMenuSeparator /><p role="alert" className="px-2 text-xs text-destructive">{error}</p><DropdownMenuItem onSelect={event => { event.preventDefault(); setError(""); setRevision(value => value + 1); }}>{labels.retry}</DropdownMenuItem></>}
    </DropdownMenuContent></DropdownMenu>
    <Dialog open={Boolean(editing)} onOpenChange={value => { if (!value && !busy) setEditing(null); }}><DialogContent closeLabel={labels.close}><DialogTitle>{editing === "new" ? labels.views.add : labels.views.rename}</DialogTitle><DialogDescription>{labels.views.description}</DialogDescription><form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!editing) return; void mutate(editing === "new" ? "POST" : "PATCH", editing === "new" ? null : editing.id, editing === "new" ? { entity, name: name.trim(), shared, state: captureSavedViewState(entity, new URLSearchParams(search.toString())) } : { name: name.trim(), shared }); }}><label className="block space-y-1 text-sm">{labels.views.name}<Input value={name} onChange={event => setName(event.target.value)} required maxLength={120} disabled={busy} /></label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={shared} disabled={busy} onChange={event => setShared(event.target.checked)} />{labels.views.shared}</label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>{labels.cancel}</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? labels.loading : labels.save}</Button></div></form></DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={value => { if (!value && !busy) setDeleting(null); }}><DialogContent closeLabel={labels.close}><DialogTitle>{labels.views.delete} · {deleting?.name}</DialogTitle><DialogDescription>{labels.views.deleteConfirm}</DialogDescription>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>{labels.cancel}</Button><Button variant="destructive" disabled={busy} onClick={() => { if (deleting?.mine) void mutate("DELETE", deleting.id); }}>{busy ? labels.loading : labels.views.delete}</Button></div></DialogContent></Dialog>
  </>;
}
