interface DataSourceBannerProps {
  sources: {
    sourceName: string;
    sourceUrl: string;
    lastSyncedAt: string | null;
    recordsCount: number | null;
  }[];
  activeCount?: number | null;
}

export function DataSourceBanner({ sources, activeCount }: DataSourceBannerProps) {
  return (
    <div
      style={{
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        padding: "12px 16px",
        background: "#f8fafc",
        fontSize: 13,
        color: "#475569",
        display: "flex",
        flexWrap: "wrap",
        gap: "4px 16px",
      }}
    >
      <span style={{ fontWeight: 600, color: "#334155" }}>Zdroje dát:</span>
      {sources.map((s) => (
        <span key={s.sourceName}>
          <a
            href={s.sourceUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#2563eb" }}
          >
            {s.sourceName}
          </a>
          {s.lastSyncedAt && (
            <>
              {" "}
              - aktualizované{" "}
              {new Date(s.lastSyncedAt).toLocaleDateString("sk-SK")}
            </>
          )}
          {s.recordsCount !== null && (
            <>
              {" "}
              ({s.recordsCount.toLocaleString("sk-SK")} záznamov
              {s.sourceName === "RPO" && activeCount != null && (
                <>, z toho {activeCount.toLocaleString("sk-SK")} aktívnych</>
              )}
              )
            </>
          )}
        </span>
      ))}
      <span style={{ marginLeft: "auto", fontStyle: "italic" }}>
        Zahŕňa všetky firmy vrátane živnostníkov (RPO).
      </span>
    </div>
  );
}
