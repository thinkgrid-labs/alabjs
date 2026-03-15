import { AlabProvider, useServerData } from "alab/client";
import type { getUsers } from "./page.server";
import { Sidebar } from "../nav";
import type { PageMetadata } from "alab";

export const metadata: PageMetadata = {
  title: "Users — Alab Dashboard",
  description: "Manage your team members, roles, and account statuses.",
  robots: "noindex, nofollow",
  themeColor: "#0f172a",
};

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-orange-500", "bg-pink-500",
];

function UserTable() {
  const users = useServerData<typeof getUsers>("getUsers");

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-200">
            <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">User</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Role</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => (
            <tr key={u.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors">
              <td className="px-5 py-3.5">
                <a href={`/users/${u.id}`} className="flex items-center gap-3 group">
                  <div className={`w-8 h-8 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                    {initials(u.name)}
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900 group-hover:text-orange-500 transition-colors">{u.name}</p>
                    <p className="text-xs text-zinc-400">{u.email}</p>
                  </div>
                </a>
              </td>
              <td className="px-5 py-3.5">
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${u.role === "admin" ? "bg-violet-50 text-violet-700 border border-violet-200" : "bg-zinc-100 text-zinc-600 border border-zinc-200"}`}>
                  {u.role}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${u.status === "active" ? "bg-emerald-500" : "bg-amber-400"}`} />
                  {u.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function UsersPage() {
  return (
    <AlabProvider fallback={<div className="flex items-center justify-center h-screen text-zinc-400 text-sm">Loading…</div>}>
      <div className="flex min-h-screen bg-zinc-50">
        <Sidebar />
        <main className="flex-1 p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Users</h1>
            <p className="text-zinc-400 text-sm mt-1">Manage your team members and their roles.</p>
          </div>
          <UserTable />
        </main>
      </div>
    </AlabProvider>
  );
}
