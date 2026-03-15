import { AlabProvider, useServerData } from "alab/client";
import type { getUser } from "./page.server";
import { Sidebar } from "../../nav";
import type { PageMetadata } from "alab";

export async function generateMetadata(params: Record<string, string>): Promise<PageMetadata> {
  const { getUser: getUserFn } = await import("./page.server.js");
  const user = await getUserFn({ params, query: {}, headers: {}, method: "GET", url: "" }, undefined);
  return {
    title: `${user.name} — Alab Dashboard`,
    description: `${user.name} · ${user.role} · ${user.status}`,
    robots: "noindex, nofollow",
    themeColor: "#0f172a",
  };
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function UserDetail({ params }: { params: Record<string, string> }) {
  const user = useServerData<typeof getUser>("getUser", params);

  return (
    <>
      <a href="/users" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors mb-8">
        ← Back to users
      </a>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
          {initials(user.name)}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">{user.name}</h1>
          <p className="text-zinc-400 text-sm">{user.email}</p>
        </div>
        <div className="ml-auto">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${user.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${user.status === "active" ? "bg-emerald-500" : "bg-amber-400"}`} />
            {user.status}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm divide-y divide-zinc-100 max-w-lg">
        {[
          { label: "User ID", value: `#${user.id}` },
          { label: "Email", value: user.email },
          { label: "Role", value: user.role },
          { label: "Status", value: user.status },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-5 py-4">
            <span className="text-sm text-zinc-400">{label}</span>
            <span className="text-sm font-medium text-zinc-900">{value}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function UserDetailPage({ params }: { params: Record<string, string> }) {
  return (
    <AlabProvider fallback={<div className="flex items-center justify-center h-screen text-zinc-400 text-sm">Loading…</div>}>
      <div className="flex min-h-screen bg-zinc-50">
        <Sidebar />
        <main className="flex-1 p-8">
          <UserDetail params={params} />
        </main>
      </div>
    </AlabProvider>
  );
}
