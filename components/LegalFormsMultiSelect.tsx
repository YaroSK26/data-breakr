"use client";

import { useEffect, useRef, useState } from "react";
import { LEGAL_FORMS } from "@/lib/legalForms";

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
  compact?: boolean;
}

export function LegalFormsMultiSelect({ value, onChange, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // An empty array means "no restriction". Visually that is the natural
  // default: every listed form is checked. The first click therefore
  // excludes the clicked form instead of selecting only that one.
  const toggle = (kod: string) => {
    if (value.length === 0) {
      onChange(LEGAL_FORMS.map((form) => form.kod).filter((item) => item !== kod));
      return;
    }
    const next = value.includes(kod)
      ? value.filter((item) => item !== kod)
      : [...value, kod];
    if (next.length === 0) return;
    onChange(next.length === LEGAL_FORMS.length ? [] : next);
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          width: "100%",
          padding: compact ? "7px 10px" : "8px 10px",
          borderRadius: 6,
          border: "1px solid #cbd5e1",
          background: "white",
          color: "#1e293b",
          textAlign: "left",
          cursor: "pointer",
          fontSize: compact ? 13 : 14,
        }}
      >
        {value.length === 0 ? `Všetky právne formy (${LEGAL_FORMS.length})` : `Označené: ${value.length} z ${LEGAL_FORMS.length}`} ▾
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            minWidth: 310,
            maxHeight: 320,
            overflowY: "auto",
            zIndex: 6100,
            background: "white",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.14)",
          }}
        >
          <div style={{ position: "sticky", top: 0, zIndex: 1, padding: 8, background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 12, color: "#475569" }}>
            {value.length === 0 ? (
              <strong>Všetky formy sú označené</strong>
            ) : (
              <button type="button" onClick={() => onChange([])} style={actionStyle}>Označiť všetko</button>
            )}
          </div>
          {LEGAL_FORMS.map((form) => (
            <label key={form.kod} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "8px 10px", cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={value.length === 0 || value.includes(form.kod)} onChange={() => toggle(form.kod)} />
              <span>{form.nazov}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const actionStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 5,
  background: "white",
  padding: "4px 7px",
  cursor: "pointer",
  fontSize: 12,
};
