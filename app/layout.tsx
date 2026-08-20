import type { Metadata } from "next";
import { Urbanist, Sora } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import "./globals.css";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin", "latin-ext"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Databáza Firiem",
  description: "Mapa hustoty firiem a živnostníkov na Slovensku podľa okresu a odvetvia",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sk" className={`${urbanist.variable} ${sora.variable}`}>
      <body style={{ margin: 0, background: "#f8fafc", display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <AppHeader />
        <div id="main-content" style={{ flex: 1 }}>{children}</div>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
