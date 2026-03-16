import { describe, it, expect, beforeEach } from "vitest";
import { recordMetric, getSnapshot, clearStore } from "./store.js";

beforeEach(() => clearStore());

describe("recordMetric / getSnapshot", () => {
  it("records a single LCP and counts it as a pageview", () => {
    recordMetric("/blog", "LCP", 1200);
    const snap = getSnapshot();
    expect(snap.routes["/blog"]?.pageviews).toBe(1);
    expect(snap.routes["/blog"]?.lcp_p75).toBe(1200);
  });

  it("computes p75 correctly across multiple samples", () => {
    // 4 samples: [100, 200, 300, 400] → sorted → index floor(4*0.75)=3 → 400
    for (const v of [300, 100, 400, 200]) recordMetric("/", "LCP", v);
    const snap = getSnapshot();
    expect(snap.routes["/"]?.lcp_p75).toBe(400);
  });

  it("evicts oldest sample when ring buffer is full", () => {
    // Fill 500 samples with value 1, then add one with value 9999
    for (let i = 0; i < 500; i++) recordMetric("/test", "FCP", 1);
    recordMetric("/test", "FCP", 9999);
    const snap = getSnapshot();
    // Ring should still have exactly 500 entries (oldest 1 evicted, 9999 added)
    // p75 of 499×1 + 1×9999 = index 374 → 1
    expect(snap.routes["/test"]?.fcp_p75).toBe(1);
  });

  it("ignores unknown metric names", () => {
    // @ts-expect-error intentionally invalid
    recordMetric("/x", "UNKNOWN", 100);
    const snap = getSnapshot();
    expect(snap.routes["/x"]).toBeUndefined();
  });

  it("tracks multiple routes independently", () => {
    recordMetric("/a", "CLS", 0.05);
    recordMetric("/b", "CLS", 0.2);
    const snap = getSnapshot();
    expect(snap.routes["/a"]?.cls_p75).toBe(0.05);
    expect(snap.routes["/b"]?.cls_p75).toBe(0.2);
  });
});
