"use client";

import { useEffect, useState } from "react";
import { buttonOutline } from "./buttonStyles";
import { LEGAL_FORMS } from "@/lib/legalForms";

interface Firm {
  id: string;
  ico: string | null;
  nazov: string | null;
  ulica: string | null;
  mesto: string | null;
  psc: string | null;
  naceKod4: string | null;
}

function externalLookupUrl(firm: Firm): string {
  if (firm.ico && firm.ico !== "Neuvedené") {
    return `https://www.finstat.sk/${firm.ico}`;
  }
  const query = [firm.nazov, firm.mesto].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

interface CategoryLookup {
  kod4: string;
  nazov: string;
  sekcia: string;
  sekciaNazov: string;
}

function groupBySection(categories: CategoryLookup[]): [string, CategoryLookup[]][] {
  const groups = new Map<string, CategoryLookup[]>();
  for (const c of categories) {
    const label = `${c.sekcia} - ${c.sekciaNazov}`;
    const existing = groups.get(label);
    if (existing) existing.push(c);
    else groups.set(label, [c]);
  }
  return Array.from(groups.entries());
}

interface FirmListPanelProps {
  okresKod: string;
  okresNazov: string;
  naceFilter: string;
  formaFilter: string;
  categories: CategoryLookup[];
  onClose: () => void;
}

export function FirmListPanel({
  okresKod,
  okresNazov,
  naceFilter,
  formaFilter,
  categories,
  onClose,
}: FirmListPanelProps) {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  // Local overrides, independent of the map's own filters - browsing
  // inside this panel shouldn't change what's shown on the map itself.
  // Initialized from the map's current filters so the panel starts
  // consistent with what's on screen, but can diverge from there.
  const [localNace, setLocalNace] = useState(naceFilter);
  const [localForma, setLocalForma] = useState(formaFilter);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    setOffset(0);
  }, [okresKod, localNace, localForma, debouncedQuery]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      okres: okresKod,
      offset: String(offset),
    });
    if (localNace) params.set("nace", localNace);
    if (localForma) params.set("forma", localForma);
    if (debouncedQuery) params.set("q", debouncedQuery);
    fetch(`/api/firms-in-district?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setFirms(d.firms);
        setTotal(d.total);
      })
      .finally(() => setLoading(false));
  }, [okresKod, localNace, localForma, debouncedQuery, offset]);

  return (
    <div
      style={{
        position: "fixed",
        // Below the fixed app header (65px, z-index 5000) rather than
        // z-fighting with it - the panel's own close button and district
        // name were rendering hidden underneath it at top:0.
        top: 65,
        right: 0,
        bottom: 0,
        width: 440,
        maxWidth: "90vw",
        background: "white",
        boxShadow: "-4px 0 16px rgba(0,0,0,0.15)",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{okresNazov}</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              {loading && total === 0
                ? "Načítavam…"
                : `${total.toLocaleString("sk-SK")} ${total === 1 ? "firma" : "firiem"}`}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#64748b",
              lineHeight: 1,
            }}
            aria-label="Zavrieť"
          >
            ×
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <input
            type="text"
            placeholder="Hľadať podľa názvu…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              fontSize: 13,
            }}
          />
          <select
            value={localNace}
            onChange={(e) => setLocalNace(e.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              fontSize: 13,
            }}
          >
            <option value="">Všetky kategórie</option>
            {/* Grouped by NACE section - 617 flat options in a native
                select are unusable to scroll through. */}
            {groupBySection(categories).map(([sekciaNazov, items]) => (
              <optgroup key={sekciaNazov} label={sekciaNazov}>
                {items.map((c) => (
                  <option key={c.kod4} value={c.kod4}>
                    {c.nazov} ({c.kod4})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            value={localForma}
            onChange={(e) => setLocalForma(e.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              fontSize: 13,
            }}
          >
            <option value="">Všetky právne formy</option>
            {LEGAL_FORMS.map((f) => (
              <option key={f.kod} value={f.kod}>
                {f.nazov}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {loading ? (
          <p style={{ padding: "16px 20px", color: "#94a3b8" }}>Načítavam…</p>
        ) : firms.length === 0 ? (
          <p style={{ padding: "16px 20px", color: "#94a3b8" }}>
            Žiadne firmy pre tento výber.
          </p>
        ) : (
          firms.map((f) => (
            <div
              key={f.id}
              style={{
                padding: "10px 20px",
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {f.nazov?.replace(/["„”]/g, "") ?? "(bez názvu)"}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {[f.ulica, f.mesto, f.psc].filter(Boolean).join(", ") || "-"}
                </div>
              </div>
              <a
                href={externalLookupUrl(f)}
                target="_blank"
                rel="noreferrer"
                title={f.ico && f.ico !== "Neuvedené" ? "Zobraziť na Finstat" : "Hľadať v Google"}
                style={{ ...buttonOutline("onLight", "sm"), flexShrink: 0, whiteSpace: "nowrap", marginTop: 1 }}
              >
                Detail ↗
              </a>
            </div>
          ))
        )}
      </div>

      {total > 100 && (
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13,
          }}
        >
          <button
            onClick={() => setOffset((o) => Math.max(0, o - 100))}
            disabled={offset === 0}
            style={{ ...buttonOutline("onLight", "sm"), opacity: offset === 0 ? 0.4 : 1, cursor: offset === 0 ? "default" : "pointer" }}
          >
            ← predošlé
          </button>
          <span style={{ color: "#64748b" }}>
            {offset + 1}–{Math.min(offset + 100, total)} z{" "}
            {total.toLocaleString("sk-SK")}
          </span>
          <button
            onClick={() => setOffset((o) => o + 100)}
            disabled={offset + 100 >= total}
            style={{
              ...buttonOutline("onLight", "sm"),
              opacity: offset + 100 >= total ? 0.4 : 1,
              cursor: offset + 100 >= total ? "default" : "pointer",
            }}
          >
            ďalšie →
          </button>
        </div>
      )}
    </div>
  );
}
