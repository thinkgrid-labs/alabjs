import { AlabProvider } from "alabjs/client";
import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Alab — Live Dashboard</title>
      </head>
      <body className="bg-gray-950 text-gray-100 min-h-screen font-sans antialiased">
        <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
          <span className="text-indigo-400 font-bold text-lg tracking-tight">alab</span>
          <span className="text-gray-500 text-sm">live dashboard example</span>
        </header>
        <AlabProvider fallback={<p className="p-8 text-gray-500">Loading…</p>}>
          {children}
        </AlabProvider>
      </body>
    </html>
  );
}
