import { Image } from "alabjs/components";
import { Nav } from "./nav";
import type { PageMetadata, CdnCache } from "alabjs";

export const ssr = true;

// Public homepage — cache at the CDN edge for 10 minutes.
// ALAB_PUBLIC_* vars are safe to use in client components (inlined at build time).
const siteName = import.meta.env.ALAB_PUBLIC_SITE_NAME ?? "AlabJS";

export const cdnCache: CdnCache = {
  maxAge: 600,
  swr: 60,
  tags: ["homepage"],
};

export const metadata: PageMetadata = {
  title: "AlabJS — Build with intensity",
  description: "Full-stack React framework powered by a Rust compiler. Explicit server boundaries, opt-in SSR, zero magic.",
  og: {
    title: "AlabJS — Build with intensity",
    description: "Full-stack React framework powered by a Rust compiler. Explicit server boundaries, opt-in SSR, zero magic.",
    image: "/hero.jpg",
    type: "website",
    siteName: "AlabJS",
  },
  twitter: {
    card: "summary_large_image",
    title: "AlabJS — Build with intensity",
    description: "Full-stack React framework powered by a Rust compiler.",
    image: "/hero.jpg",
  },
  themeColor: "#f97316",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-10">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-semibold text-orange-600 uppercase tracking-wider">
          <span>🔥</span> Full-stack React
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-zinc-900 mb-4 leading-tight">
          Build with <span className="text-orange-500">{siteName.toLowerCase()}</span>.
        </h1>
        <p className="text-lg text-zinc-500 mb-3 max-w-xl">
          <em className="not-italic font-semibold text-zinc-700">AlabJS</em> — Filipino for{" "}
          <em className="not-italic font-semibold text-orange-500">blaze</em>. A full-stack React
          framework powered by a Rust compiler.
        </p>
        <p className="text-zinc-400 text-sm mb-8">
          Explicit server boundaries · Opt-in SSR · oxc-based transforms · Zero magic.
        </p>
        <div className="flex gap-3 mb-12">
          <a
            href="/posts"
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors"
          >
            Browse posts →
          </a>
          <a
            href="https://github.com/thinkgrid-labs/alabjs"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            GitHub ↗
          </a>
        </div>

        {/* Hero image using alab's Image component */}
        <div className="rounded-2xl overflow-hidden shadow-lg border border-zinc-200">
          <Image
            src="/hero.jpg"
            alt="AlabJS — build with intensity"
            width={1200}
            height={600}
            sizes="(max-width: 768px) 100vw, 720px"
            priority
            className="w-full h-auto block"
          />
        </div>
      </section>

      {/* Feature grid */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          {[
            { icon: "⚡", label: "Rust compiler", desc: "oxc-powered transforms, 50× faster than tsc" },
            { icon: "🔒", label: "Type-safe boundaries", desc: "Server imports blocked at compile time" },
            { icon: "🌊", label: "Streaming SSR", desc: "renderToPipeableStream with Suspense support" },
          ].map((f) => (
            <div key={f.label} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="font-semibold text-zinc-900 text-sm mb-1">{f.label}</div>
              <div className="text-xs text-zinc-500 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
