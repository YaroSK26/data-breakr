"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DataSourceBanner } from "@/components/DataSourceBanner";
import { LEGAL_FORMS } from "@/lib/legalForms";
import type { DistrictDensity, Metric } from "@/components/DensityMap";

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

interface ZaniknuteData {
  poRokoch: { rok: number; pocet: number }[];
  poOkresoch: {
    okresKod: string;
    nazov: string;
    zaniklo: number;
    aktivnych: number;
    obyvatelov: number | null;
  }[];
  poFormach: { kod: string; pocet: number }[];
  poOdvetviach: { kod: string; nazov: string; pocet: number }[];
  prezitie: {
    rokVzniku: number;
    velkost: number;
    body: { vek: number; podiel: number }[];
  }[];
  pokrytieNace: { sOdvetvim: number; spolu: number };
}

interface DataSource {
  sourceName: string;
  sourceUrl: string;
  lastSyncedAt: string | null;
  recordsCount: number | null;
}

const CARD: React.CSSProperties = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "18px 20px",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  marginBottom: 20,
};

const FORMA_NAZVY = new Map(LEGAL_FORMS.map((f) => [f.kod, f.nazov]));

// Ročníky, ktoré má zmysel porovnávať: dosť staré na to, aby mali za sebou
// aspoň pár rokov, a dosť nové na to, aby dáta neboli z inej doby.
const KOHORTY = [2010, 2015, 2020];
const FARBY_KOHORT = ["#1e40af", "#3b82f6", "#93c5fd"];

export default function ZaniknuteFirmyPage() {
  const [data, setData] = useState<ZaniknuteData | null>(null);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [metric, setMetric] = useState<Metric>("absolute");
  const [chyba, setChyba] = useState(false);

  useEffect(() => {
    fetch("/api/zaniknute")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setChyba(true));

    fetch("/api/data-sources")
      .then((r) => r.json())
      .then((d) => setSources(d.sources))
      .catch(() => setSources([]));
  }, []);

  // Mapa berie tvar { pocetPrevadzok, pocetNa1000Obyvatelov } - tu je v ňom
  // počet zánikov a druhá metrika je podiel zaniknutých na všetkých, čo v
  // okrese kedy vznikli. To je poctivejšie než "na 1000 obyvateľov":
  // porovnáva okres sám so sebou, nie s veľkosťou populácie.
  const mapaDat = useMemo<Record<string, DistrictDensity> | null>(() => {
    if (!data) return null;
    const out: Record<string, DistrictDensity> = {};
    for (const o of data.poOkresoch) {
      const spolu = o.zaniklo + o.aktivnych;
      out[o.okresKod] = {
        pocetPrevadzok: o.zaniklo,
        pocetNa1000Obyvatelov: spolu > 0 ? (o.zaniklo / spolu) * 100 : null,
      };
    }
    return out;
  }, [data]);

  const prezitieGraf = useMemo(() => {
    if (!data) return [];
    const vybrane = KOHORTY.map((rok) =>
      data.prezitie.find((p) => p.rokVzniku === rok),
    ).filter(Boolean) as ZaniknuteData["prezitie"];
    if (vybrane.length === 0) return [];
    const maxVek = Math.max(...vybrane.map((k) => k.body.length - 1));
    const riadky: Record<string, number>[] = [];
    for (let vek = 0; vek <= maxVek; vek++) {
      const riadok: Record<string, number> = { vek };
      for (const k of vybrane) {
        const bod = k.body[vek];
        if (bod) riadok[`r${k.rokVzniku}`] = Math.round(bod.podiel * 1000) / 10;
      }
      riadky.push(riadok);
    }
    return riadky;
  }, [data]);

  const najhorsieOkresy = useMemo(() => {
    if (!data) return [];
    return [...data.poOkresoch]
      .filter((o) => o.zaniklo + o.aktivnych > 500)
      .map((o) => ({
        nazov: o.nazov,
        podiel:
          Math.round((o.zaniklo / (o.zaniklo + o.aktivnych)) * 1000) / 10,
      }))
      .sort((a, b) => b.podiel - a.podiel)
      .slice(0, 12);
  }, [data]);

  const pokrytiePct = data
    ? Math.round((data.pokrytieNace.sOdvetvim / data.pokrytieNace.spolu) * 100)
    : 0;

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "96px 20px 48px",
        color: "#1e293b",
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>
          Zaniknuté firmy
        </h1>
        <p style={{ color: "#64748b", margin: "6px 0 0", fontSize: 15 }}>
          Koľko subjektov na Slovensku zaniklo, kde, v akom odvetví a ako
          dlho firmy prežívajú. Dáta z registra RPO od roku {" "}
          {data?.poRokoch[0]?.rok ?? 1995}.
        </p>
      </header>

      {chyba && (
        <div style={{ ...CARD, borderColor: "#fca5a5", background: "#fef2f2" }}>
          Dáta sa nepodarilo načítať.
        </div>
      )}

      {/* Pravidlo o transparentnosti z CLAUDE.md: obmedzenie dát patrí k
          dátam, nie do drobného písma pod stránkou. */}
      <div
        style={{
          ...CARD,
          borderColor: "#fcd34d",
          background: "#fffbeb",
          color: "#78350f",
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        <strong>Ako čítať tieto čísla.</strong> Zaniknuté subjekty držíme len
        ako súhrny (počty podľa okresu, odvetvia, právnej formy a roku), nie
        ako jednotlivé firmy — nedá sa tu preto vyhľadať konkrétna zaniknutá
        firma. Rebríček odvetví stojí na zlomku dát:{" "}
        <strong>RPO priradilo odvetvie len {pokrytiePct} %</strong> zaniknutých
        subjektov ({data?.pokrytieNace.sOdvetvim.toLocaleString("sk-SK")} z{" "}
        {data?.pokrytieNace.spolu.toLocaleString("sk-SK")}), takže hovorí o
        poradí v rámci tejto menšiny, nie o celku.
      </div>

      <section style={CARD}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
          Koľko subjektov ročne zanikne
        </h2>
        <p style={{ color: "#64748b", margin: "0 0 14px", fontSize: 13 }}>
          Posledný rok je neúplný — beží.
        </p>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.poRokoch ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="rok" fontSize={11} />
              <YAxis
                fontSize={11}
                tickFormatter={(v) => (v as number).toLocaleString("sk-SK")}
              />
              <Tooltip
                formatter={(v) => [
                  (v as number).toLocaleString("sk-SK"),
                  "zaniklo",
                ]}
                labelFormatter={(l) => `Rok ${l}`}
              />
              <Bar dataKey="pocet" fill="#2563eb" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section style={CARD}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
          Ako dlho firmy prežívajú
        </h2>
        <p style={{ color: "#64748b", margin: "0 0 14px", fontSize: 13 }}>
          Podiel subjektov z daného ročníka, ktoré po N rokoch ešte
          existovali. Ročník {KOHORTY[0]} má za sebou najdlhšiu históriu,{" "}
          {KOHORTY[KOHORTY.length - 1]} zatiaľ len pár rokov.
        </p>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={prezitieGraf}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="vek"
                fontSize={11}
                label={{
                  value: "rokov od vzniku",
                  position: "insideBottom",
                  offset: -4,
                  fontSize: 11,
                }}
              />
              <YAxis
                fontSize={11}
                domain={[0, 100]}
                tickFormatter={(v) => `${v} %`}
              />
              <Tooltip
                formatter={(v, name) => [
                  `${v} %`,
                  `ročník ${String(name).slice(1)}`,
                ]}
                labelFormatter={(l) => `${l} rokov od vzniku`}
              />
              {KOHORTY.map((rok, i) => (
                <Line
                  key={rok}
                  type="monotone"
                  dataKey={`r${rok}`}
                  stroke={FARBY_KOHORT[i]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 10,
            fontSize: 12,
            color: "#475569",
            flexWrap: "wrap",
          }}
        >
          {KOHORTY.map((rok, i) => {
            const k = data?.prezitie.find((p) => p.rokVzniku === rok);
            return (
              <span
                key={rok}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <span
                  style={{
                    width: 14,
                    height: 3,
                    background: FARBY_KOHORT[i],
                    display: "inline-block",
                  }}
                />
                ročník {rok}
                {k ? ` (${k.velkost.toLocaleString("sk-SK")} subjektov)` : ""}
              </span>
            );
          })}
        </div>
      </section>

      <section style={{ ...CARD, padding: 8 }}>
        <div style={{ padding: "10px 12px 0" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
            Kde firmy zanikajú
          </h2>
          <div
            style={{
              display: "flex",
              gap: 4,
              margin: "10px 0",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => setMetric("absolute")}
              style={{
                padding: "7px 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: metric === "absolute" ? "#2563eb" : "white",
                color: metric === "absolute" ? "white" : "#1e293b",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Počet zaniknutých
            </button>
            <button
              onClick={() => setMetric("perCapita")}
              style={{
                padding: "7px 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                background: metric === "perCapita" ? "#2563eb" : "white",
                color: metric === "perCapita" ? "white" : "#1e293b",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Podiel zaniknutých (%)
            </button>
          </div>
        </div>
        <DensityMap
          densityByDistrict={mapaDat}
          metric={metric}
          loading={!data}
          popisHodnoty="Zaniklo"
          popisLegendy={{
            absolute: "Počet zaniknutých",
            perCapita: "% zaniknutých",
          }}
        />
        <p
          style={{
            padding: "10px 12px 4px",
            margin: 0,
            fontSize: 12,
            color: "#64748b",
          }}
        >
          Podiel = zaniknuté / (zaniknuté + dnes aktívne) v okrese. Farba obce
          zodpovedá hodnote jej okresu — zaniknuté subjekty evidujeme len po
          okres, nie po obec.
        </p>
      </section>

      <section style={CARD}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 14px" }}>
          Okresy s najvyšším podielom zaniknutých
        </h2>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={najhorsieOkresy}
              layout="vertical"
              margin={{ left: 90 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                fontSize={11}
                tickFormatter={(v) => `${v} %`}
              />
              <YAxis
                type="category"
                dataKey="nazov"
                fontSize={11}
                width={90}
              />
              <Tooltip formatter={(v) => [`${v} %`, "zaniknutých"]} />
              <Bar dataKey="podiel" fill="#2563eb" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section style={CARD}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
          Odvetvia s najviac zánikmi
        </h2>
        <p style={{ color: "#64748b", margin: "0 0 14px", fontSize: 13 }}>
          Len z tých {pokrytiePct} % subjektov, ktorým RPO odvetvie priradilo.
        </p>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data?.poOdvetviach ?? []}
              layout="vertical"
              margin={{ left: 150 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                fontSize={11}
                tickFormatter={(v) => (v as number).toLocaleString("sk-SK")}
              />
              <YAxis
                type="category"
                dataKey="nazov"
                fontSize={10}
                width={150}
                tickFormatter={(v) =>
                  String(v).length > 28
                    ? `${String(v).slice(0, 27)}…`
                    : String(v)
                }
              />
              <Tooltip
                formatter={(v) => [
                  (v as number).toLocaleString("sk-SK"),
                  "zaniklo",
                ]}
              />
              <Bar dataKey="pocet" fill="#2563eb" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section style={CARD}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 14px" }}>
          Podľa právnej formy
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#64748b", fontSize: 12 }}>
              <th style={{ padding: "6px 8px" }}>Právna forma</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>
                Zaniknutých
              </th>
            </tr>
          </thead>
          <tbody>
            {(data?.poFormach ?? []).map((f) => (
              <tr key={f.kod} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ padding: "8px" }}>
                  {FORMA_NAZVY.get(f.kod) ?? `Kód ${f.kod}`}
                </td>
                <td
                  style={{
                    padding: "8px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {f.pocet.toLocaleString("sk-SK")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <DataSourceBanner
        sources={sources.filter((s) => s.sourceName === "RPO")}
        note={
          <>
            Zaniknuté subjekty sú v databáze uložené ako súhrny, nie ako
            jednotlivé záznamy — detail konkrétnej zaniknutej firmy sa dá
            kedykoľvek dohľadať priamo v RPO.
          </>
        }
      />
    </main>
  );
}
