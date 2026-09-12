import React, { useEffect, useId, useRef } from "react";
import { Search } from "lucide-react";

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

export function SearchBox({ value, onChange, placeholder, label = "Search" }: { value: string; onChange: (value: string) => void; placeholder: string; label?: string }) {
  return <label className="searchBox"><span className="srOnly">{label}</span><Search aria-hidden="true" /><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label} /><button type="button" className="searchClear" aria-label={`Clear ${label.toLowerCase()}`} hidden={!value} onClick={() => onChange("")}>Clear</button></label>;
}
