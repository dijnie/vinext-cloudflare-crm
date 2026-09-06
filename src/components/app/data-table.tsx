"use client";
import { ArrowDown, ArrowsVertical, ArrowUp } from "@carbon/icons-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Table as TanStackTable } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";

export function DataTable<TData>({ table, emptyLabel = "No results.", sort, dir, sortable = [], onSort, labels, onRowOpen, columnClasses = {} }: { table: TanStackTable<TData>; emptyLabel?: string; sort?: string; dir?: string; sortable?: string[]; onSort?: (key: string, direction: string) => void; labels?: CrmDictionary; columnClasses?: Record<string, string>; onRowOpen?: (record: TData, trigger: HTMLElement) => void }) {
  return <Table containerClassName="overflow-visible" className="table-fixed text-xs [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4">
    <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:bg-muted"><TableRow>{table.getHeaderGroups().flatMap(group => group.headers).map(header => {
      const content = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext());
      return <TableHead key={header.id} className={`h-11 px-3 font-normal text-muted-foreground ${header.id === "select" ? "w-10 hidden sm:table-cell" : columnClasses[header.id] ?? ""}`} aria-sort={sort === header.id ? dir === "asc" ? "ascending" : "descending" : undefined}>{sortable.includes(header.id) && onSort && labels ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="xs" className="-ml-2 font-normal text-muted-foreground">{content}{sort === header.id ? dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowsVertical size={12} className="opacity-40" />}</Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => onSort(header.id, "asc")}><ArrowUp />{labels.asc}</DropdownMenuItem><DropdownMenuItem onSelect={() => onSort(header.id, "desc")}><ArrowDown />{labels.desc}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : content}</TableHead>;
    })}</TableRow></TableHeader>
    <TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map(row => <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined} className={onRowOpen ? "cursor-pointer hover:bg-muted/50" : ""} onClick={event => {
      if (!onRowOpen || !event.currentTarget.contains(event.target as Node) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (event.target as HTMLElement).closest("a,button,input,label,[role=checkbox],[role=menuitem]")) return;
      const trigger = event.currentTarget.querySelector<HTMLElement>("[data-record-link]") ?? event.currentTarget;
      onRowOpen(row.original, trigger);
    }}>{row.getVisibleCells().map(cell => <TableCell key={cell.id} className={`overflow-hidden px-3 py-3 ${cell.column.id === "select" ? "w-10 hidden sm:table-cell" : columnClasses[cell.column.id] ?? ""}`} onClick={cell.column.id === "select" ? event => event.stopPropagation() : undefined}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={table.getAllColumns().length} className="h-64 text-center text-muted-foreground">{emptyLabel}</TableCell></TableRow>}</TableBody>
  </Table>;
}
