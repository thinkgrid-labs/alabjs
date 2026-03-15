export function Nav() {
  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-bold text-zinc-900 hover:text-orange-500 transition-colors">
          <span className="text-xl">🔥</span>
          <span className="text-base tracking-tight">alab</span>
        </a>
        <nav className="flex items-center gap-6 text-sm font-medium text-zinc-500">
          <a href="/" className="hover:text-zinc-900 transition-colors">Home</a>
          <a href="/posts" className="hover:text-zinc-900 transition-colors">Posts</a>
        </nav>
      </div>
    </header>
  );
}
