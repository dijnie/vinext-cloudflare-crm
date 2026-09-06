"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMPTY = "__unassigned__";
export function FormSelect({ id, name, value, defaultValue, onValueChange, options, placeholder, disabled, required, describedBy, busy }: { id: string; name?: string; value?: string; defaultValue?: string; onValueChange?: (value: string) => void; options: { value: string; label: string; disabled?: boolean }[]; placeholder?: string; disabled?: boolean; required?: boolean; describedBy?: string; busy?: boolean }) {
  return <div onInvalidCapture={event => { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus(); }}><Select name={name} value={value === undefined ? undefined : value || (required ? "" : EMPTY)} defaultValue={defaultValue === undefined ? undefined : defaultValue || (required ? "" : EMPTY)} onValueChange={next => onValueChange?.(next === EMPTY ? "" : next)} disabled={disabled} required={required}><SelectTrigger className="w-full" id={id} aria-describedby={describedBy} aria-busy={busy}><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} data-value={option.value} value={option.value || EMPTY} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
}
