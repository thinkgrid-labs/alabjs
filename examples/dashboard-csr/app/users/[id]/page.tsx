import { AlabProvider, useServerData, useMutation } from "alabjs/client";
import { Link } from "alabjs/components";
import type { getUser, toggleUserStatus } from "./page.server";
import { Sidebar } from "../../nav";
import type { GenerateMetadata } from "alabjs";

export const generateMetadata: GenerateMetadata = async ({ params }) => ({
  title: `User #${params.id} — Alab Dashboard`,
  description: "User detail page.",
  robots: "noindex, nofollow",
  themeColor: "#0f172a",
});

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-orange-500", "bg-pink-500",
];

function UserDetail({ params }: { params: { id: string } }) {
  const user = useServerData<typeof getUser>("getUser", { id: params.id });
  const { mutate: toggle, isPending, data: updated, error } = useMutation<typeof toggleUserStatus>("toggleUserStatus");

  const displayUser = updated ?? user;
  const colorIdx = (parseInt(params.id, 10) - 1) % AVATAR_COLORS.length;

  return (
    <>
      <Link
        href="/users"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors mb-8"
      >
        ← Back to users
      </Link>

      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        <div className={`w-14 h-14 rounded-full ${AVATAR_COLORS[colorIdx]} flex items-center justify-center text-white text-lg font-bold flex-shrink-0`}>
          {initials(displayUser.name)}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">{displayUser.name}</h1>
          <p className="text-zinc-400 text-sm">{displayUser.email}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${displayUser.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${displayUser.status === "active" ? "bg-emerald-500" : "bg-amber-400"}`} />
            {displayUser.status}
          </span>
          {/* useMutation — toggle status with loading + error state */}
          <button
            onClick={() => toggle({ id: params.id })}
            disabled={isPending}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving…" : displayUser.status === "active" ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error.message}
        </div>
      )}

      {/* Detail card */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm divide-y divide-zinc-100 max-w-lg">
        {[
          { label: "User ID", value: `#${displayUser.id}` },
          { label: "Email", value: displayUser.email },
          { label: "Role", value: displayUser.role },
          { label: "Status", value: displayUser.status },
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

export default function UserDetailPage({ params }: { params: { id: string } }) {
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
