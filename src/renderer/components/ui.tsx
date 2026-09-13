import React, { useEffect, useId, useRef } from "react";
import { Filter, Search, X } from "lucide-react";

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };
export const Field = React.forwardRef<HTMLInputElement, FieldProps>(({ label, error, id, ...props }, ref) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  return <label htmlFor={inputId}><span>{label}</span><input id={inputId} ref={ref} aria-invalid={!!error} aria-describedby={error ? `${inputId}-error` : undefined} {...props} />{error && <small id={`${inputId}-error`}>{error}</small>}</label>;
});
Field.displayName = "Field";

type SelectFieldProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string };
export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(({ label, error, id, children, ...props }, ref) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  return <label htmlFor={inputId}><span>{label}</span><select id={inputId} ref={ref} aria-invalid={!!error} aria-describedby={error ? `${inputId}-error` : undefined} {...props}>{children}</select>{error && <small id={`${inputId}-error`}>{error}</small>}</label>;
});
SelectField.displayName = "SelectField";

export function Modal({ title, children, onClose, className = "" }: { title: string; children: React.ReactNode; onClose: () => void; className?: string }) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="shade" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={panel} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={(event) => event.key === "Escape" && onClose()}><header><h2 id={titleId}>{title}</h2><button type="button" className="ghost" onClick={onClose}>Close</button></header>{children}</section></div>;
}

export function Badge({ text }: { text: React.ReactNode }) {
  return <span className={`badge badge--${String(text).toLowerCase().replaceAll(" ", "-")}`}>{text}</span>;
}

export function Table({ heads, rows, emptyText = "Nothing here yet." }: { heads: string[]; rows: React.ReactNode[][]; emptyText?: string }) {
  return <div className="tableWrap" role="region" aria-label="Scrollable data table" tabIndex={0}><table><thead><tr>{heads.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} data-label={heads[cellIndex]}>{cell}</td>)}</tr>) : <tr><td colSpan={heads.length} className="empty">{emptyText}</td></tr>}</tbody></table></div>;
}

export function Page({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <main className="page"><header className="pageHead"><h1>{title}</h1>{action && <div className="pageActions">{action}</div>}</header>{children}</main>;
}

export function Stat({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

export type DataFilter = { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> };
export function DataToolbar({ value, onChange, placeholder, label = "Search", filters = [], shown, total }: { value: string; onChange: (value: string) => void; placeholder: string; label?: string; filters?: DataFilter[]; shown: number; total: number }) {
  const activeFilters = filters.filter((filter) => filter.value).length;
  const reset = () => { onChange(""); filters.forEach((filter) => filter.onChange("")); };
  return <section className="dataToolbar" aria-label={`${label} and filters`}>
    <div className="dataSearch"><Search aria-hidden="true" /><label><span className="srOnly">{label}</span><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label} /></label>{value && <button type="button" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange("")}><X /></button>}</div>
    {!!filters.length && <div className="dataFilters"><span className="filterLead"><Filter /> Filter{activeFilters ? ` · ${activeFilters}` : ""}</span>{filters.map((filter) => <label key={filter.label}><span>{filter.label}</span><select aria-label={filter.label} value={filter.value} onChange={(event) => filter.onChange(event.target.value)}><option value="">All</option>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}</div>}
    <div className="dataToolbarMeta"><span><strong>{shown}</strong> of {total}</span>{(value || activeFilters > 0) && <button type="button" onClick={reset}>Reset</button>}</div>
  </section>;
}
