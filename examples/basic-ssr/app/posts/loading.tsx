import { Nav } from "../nav";

// Shown while useServerData suspends — co-located with the route
export default function PostsLoading() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-14">
        <div className="h-8 w-24 bg-zinc-200 rounded-md animate-pulse mb-2" />
        <div className="h-4 w-64 bg-zinc-100 rounded animate-pulse mb-10" />
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="h-3 w-32 bg-zinc-100 rounded animate-pulse mb-3" />
              <div className="h-5 w-3/4 bg-zinc-200 rounded animate-pulse mb-2" />
              <div className="h-4 w-full bg-zinc-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
