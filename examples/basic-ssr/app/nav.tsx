import { Link } from "alabjs/components";

export function Nav() {
  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-zinc-900 hover:text-orange-500 transition-colors">
          <span className="text-xl">🔥</span>
          <span className="text-base tracking-tight">AlabJS</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 transition-colors">Home</Link>
          <Link href="/posts" className="hover:text-zinc-900 transition-colors">Posts</Link>
        </nav>
      </div>
    </header>
  );
}
