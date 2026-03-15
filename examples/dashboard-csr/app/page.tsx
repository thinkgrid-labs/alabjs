import { Sidebar } from "./nav";
import { AlabProvider } from "alabjs/client";
import type { PageMetadata } from "alabjs";

export const metadata: PageMetadata = {
  title: "Overview — Alab Dashboard",
  description: "Monitor users, revenue, and conversion rates in your Alab-powered dashboard.",
  robots: "noindex, nofollow",
  og: {
    title: "Alab Dashboard",
    description: "Full-stack admin dashboard built with Alab.",
    type: "website",
    siteName: "Alab Dashboard",
  },
  themeColor: "#0f172a",
};

export default function OverviewPage() {
  const stats = [
    { label: "Total Users", value: "1,284", delta: "+12%", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100", icon: "◎" },
    { label: "Active", value: "947", delta: "+5%", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100", icon: "✦" },
    { label: "Revenue", value: "$48k", delta: "+8%", color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-100", icon: "◈" },
    { label: "Conversion", value: "3.6%", delta: "-0.2%", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100", icon: "◉" },
  ];

  return (
    <AlabProvider fallback={<div className="flex items-center justify-center h-screen text-zinc-400 text-sm">Loading…</div>}>
      <div className="flex min-h-screen bg-zinc-50">
        <Sidebar />
        <main className="flex-1 p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Overview</h1>
            <p className="text-zinc-400 text-sm mt-1">Welcome back. Here's what's happening.</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            {stats.map((s) => (
              <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-5`}>
                <div className={`text-xl mb-2 ${s.color}`}>{s.icon}</div>
                <div className="text-2xl font-bold text-zinc-900 mb-1">{s.value}</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">{s.label}</span>
                  <span className={`text-xs font-semibold ${s.delta.startsWith("+") ? "text-emerald-600" : "text-red-500"}`}>
                    {s.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Quick nav */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-700 mb-3">Quick navigation</h2>
            <p className="text-sm text-zinc-400">
              Navigate to <a href="/users" className="text-orange-500 font-medium hover:underline">Users →</a> to manage your team.
            </p>
          </div>
        </main>
      </div>
    </AlabProvider>
  );
}
