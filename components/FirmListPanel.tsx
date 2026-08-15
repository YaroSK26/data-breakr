"use client";

import { useEffect, useState } from "react";

interface Firm {
  id: string;
  nazov: string | null;
  ulica: string | null;
  mesto: string | null;
  psc: string | null;
  naceKod4: string | null;
}

interface CategoryLookup {
  kod4: string;
  nazov: string;
}

interface FirmListPanelProps {
  okresKod: string;
  okresNazov: string;
  naceFilter: string;
  categories: CategoryLookup[];
  onClose: () => void;
}

export function FirmListPanel({
  okresKod,
  okresNazov,
  naceFilter,
  categories,
  onClose,
}: FirmListPanelProps) {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  // Local overrides, independent of the map's own filters - browsing
  // inside this panel shouldn't change what's shown on the map itself.
  // Initialized from the map's current category so the panel starts
  // consistent with what's on screen, but can diverge from there.
  const [localNace, setLocalNace] = useState(naceFilter);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    setOffset(0);
  }, [okresKod, localNace, debouncedQuery]);

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
    if (debouncedQuery) params.set("q", debouncedQuery);
    fetch(`/api/firms-in-district?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setFirms(d.firms);
        setTotal(d.total);
      })
      .finally(() => setLoading(false));
  }, [okresKod, localNace, debouncedQuery, offset]);

  const categoryName = (kod4: string | null) =>
    categories.find((c) => c.kod4 === kod4)?.nazov ?? kod4 ?? "-";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 440,
        maxWidth: "90vw",
        background: "white",
        boxShadow: "-4px 0 16px rgba(0,0,0,0.15)",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, sans-serif",
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
              {total.toLocaleString("sk-SK")} {total === 1 ? "firma" : "firiem"}
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
            {categories.map((c) => (
              <option key={c.kod4} value={c.kod4}>
                {c.nazov} ({c.kod4})
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
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {f.nazov ?? "(bez názvu)"}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {[f.ulica, f.mesto, f.psc].filter(Boolean).join(", ") || "-"}
              </div>
              {!localNace && (
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  {categoryName(f.naceKod4)}
                </div>
              )}
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
            style={{
              padding: "4px 10px",
              cursor: offset === 0 ? "default" : "pointer",
              opacity: offset === 0 ? 0.4 : 1,
            }}
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
              padding: "4px 10px",
              cursor: offset + 100 >= total ? "default" : "pointer",
              opacity: offset + 100 >= total ? 0.4 : 1,
            }}
          >
            ďalšie →
          </button>
        </div>
      )}
    </div>
  );
}
