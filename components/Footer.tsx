"use client";

import { useEffect, useState } from "react";

export function Footer() {
  // Driven from JS state rather than a CSS media query - a media-query
  // rule in globals.css silently failed to make it into the compiled
  // bundle (stale Turbopack cache), so this doesn't depend on that build
  // step working.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <footer
      style={{
        background: "#2563eb",
        marginTop: 40,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "20px 20px",
          display: "flex",
          justifyContent: isMobile ? "center" : "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          fontSize: 13,
          color: "rgba(255,255,255,0.85)",
          textAlign: isMobile ? "center" : "left",
        }}
      >
        <span>Databáza Firiem - dáta z verejného registra RPO.</span>
        <span>
          Postavil{" "}
          <a
            href="https://www.jaroslavbarabas.sk/"
            target="_blank"
            rel="noreferrer"
            style={{ color: "white", textDecoration: "underline", fontWeight: 600 }}
          >
            Jaroslav Barabáš
          </a>
        </span>
      </div>
    </footer>
  );
}
