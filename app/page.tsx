"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { DataSourceBanner } from "@/components/DataSourceBanner";
import { FirmListPanel } from "@/components/FirmListPanel";
import { Hero } from "@/components/Hero";
import { SearchableSelect } from "@/components/SearchableSelect";
import { LEGAL_FORMS } from "@/lib/legalForms";
import type { Metric, DistrictDensity } from "@/components/DensityMap";

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

const StatsCharts = dynamic(
  () => import("@/components/StatsCharts").then((m) => m.StatsCharts),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
        Načítavam grafy…
      </div>
    ),
  },
);

// NACE Rev. 2.1 class, as served by /api/categories.
interface Category {
  kod4: string;
  nazov: string;
  sekcia: string;
  sekciaNazov: string;
}

interface Kraj {
  kod: string;
  nazovSk: string;
}

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

export interface Stats {
  totalActive: number;
  totalTerminated: number;
  byDistrict: { nazov: string; pocet: number }[];
  byCategory: { kod4: string; nazov: string; pocet: number }[];
  byYear: { rok: number; pocet: number }[];
  computedAt?: string;
}

function MapaHustotyFiriem() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state is the single source of truth for both filters. Reading-
  // and-rewriting the URL on each change races when the category and
  // metric change in quick succession, since router.push()'s navigation
  // is asynchronous - neither update sees the other's pending change yet.
  // The URL is a one-way sync derived FROM this state, not the other way
  // around.
  const [naceParam, setNaceParam] = useState(
    () => searchParams.get("nace") ?? "",
  );
  const [krajParam, setKrajParam] = useState(
    () => searchParams.get("kraj") ?? "",
  );
  const [formaParam, setFormaParam] = useState(
    () => searchParams.get("forma") ?? "",
  );
  const [metricParam, setMetricParam] = useState<Metric>(
    () => (searchParams.get("metrika") as Metric) ?? "absolute",
  );

  const [categories, setCategories] = useState<Category[]>([]);
  const [kraje, setKraje] = useState<Kraj[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [densityByDistrict, setDensityByDistrict] = useState<Record<
    string,
    DistrictDensity
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState<{
    kod: string;
    nazov: string;
  } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dlznikyOkresov, setDlznikyOkresov] = useState<DlznikOkres[]>([]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories))
      .catch(() => setCategories([]));

    fetch("/api/kraje")
      .then((r) => r.json())
      .then((d) => setKraje(d.regions))
      .catch(() => setKraje([]));

    fetch("/api/data-sources")
      .then((r) => r.json())
      .then((d) => setSources(d.sources))
      .catch(() => setSources([]));

    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => setStats(null));

    fetch("/api/fs-dlznici-okres")
      .then((r) => r.json())
      .then((d) => setDlznikyOkresov(d.okresy))
      .catch(() => setDlznikyOkresov([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (naceParam) params.set("nace", naceParam);
    if (krajParam) params.set("kraj", krajParam);
    if (formaParam) params.set("forma", formaParam);
    if (metricParam !== "absolute") params.set("metrika", metricParam);
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [naceParam, krajParam, formaParam, metricParam, router]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (naceParam) params.set("nace", naceParam);
    if (krajParam) params.set("kraj", krajParam);
    if (formaParam) params.set("forma", formaParam);
    fetch(`/api/density?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setDensityByDistrict(d.byDistrict))
      .finally(() => setLoading(false));
  }, [naceParam, krajParam, formaParam]);

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

  return (
    <>
      <Hero activeCount={stats?.totalActive ?? null} />

      <main
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "24px 20px 48px",
          color: "#1e293b",
        }}
      >
        <header id="mapa" style={{ marginBottom: 20, scrollMarginTop: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Mapa hustoty firiem
          </h1>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>
            Hustota firiem a živnostníkov na Slovensku podľa okresu a kategórie.
          </p>
        </header>

        <section
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "flex-end",
            marginBottom: 16,
            padding: 16,
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div style={{ flex: "1 1 260px" }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Kategória (NACE) - píš pre hľadanie
            </label>
            <SearchableSelect
              options={categories.map((c) => ({
                value: c.kod4,
                label: `${c.nazov} (${c.kod4})`,
                keywords: `${c.sekcia} ${c.sekciaNazov}`,
              }))}
              value={naceParam}
              onChange={setNaceParam}
              placeholder="Všetky kategórie"
              emptyOptionLabel="Všetky kategórie"
            />
          </div>

          <div style={{ flex: "1 1 260px" }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Kraj
            </label>
            <select
              value={krajParam}
              onChange={(e) => setKrajParam(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                width: "100%",
              }}
            >
              <option value="">Celé Slovensko</option>
              {kraje.map((k) => (
                <option key={k.kod} value={k.kod}>
                  {k.nazovSk}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: "1 1 260px" }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Právna forma
            </label>
            <select
              value={formaParam}
              onChange={(e) => setFormaParam(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                width: "100%",
              }}
            >
              <option value="">Všetky formy</option>
              {LEGAL_FORMS.map((f) => (
                <option key={f.kod} value={f.kod}>
                  {f.nazov}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: "1 1 260px" }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Metrika
            </label>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => setMetricParam("absolute")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: metricParam === "absolute" ? "#2563eb" : "white",
                  color: metricParam === "absolute" ? "white" : "#1e293b",
                  cursor: "pointer",
                }}
              >
                Absolútny počet
              </button>
              <button
                onClick={() => setMetricParam("perCapita")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: metricParam === "perCapita" ? "#2563eb" : "white",
                  color: metricParam === "perCapita" ? "white" : "#1e293b",
                  cursor: "pointer",
                }}
              >
                Na 1000 obyvateľov
              </button>
              <button
                onClick={() => setMetricParam("dphShare")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: metricParam === "dphShare" ? "#2563eb" : "white",
                  color: metricParam === "dphShare" ? "white" : "#1e293b",
                  cursor: "pointer",
                }}
              >
                % platcov DPH
              </button>
            </div>
          </div>
        </section>

        <div
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: 8,
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          }}
        >
          <DensityMap
            densityByDistrict={densityByDistrict}
            metric={metricParam}
            loading={loading}
            onDistrictClick={(kod, nazov) =>
              setSelectedDistrict({ kod, nazov })
            }
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <DataSourceBanner
            sources={sources.filter(
              (s) =>
                s.sourceName === "RPO" ||
                s.sourceName === "ŠÚ SR - klasifikácie (NACE)",
            )}
            activeCount={stats?.totalActive ?? null}
            note={
              <>
                <strong>Klasifikácia: NACE Rev. 2.1 (platná od 2025).</strong>{" "}
                Kategórie a kódy firiem pochádzajú z RPO, ktorý už používa novú
                revíziu - staré kódy SK NACE Rev. 2 (napr. 62.01, 70.22, 47.11)
                v nej neexistujú. Odkazy so starým kódom prevádzame oficiálnym
                prevodníkom ŠÚ SR.
              </>
            }
          />
        </div>

        {dlznikyOkresov.length > 0 && (
          <div style={{ marginTop: 16 }}>
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
                  <strong>
                    agregát podľa PSČ, nie zoznam konkrétnych firiem
                  </strong>{" "}
                  - dlžníci sú fyzické aj právnické osoby a mená sa z dôvodu
                  ochrany súkromia neukladajú. „% platcov DPH" na mape hore je
                  samostatný, nesúvisiaci ukazovateľ (byť platiteľom DPH nie je
                  dlh).
                </>
              }
            />
          </div>
        )}

        {najzadlzenejsie.length > 0 && (
          <section
            style={{
              marginTop: 20,
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
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr
                  style={{ textAlign: "left", color: "#64748b", fontSize: 12 }}
                >
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
                {najzadlzenejsie.map((o) => (
                  <tr
                    key={o.okresKod}
                    style={{ borderTop: "1px solid #e2e8f0" }}
                  >
                    <td style={{ padding: "8px" }}>{o.nazov}</td>
                    <td
                      style={{
                        padding: "8px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 600,
                      }}
                    >
                      {Math.round(o.dlhNa1000Obyv ?? 0).toLocaleString("sk-SK")}{" "}
                      €
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
        )}

        {dphVsDlhBody.length > 0 && (
          <section
            style={{
              marginTop: 20,
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
              Každý bod je jeden okres. Vodorovne: podiel aktívnych firiem,
              ktoré sú platiteľmi DPH. Zvislo: podiel aktívnych firiem
              evidovaných ako daňový dlžník. Veľkosť bodky = počet aktívnych
              firiem v okrese.
            </p>
            <div style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 10, right: 20, bottom: 20, left: 10 }}
                >
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
                      const p = payload[0]
                        .payload as (typeof dphVsDlhBody)[number];
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
                          <div>
                            {p.podielDlznikov.toFixed(1)} % daňových dlžníkov
                          </div>
                          <div style={{ color: "#64748b" }}>
                            {p.aktivnychFiriem.toLocaleString("sk-SK")}{" "}
                            aktívnych firiem
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={dphVsDlhBody}
                    fill="#2563eb"
                    fillOpacity={0.6}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        <section id="statistiky" style={{ marginTop: 40, scrollMarginTop: 20 }}>
          <header style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
              Štatistiky registra
            </h2>
            <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>
              Zistenia vypočítané z celého registra RPO - okresy, odvetvia,
              história registrácií.
            </p>
          </header>

          {!stats ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
              Načítavam…
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 20,
                }}
              >
                <StatCard
                  label="Aktívnych firiem"
                  value={stats.totalActive.toLocaleString("sk-SK")}
                  color="#2563eb"
                />
                <StatCard
                  label="Zaniknutých firiem (od roku 1995)"
                  value={stats.totalTerminated.toLocaleString("sk-SK")}
                  color="#94a3b8"
                />
                <StatCard
                  label="Podiel zaniknutých"
                  value={`${((stats.totalTerminated / (stats.totalActive + stats.totalTerminated)) * 100).toFixed(1)} %`}
                  color="#dc2626"
                />
              </div>
              <StatsCharts stats={stats} />
            </>
          )}
        </section>

        {selectedDistrict && (
          <FirmListPanel
            okresKod={selectedDistrict.kod}
            okresNazov={selectedDistrict.nazov}
            naceFilter={naceParam}
            formaFilter={formaParam}
            categories={categories}
            onClose={() => setSelectedDistrict(null)}
          />
        )}
      </main>
    </>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 200px",
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "18px 20px",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MapaHustotyFiriem />
    </Suspense>
  );
}
