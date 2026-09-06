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

const UKAZOVATELE = [
  {
    kod: "PRIEM_MZDA",
    nazov: "Priemerná mesačná mzda",
    jednotka: "€",
    popis:
      "Priemerná hrubá mesačná mzda zamestnanca, zistená pracoviskovou metódou. Zahŕňa podniky s 20 a viac zamestnancami.",
  },
  {
    kod: "ZAMESTNANCI",
    nazov: "Počet zamestnancov",
    jednotka: "",
    popis:
      "Priemerný evidenčný počet zamestnancov v podnikoch s 20 a viac zamestnancami.",
  },
  {
    kod: "PODNIKY",
    nazov: "Počet podnikov",
    jednotka: "",
    popis:
      "Ekonomicky aktívne subjekty v štatistickom registri organizácií ŠÚ SR k 31. 12. daného roka.",
  },
] as const;

interface Odpoved {
  ukazovatel: string;
  sekcia: string;
  rok: number;
  dostupneRoky: number[];
  sekcie: { kod: string; nazov: string }[];
  okresy: { okresKod: string; nazov: string; hodnota: number }[];
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

const SELECT: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  width: "100%",
  fontSize: 14,
};

export default function StatistikyOkresovPage() {
  const [ukazovatel, setUkazovatel] = useState<string>("PRIEM_MZDA");
  const [sekcia, setSekcia] = useState<string>("SPOLU");
  const [rok, setRok] = useState<number | null>(null);
  const [data, setData] = useState<Odpoved | null>(null);
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<DataSource[]>([]);

  useEffect(() => {
    fetch("/api/data-sources")
      .then((r) => r.json())
      .then((d) => setSources(d.sources))
      .catch(() => setSources([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ ukazovatel, sekcia });
    if (rok) params.set("rok", String(rok));
    fetch(`/api/susr-okresy?${params}`)
      .then((r) => r.json())
      .then((d: Odpoved) => {
        setData(d);
        // Rok sa dopĺňa až z odpovede: každý ukazovateľ má inú dostupnú
        // radu rokov a natvrdo držaný rok by po prepnutí ukazovateľa
        // ukázal prázdnu mapu.
        setRok(d.rok);
      })
      .finally(() => setLoading(false));
  }, [ukazovatel, sekcia, rok]);

  const mapaDat = useMemo<Record<string, DistrictDensity> | null>(() => {
    if (!data) return null;
    const out: Record<string, DistrictDensity> = {};
    for (const o of data.okresy) {
      out[o.okresKod] = {
        pocetPrevadzok: Math.round(o.hodnota),
        pocetNa1000Obyvatelov: null,
      };
    }
    return out;
  }, [data]);

  const aktualny =
    UKAZOVATELE.find((u) => u.kod === ukazovatel) ?? UKAZOVATELE[0];
  const najviac = data?.okresy.slice(0, 10) ?? [];
  const najmenej = data ? [...data.okresy].reverse().slice(0, 10) : [];

  const format = (h: number) =>
    `${Math.round(h).toLocaleString("sk-SK")}${aktualny.jednotka ? ` ${aktualny.jednotka}` : ""}`;

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
          Štatistiky okresov
        </h1>
        <p style={{ color: "#64748b", margin: "6px 0 0", fontSize: 15 }}>
          Mzdy, zamestnanosť a počty podnikov podľa okresu a odvetvia. Oficiálne
          údaje Štatistického úradu SR.
        </p>
      </header>

      {/* Pravidlo o transparentnosti z CLAUDE.md - toto obmedzenie mení
          význam čísel, takže patrí nad ne, nie pod ne. */}
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
        <strong>Iná klasifikácia než na mape firiem.</strong> Odvetvia sú tu
        sekcie <strong>SK NACE Rev. 2</strong> (A, B, C…), kým register firiem
        beží na novšej <strong>Rev. 2.1</strong>. Písmená sekcií si medzi
        revíziami nezodpovedajú - napríklad IT je v Rev. 2.1 v sekcii K, v Rev.
        2 v sekcii J. Preto sú tieto čísla na vlastnej stránke a nedajú sa
        priamo sčítať s počtami firiem z mapy hustoty. Mzdy a zamestnanci sa
        navyše zisťujú len v podnikoch s 20 a viac zamestnancami, čiže
        živnostníkov a malé firmy nepokrývajú.
      </div>

      <section
        style={{
          ...CARD,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div style={{ flex: "1 1 240px" }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Ukazovateľ
          </label>
          <select
            style={SELECT}
            value={ukazovatel}
            onChange={(e) => {
              setUkazovatel(e.target.value);
              setRok(null);
            }}
          >
            {UKAZOVATELE.map((u) => (
              <option key={u.kod} value={u.kod}>
                {u.nazov}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: "1 1 240px" }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Odvetvie (sekcia SK NACE Rev. 2)
          </label>
          <select
            style={SELECT}
            value={sekcia}
            onChange={(e) => setSekcia(e.target.value)}
          >
            {(data?.sekcie ?? [{ kod: "SPOLU", nazov: "Spolu" }]).map((s) => (
              <option key={s.kod} value={s.kod}>
                {s.kod === "SPOLU" ? s.nazov : `${s.kod} - ${s.nazov}`}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: "1 1 160px" }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Rok
          </label>
          <select
            style={SELECT}
            value={rok ?? ""}
            onChange={(e) => setRok(Number(e.target.value))}
          >
            {(data?.dostupneRoky ?? []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </section>

      <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 12px" }}>
        {aktualny.popis}
      </p>

      <section style={{ ...CARD, padding: 8 }}>
        <DensityMap
          densityByDistrict={mapaDat}
          metric="absolute"
          loading={loading}
          popisHodnoty={aktualny.nazov}
          popisLegendy={{
            absolute: `${aktualny.nazov}${aktualny.jednotka ? ` (${aktualny.jednotka})` : ""}`,
            perCapita: aktualny.nazov,
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
          Farba obce zodpovedá hodnote jej okresu - ŠÚ SR tieto ukazovatele
          zverejňuje po okresy, nie po obce. Biele okresy nemajú za daný rok a
          odvetvie zverejnenú hodnotu (ŠÚ SR ju tají pri malom počte subjektov).
        </p>
      </section>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {[
          { titul: "Najvyššie hodnoty", data: najviac },
          { titul: "Najnižšie hodnoty", data: najmenej },
        ].map((tabulka) => (
          <section key={tabulka.titul} style={{ ...CARD, flex: "1 1 320px" }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 12px" }}>
              {tabulka.titul}
            </h2>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <tbody>
                {tabulka.data.map((o) => (
                  <tr
                    key={o.okresKod}
                    style={{ borderTop: "1px solid #e2e8f0" }}
                  >
                    <td style={{ padding: "7px 4px" }}>{o.nazov}</td>
                    <td
                      style={{
                        padding: "7px 4px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 600,
                      }}
                    >
                      {format(o.hodnota)}
                    </td>
                  </tr>
                ))}
                {tabulka.data.length === 0 && (
                  <tr>
                    <td style={{ padding: "7px 4px", color: "#94a3b8" }}>
                      Za tento výber nie sú zverejnené údaje.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <DataSourceBanner
        sources={sources.filter((s) =>
          s.sourceName.startsWith("ŠÚ SR - DATAcube"),
        )}
        note={
          <>
            Údaje sú ročné a ŠÚ SR ich spätne reviduje - pri každom sťahovaní sa
            celý ukazovateľ prepisuje nanovo, nie dopĺňa.
          </>
        }
      />
    </main>
  );
}
