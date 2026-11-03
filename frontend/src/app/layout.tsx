import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HookPulse Studio ⚡ | Distributed Event Ingestion & Webhook Delivery",
  description: "High-Throughput Distributed Webhook Ingestion & Delivery Engine Developer Portal & Observability Console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
      </body>
    </html>
  );
}
