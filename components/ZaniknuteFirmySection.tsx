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

// Pevná šírka na popisky okresov/odvetví (90px/150px) bola nastavená pre
// desktop - na mobile (~360px) zožrala väčšinu grafu a stĺpce sa
// vtesnali do posledných pár desiatok pixelov vpravo. Na úzkom viewporte
// treba popisky kratšie aj užšie, aby ostal priestor na samotné stĺpce.
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const update = () => setNarrow(window.innerWidth < 480);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return narrow;
}

// Recharts' built-in category tick wraps long text across multiple lines
// by itself and THEN truncates each line - a tickFormatter shortening the
// string first still gets re-wrapped/re-cut by that logic, which is what
// produced two-line labels ending mid-word ("Ostatné stavebné" /
// "kompletiza..."). Rendering the tick ourselves as one plain <text> line
// bypasses Recharts' wrapping entirely; the full name is still available
// on hover via <title>.
// x/y/payload sú injektované cez React.cloneElement priamo v Recharts za
// behu - nie sú (a nemôžu byť) súčasťou JSX <SingleLineTick maxLen={..}
// fontSize={..} /> nižšie, preto any namiesto plného typu (rovnaký vzor
// ako existujúci TruncatedTick v components/StatsCharts.tsx).
function SingleLineTick({ x, y, payload, maxLen, fontSize }: any) {
  const full: string = payload.value;
  const text = full.length > maxLen ? `${full.slice(0, maxLen - 1)}…` : full;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={fontSize} fill="#334155">
      <title>{full}</title>
      {text}
    </text>
  );
}

// Kým dáta ešte neprišli, prázdny graf s osami vyzerá ako chyba, nie ako
// "načítava sa" - rovnaký točiaci sa indikátor ako v DensityMap namiesto
// prázdneho rámu.
function ChartLoading() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "#94a3b8",
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          border: "2px solid #cbd5e1",
          borderTopColor: "#2563eb",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      Načítavam…
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

export function ZaniknuteFirmySection() {
  const [data, setData] = useState<ZaniknuteData | null>(null);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [metric, setMetric] = useState<Metric>("absolute");
  const [chyba, setChyba] = useState(false);
  const narrow = useIsNarrow();

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
        podiel: Math.round((o.zaniklo / (o.zaniklo + o.aktivnych)) * 1000) / 10,
      }))
      .sort((a, b) => b.podiel - a.podiel)
      .slice(0, 12);
  }, [data]);

  const pokrytiePct = data
    ? Math.round((data.pokrytieNace.sOdvetvim / data.pokrytieNace.spolu) * 100)
    : 0;

  const loading = !data && !chyba;

  return (
    <section id="zaniknute-firmy" style={{ marginTop: 40, scrollMarginTop: 20 }}>
      <header style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Zaniknuté firmy
        </h2>
        <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>
          Koľko subjektov na Slovensku zaniklo, kde, v akom odvetví a ako dlho
          firmy prežívajú. Dáta z registra RPO od roku{" "}
          {data?.poRokoch[0]?.rok ?? 1995}.
        </p>
      </header>

      {chyba && (
        <div style={{ ...CARD, borderColor: "#fca5a5", background: "#fef2f2" }}>
          Dáta sa nepodarilo načítať.
        </div>
      )}

      {/* Pravidlo o transparentnosti z CLAUDE.md: obmedzenie dát patrí k
          dátam, nie do drobného písma pod stránkou. Rovnaká neutrálna
          paleta ako DataSourceBanner - je to vysvetlenie zdroja, nie
          výstraha, tak nemá dôvod vyzerať ako jedna. */}
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
        <strong>Ako čítať tieto čísla:</strong> Zaniknuté subjekty držíme len
        ako súhrny (počty podľa okresu, odvetvia, právnej formy a roku), nie ako
        jednotlivé firmy - nedá sa tu preto vyhľadať konkrétna zaniknutá firma.
        <br />
        <br />
        Rebríček odvetví je postavený len na{" "}
        <strong>{pokrytiePct} % zaniknutých subjektov</strong> (
        {data?.pokrytieNace.sOdvetvim.toLocaleString("sk-SK")} z{" "}
        {data?.pokrytieNace.spolu.toLocaleString("sk-SK")}) - pri zvyšných{" "}
        {100 - pokrytiePct} % RPO odvetvie vôbec nezaznamenalo. Nejde o chybu
        na našej strane ani o niečo, čo vieme doplniť: v zdrojových dátach RPO
        tá hodnota chýba, takže sa nedá dopočítať na 100 %. Rebríček preto
        hovorí o poradí v rámci tejto menšiny firiem, nie o celku všetkých
        zaniknutých.
      </div>

      <section style={{ ...CARD, padding: 8 }}>
        <div style={{ padding: "10px 12px 0" }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
            Kde firmy zanikajú
          </h3>
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
          zodpovedá hodnote jej okresu - zaniknuté subjekty evidujeme len po
          okres, nie po obec.
        </p>
      </section>

      <section style={CARD}>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
          Koľko subjektov ročne zanikne
        </h3>
        <p style={{ color: "#64748b", margin: "0 0 14px", fontSize: 13 }}>
          Posledný rok je neúplný - beží.
        </p>
        <div style={{ height: 260 }}>
          {loading ? (
            <ChartLoading />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.poRokoch ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="rok" fontSize={11} interval={0} />
                <YAxis
                  fontSize={11}
                  tickFormatter={(v) => (v as number).toLocaleString("sk-SK")}
                />
                <Tooltip
                  cursor={false}
                  formatter={(v) => [
                    (v as number).toLocaleString("sk-SK"),
                    "zaniklo",
                  ]}
                  labelFormatter={(l) => `Rok ${l}`}
                />
                <Bar dataKey="pocet" fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section style={CARD}>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
          Ako dlho firmy prežívajú
        </h3>
        <p style={{ color: "#64748b", margin: "0 0 14px", fontSize: 13 }}>
          Podiel subjektov z daného ročníka, ktoré po N rokoch ešte existovali.
          Ročník {KOHORTY[0]} má za sebou najdlhšiu históriu,{" "}
          {KOHORTY[KOHORTY.length - 1]} zatiaľ len pár rokov.
        </p>
        <div style={{ height: 280 }}>
          {loading ? (
            <ChartLoading />
          ) : (
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
          )}
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

      <section style={CARD}>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
          Okresy s najvyšším podielom zaniknutých
        </h3>
        <p style={{ color: "#64748b", margin: "0 0 14px", fontSize: 13 }}>
          Z celkového počtu subjektov v okrese (zaniklo / zaniklo + aktívnych) -
          na rozdiel od rebríčka odvetví nižšie tu nejde o výber z tých 5 %,
          ktorým RPO priradilo odvetvie.
        </p>
        <div style={{ height: 300 }}>
          {loading ? (
            <ChartLoading />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={najhorsieOkresy}
                layout="vertical"
                // Bez margin.left navyše - YAxis width nižšie je jediné
                // miesto, ktoré si o priestor na popisky pýta. Margin aj
                // width naraz ho odčítavali dvakrát a na mobile takmer
                // nezostal priestor na samotné stĺpce.
                margin={{ left: 0 }}
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
                  width={narrow ? 68 : 90}
                  interval={0}
                  tick={
                    <SingleLineTick
                      maxLen={narrow ? 10 : 16}
                      fontSize={narrow ? 10 : 11}
                    />
                  }
                />
                <Tooltip cursor={false} formatter={(v) => [`${v} %`, "zaniknutých"]} />
                <Bar dataKey="podiel" fill="#2563eb" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section style={CARD}>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
          Odvetvia s najviac zánikmi
        </h3>
        <p style={{ color: "#64748b", margin: "0 0 14px", fontSize: 13 }}>
          Len z tých {pokrytiePct} % subjektov, ktorým RPO odvetvie priradilo.
        </p>
        <div style={{ height: 320 }}>
          {loading ? (
            <ChartLoading />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data?.poOdvetviach ?? []}
                layout="vertical"
                // Bez margin.left navyše - viď rovnaké vysvetlenie pri
                // grafe okresov vyššie.
                margin={{ left: 0 }}
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
                  width={narrow ? 72 : 150}
                  interval={0}
                  tick={
                    <SingleLineTick
                      maxLen={narrow ? 11 : 24}
                      fontSize={narrow ? 9 : 10}
                    />
                  }
                />
                <Tooltip
                  cursor={false}
                  formatter={(v) => [
                    (v as number).toLocaleString("sk-SK"),
                    "zaniklo",
                  ]}
                />
                <Bar dataKey="pocet" fill="#2563eb" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section style={CARD}>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 14px" }}>
          Podľa právnej formy
        </h3>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: "#64748b", fontSize: 12 }}>
              <th style={{ padding: "6px 8px" }}>Právna forma</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>
                Zaniknutých
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td style={{ padding: "8px", color: "#94a3b8" }} colSpan={2}>
                  Načítavam…
                </td>
              </tr>
            )}
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
            jednotlivé záznamy - detail konkrétnej zaniknutej firmy sa dá
            kedykoľvek dohľadať priamo v RPO.
          </>
        }
      />
    </section>
  );
}
