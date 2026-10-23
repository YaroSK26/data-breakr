"use client";

import { AkcioveSpolocnostiSection } from "@/components/AkcioveSpolocnostiSection";
import { StatistikyOkresovSection } from "@/components/StatistikyOkresovSection";

export default function StatistikyOkresovPage() {
  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "96px 20px 48px",
        color: "#1e293b",
      }}
    >
      <StatistikyOkresovSection />
      <AkcioveSpolocnostiSection />
    </main>
  );
}
