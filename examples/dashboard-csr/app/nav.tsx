import { Link } from "alab/components";

export function Sidebar() {
  return (
    <aside className="w-56 min-h-screen bg-zinc-900 flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔥</span>
          <span className="text-white font-bold text-base tracking-tight">alab</span>
          <span className="ml-auto text-[10px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded px-1.5 py-0.5">
            BETA
          </span>
        </div>
      </div>

      {/* Nav — uses <Link> for client-side navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-2 mb-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Menu</p>
        {[
          { href: "/", icon: "▦", label: "Overview" },
          { href: "/users", icon: "◎", label: "Users" },
          { href: "/activity", icon: "◈", label: "Activity" },
        ].map(({ href, icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <span className="text-base leading-none">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            A
          </div>
          <div>
            <p className="text-white text-xs font-medium leading-none">Admin</p>
            <p className="text-zinc-500 text-[10px] mt-0.5">admin@alab.dev</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
