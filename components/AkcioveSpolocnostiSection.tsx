"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { DataSourceBanner } from "@/components/DataSourceBanner";
import type { DistrictDensity } from "@/components/DensityMap";

const DensityMap = dynamic(
  () => import("@/components/DensityMap").then((m) => m.DensityMap),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: "70vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#94a3b8",
        }}
      >
        Načítavam mapu…
      </div>
    ),
  },
);

// Kód právnej formy „Akciová spoločnosť“ v RPO (pozri lib/legalForms.ts).
const FORMA_AS = "121";

interface DataSource {
  sourceName: string;
  sourceUrl: string;
  lastSyncedAt: string | null;
  recordsCount: number | null;
}

interface Okres {
  kod: string;
  nazov: string;
  kraj: string;
}

interface Riadok {
  okresKod: string;
  nazov: string;
  kraj: string;
  pocet: number;
  // Na 1000 obyvateľov je pri a. s. väčšinou pod 1 - na 100 000 sa číta ľahšie.
  na100tis: number | null;
}

const CARD: React.CSSProperties = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "18px 20px",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  marginBottom: 20,
};

export function AkcioveSpolocnostiSection() {
  const [density, setDensity] = useState<Record<string, DistrictDensity> | null>(null);
  const [okresy, setOkresy] = useState<Okres[]>([]);
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [poradie, setPoradie] = useState<"pocet" | "na100tis">("pocet");

  useEffect(() => {
    Promise.all([
      fetch(`/api/density?forma=${FORMA_AS}`).then((r) => r.json()),
      fetch("/api/okresy").then((r) => r.json()),
    ])
      .then(([d, o]) => {
        setDensity(d.byDistrict);
        setOkresy(o.okresy);
      })
      .finally(() => setLoading(false));

    fetch("/api/data-sources")
      .then((r) => r.json())
      .then((d) => setSources(d.sources))
      .catch(() => setSources([]));
  }, []);

  // /api/density vracia len okresy s aspoň jednou a. s. - okres bez nich
  // musí byť v rebríčku s nulou, nie chýbať.
  const riadky = useMemo<Riadok[]>(() => {
    if (!density) return [];
    // RPO má technické okresy „Zahraničie“ pre firmy so sídlom mimo SR -
    // nie sú to slovenské okresy, do porovnania nepatria.
    const jeZahranicie = (nazov: string) =>
      nazov.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("sk").startsWith("zahranic");
    return okresy.filter((o) => !jeZahranicie(o.nazov)).map((o) => {
      const d = density[o.kod];
      return {
        okresKod: o.kod,
        nazov: o.nazov,
        kraj: o.kraj,
        pocet: d?.pocetPrevadzok ?? 0,
        na100tis: d?.pocetNa1000Obyvatelov != null ? d.pocetNa1000Obyvatelov * 100 : null,
      };
    });
  }, [density, okresy]);

  const zoradene = useMemo(() => {
    const kluc = (r: Riadok) => (poradie === "pocet" ? r.pocet : (r.na100tis ?? -1));
    return [...riadky].sort((a, b) => kluc(b) - kluc(a) || a.nazov.localeCompare(b.nazov, "sk"));
  }, [riadky, poradie]);

  const spolu = riadky.reduce((s, r) => s + r.pocet, 0);
  const najviac = zoradene.slice(0, 10);
  const najmenej = [...zoradene].reverse().slice(0, 10);

  const formatNa100tis = (v: number | null) =>
    v === null ? "–" : v.toLocaleString("sk-SK", { maximumFractionDigits: 1 });

  return (
    <section id="akciove-spolocnosti" style={{ marginTop: 40, scrollMarginTop: 20 }}>
      <header style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Akciové spoločnosti podľa okresov
        </h2>
        <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>
          A. s. potrebuje vyšší základný kapitál ako s. r. o., preto ich počet
          naznačuje ekonomickú silu okresu.
          {spolu > 0 && (
            <> Aktívnych a. s. na Slovensku: <strong>{spolu.toLocaleString("sk-SK")}</strong>.</>
          )}
        </p>
      </header>

      {/* Pravidlo o transparentnosti z CLAUDE.md - toto obmedzenie mení
          význam čísel, takže patrí nad ne. */}
      <div
        style={{
          ...CARD,
          borderColor: "#cbd5e1",
          background: "#f8fafc",
          color: "#475569",
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        <strong>Počítame a. s. podľa sídla, nie podľa toho, kde pracujú.</strong>{" "}
        Veľká firma so závodmi po celom Slovensku sa započíta len do okresu,
        kde má zapísané sídlo - často Bratislava. Okresy s veľkými závodmi
        preto môžu vyzerať slabšie, než sú.
      </div>

      <section style={{ ...CARD, padding: 8 }}>
        <DensityMap
          densityByDistrict={density}
          metric="absolute"
          loading={loading}
          popisHodnoty="Akciových spoločností"
          popisLegendy={{ absolute: "Počet a. s.", perCapita: "Na 1000 obyvateľov" }}
        />
      </section>

      <div
        role="group"
        aria-label="Poradie rebríčka"
        style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}
      >
        {([
          ["pocet", "Podľa počtu"],
          ["na100tis", "Na 100 000 obyvateľov"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={poradie === k}
            onClick={() => setPoradie(k)}
            style={{
              padding: "7px 12px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              background: poradie === k ? "#2563eb" : "white",
              color: poradie === k ? "white" : "#1e293b",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {[
          { titul: "Najviac a. s.", data: najviac },
          { titul: "Najmenej a. s.", data: najmenej },
        ].map((tabulka) => (
          <section key={tabulka.titul} style={{ ...CARD, flex: "1 1 320px" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 12px" }}>
              {tabulka.titul}
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ color: "#64748b", fontSize: 12, textAlign: "right" }}>
                  <th style={{ padding: "4px", textAlign: "left", fontWeight: 600 }}>Okres</th>
                  <th style={{ padding: "4px", fontWeight: 600 }}>Počet</th>
                  <th style={{ padding: "4px", fontWeight: 600 }}>Na 100 tis. obyv.</th>
                </tr>
              </thead>
              <tbody>
                {tabulka.data.map((r) => (
                  <tr key={r.okresKod} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "7px 4px" }}>
                      {r.nazov}
                      <span style={{ color: "#94a3b8", fontSize: 12 }}> · {r.kraj}</span>
                    </td>
                    <td
                      style={{
                        padding: "7px 4px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: poradie === "pocet" ? 700 : 400,
                      }}
                    >
                      {r.pocet.toLocaleString("sk-SK")}
                    </td>
                    <td
                      style={{
                        padding: "7px 4px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: poradie === "na100tis" ? 700 : 400,
                      }}
                    >
                      {formatNa100tis(r.na100tis)}
                    </td>
                  </tr>
                ))}
                {tabulka.data.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: "7px 4px", color: "#94a3b8" }}>
                      {loading ? "Načítavam…" : "Údaje nie sú dostupné."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <DataSourceBanner sources={sources.filter(
          (s) => s.sourceName === "RPO" || s.sourceName === "Eurostat GISCO (hranice a populácia)",
        )} />
    </section>
  );
}
