import { Link } from "alab/components";
import { Nav } from "../nav";

// Rendered when any server function in this route tree throws
export default function PostsError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-14">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <div className="text-4xl mb-4">💥</div>
          <h1 className="text-xl font-bold text-red-800 mb-2">Failed to load posts</h1>
          <p className="text-sm text-red-600 mb-6 font-mono">{error.message}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={reset}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors"
            >
              Go home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
