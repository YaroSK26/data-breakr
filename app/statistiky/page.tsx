"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { DataSourceBanner } from "@/components/DataSourceBanner";

interface DataSource {
  sourceName: string;
  sourceUrl: string;
  lastSyncedAt: string | null;
  recordsCount: number | null;
}

interface DlznikOkres {
  okresKod: string;
  nazov: string;
  pocetDlznikov: number;
  sumaDlhu: number;
  aktivnychFiriem: number;
  pocetPlatcovDph: number;
  obyvatelov: number | null;
}

export default function StatistikyPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [dlznikyOkresov, setDlznikyOkresov] = useState<DlznikOkres[]>([]);

  useEffect(() => {
    fetch("/api/data-sources")
      .then((r) => r.json())
      .then((d) => setSources(d.sources))
      .catch(() => setSources([]));

    fetch("/api/fs-dlznici-okres")
      .then((r) => r.json())
      .then((d) => setDlznikyOkresov(d.okresy))
      .catch(() => setDlznikyOkresov([]));
  }, []);

  // Okresy s aspoň nejakými aktívnymi firmami - okres bez firiem by mal
  // podiely 0/0, čo by v rebríčku aj v grafe vyzeralo ako "žiadny dlh"
  // namiesto "chýbajúce dáta".
  const okresyNaAnalyzu = useMemo(
    () => dlznikyOkresov.filter((o) => o.aktivnychFiriem > 0),
    [dlznikyOkresov],
  );

  const najzadlzenejsie = useMemo(
    () =>
      [...okresyNaAnalyzu]
        .map((o) => ({
          ...o,
          dlhNa1000Obyv: o.obyvatelov
            ? (o.sumaDlhu / o.obyvatelov) * 1000
            : null,
        }))
        .filter((o) => o.dlhNa1000Obyv !== null)
        .sort((a, b) => (b.dlhNa1000Obyv ?? 0) - (a.dlhNa1000Obyv ?? 0))
        .slice(0, 10),
    [okresyNaAnalyzu],
  );

  const dphVsDlhBody = useMemo(
    () =>
      okresyNaAnalyzu.map((o) => ({
        nazov: o.nazov,
        podielDph: (o.pocetPlatcovDph / o.aktivnychFiriem) * 100,
        podielDlznikov: (o.pocetDlznikov / o.aktivnychFiriem) * 100,
        aktivnychFiriem: o.aktivnychFiriem,
      })),
    [okresyNaAnalyzu],
  );

  const loading = dlznikyOkresov.length === 0;

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
          Daňové dlžníctvo
        </h1>
        <p style={{ color: "#64748b", margin: "6px 0 0", fontSize: 15 }}>
          Daňoví dlžníci a platitelia DPH podľa okresu. Dáta Finančnej správy
          SR.
        </p>
      </header>

      <section
        style={{
          marginBottom: 20,
          padding: 20,
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
          Rebríček najzadlženejších okresov
        </h2>
        <p style={{ color: "#64748b", margin: "0 0 14px", fontSize: 13 }}>
          Dlh daňových dlžníkov (FS SR) na 1000 obyvateľov okresu.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#64748b", fontSize: 12 }}>
              <th style={{ padding: "6px 8px" }}>Okres</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>
                Dlh / 1000 obyv.
              </th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>
                Dlžníkov
              </th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>
                Dlh spolu
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td style={{ padding: "8px", color: "#94a3b8" }} colSpan={4}>
                  Načítavam…
                </td>
              </tr>
            )}
            {najzadlzenejsie.map((o) => (
              <tr key={o.okresKod} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ padding: "8px" }}>{o.nazov}</td>
                <td
                  style={{
                    padding: "8px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 600,
                  }}
                >
                  {Math.round(o.dlhNa1000Obyv ?? 0).toLocaleString("sk-SK")} €
                </td>
                <td
                  style={{
                    padding: "8px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: "#64748b",
                  }}
                >
                  {o.pocetDlznikov.toLocaleString("sk-SK")}
                </td>
                <td
                  style={{
                    padding: "8px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: "#64748b",
                  }}
                >
                  {Math.round(o.sumaDlhu).toLocaleString("sk-SK")} €
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section
        style={{
          marginBottom: 20,
          padding: 20,
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
          DPH podiel vs. daňový dlh
        </h2>
        <p style={{ color: "#64748b", margin: "0 0 14px", fontSize: 13 }}>
          Každý bod je jeden okres. Vodorovne: podiel aktívnych firiem, ktoré
          sú platiteľmi DPH. Zvislo: podiel aktívnych firiem evidovaných ako
          daňový dlžník. Veľkosť bodky = počet aktívnych firiem v okrese.
        </p>
        <div style={{ height: 340 }}>
          {loading ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#94a3b8",
                fontSize: 13,
              }}
            >
              Načítavam…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="podielDph"
                  name="% platcov DPH"
                  unit=" %"
                  fontSize={11}
                  label={{
                    value: "% platcov DPH",
                    position: "insideBottom",
                    offset: -8,
                    fontSize: 12,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="podielDlznikov"
                  name="% daňových dlžníkov"
                  unit=" %"
                  fontSize={11}
                  label={{
                    value: "% daňových dlžníkov",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 12,
                  }}
                />
                <ZAxis
                  type="number"
                  dataKey="aktivnychFiriem"
                  range={[40, 400]}
                  name="aktívnych firiem"
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof dphVsDlhBody)[number];
                    return (
                      <div
                        style={{
                          background: "white",
                          border: "1px solid #e2e8f0",
                          borderRadius: 6,
                          padding: "8px 10px",
                          fontSize: 12,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                        }}
                      >
                        <strong>{p.nazov}</strong>
                        <div>{p.podielDph.toFixed(1)} % platcov DPH</div>
                        <div>{p.podielDlznikov.toFixed(1)} % daňových dlžníkov</div>
                        <div style={{ color: "#64748b" }}>
                          {p.aktivnychFiriem.toLocaleString("sk-SK")} aktívnych firiem
                        </div>
                      </div>
                    );
                  }}
                />
                <Scatter data={dphVsDlhBody} fill="#2563eb" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <DataSourceBanner
        sources={sources.filter((s) =>
          s.sourceName.startsWith("Finančná správa SR"),
        )}
        note={
          <>
            <strong>
              {dlznikyOkresov
                .reduce((a, o) => a + o.pocetDlznikov, 0)
                .toLocaleString("sk-SK")}{" "}
              daňových dlžníkov
            </strong>{" "}
            eviduje FS SR celoslovensky, s dlhom{" "}
            {Math.round(
              dlznikyOkresov.reduce((a, o) => a + o.sumaDlhu, 0),
            ).toLocaleString("sk-SK")}{" "}
            €. Ide o{" "}
            <strong>agregát podľa PSČ, nie zoznam konkrétnych firiem</strong>{" "}
            - dlžníci sú fyzické aj právnické osoby a mená sa z dôvodu
            ochrany súkromia neukladajú. „% platcov DPH" na mape hustoty je
            samostatný, nesúvisiaci ukazovateľ (byť platiteľom DPH nie je
            dlh).
          </>
        }
      />
    </main>
  );
}
