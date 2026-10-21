import { STAVY, type Stav } from "@/lib/stavSubjektu";

interface Props {
  totalActive: number;
  bezZaniku: number;
  podlaStavu: Partial<Record<Stav, number>>;
}

// Čo sa do "aktívnych" nezapočítalo. Musí byť vidno priamo pri čísle, nie
// v poznámke pod čiarou (CLAUDE.md) - rozdiel je ~20 % registra.
export function AktivneFirmyBanner({ totalActive, bezZaniku, podlaStavu }: Props) {
  const vynechane = (Object.keys(STAVY) as Stav[])
    .filter((stav) => stav !== "aktivny" && (podlaStavu[stav] ?? 0) > 0)
    .sort((a, b) => (podlaStavu[b] ?? 0) - (podlaStavu[a] ?? 0));

  return (
    <div
      style={{
        border: "1px solid #f59e0b",
        background: "#fffbeb",
        color: "#78350f",
        borderRadius: 8,
        padding: "12px 16px",
        fontSize: 14,
        lineHeight: 1.5,
        marginBottom: 20,
      }}
    >
      <strong>Ako počítame aktívne firmy.</strong> V RPO je{" "}
      {bezZaniku.toLocaleString("sk-SK")} záznamov bez dátumu zániku. Za aktívne
      berieme len {totalActive.toLocaleString("sk-SK")} firiem a živnostníkov
      (podľa IČO). Nepočítame:
      <ul style={{ margin: "6px 0 6px 18px", padding: 0 }}>
        {vynechane.map((stav) => (
          <li key={stav}>
            {STAVY[stav]}: {(podlaStavu[stav] ?? 0).toLocaleString("sk-SK")}
          </li>
        ))}
      </ul>
      Aj firma, ktorú register vedie ako aktívnu, môže reálne nepodnikať (napr.
      s. r. o. bez tržieb). To z registra nezistíme.
    </div>
  );
}
