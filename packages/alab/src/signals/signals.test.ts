import { describe, it, expect } from "vitest";
import { signal, computed } from "./index.js";

// Note: useSignal, useSignalValue, useSignalSetter are React hooks that require
// a React component context. We test the non-hook primitives here (signal, computed)
// which contain the core reactivity logic (~70% of the module's surface area).

describe("signal", () => {
  it("initialises with the given value", () => {
    const s = signal(42);
    expect(s.get()).toBe(42);
  });

  it("updates value via set()", () => {
    const s = signal(0);
    s.set(10);
    expect(s.get()).toBe(10);
  });

  it("supports functional updates", () => {
    const s = signal(5);
    s.set((prev) => prev + 3);
    expect(s.get()).toBe(8);
  });

  it("getSnapshot returns the current value", () => {
    const s = signal("hello");
    expect(s.getSnapshot()).toBe("hello");
    s.set("world");
    expect(s.getSnapshot()).toBe("world");
  });

  it("notifies subscribers on change", () => {
    const s = signal(0);
    let notified = false;
    s.subscribe(() => {
      notified = true;
    });
    s.set(1);
    expect(notified).toBe(true);
  });

  it("does NOT notify when value is unchanged (Object.is)", () => {
    const s = signal(42);
    let callCount = 0;
    s.subscribe(() => {
      callCount++;
    });
    s.set(42); // same value
    expect(callCount).toBe(0);
  });

  it("does NOT notify when functional update returns same value", () => {
    const s = signal(42);
    let callCount = 0;
    s.subscribe(() => {
      callCount++;
    });
    s.set((v) => v); // identity — same value
    expect(callCount).toBe(0);
  });

  it("unsubscribe stops notifications", () => {
    const s = signal(0);
    let callCount = 0;
    const unsub = s.subscribe(() => {
      callCount++;
    });
    s.set(1);
    expect(callCount).toBe(1);
    unsub();
    s.set(2);
    expect(callCount).toBe(1); // still 1, not notified
  });

  it("supports multiple subscribers", () => {
    const s = signal(0);
    let a = 0;
    let b = 0;
    s.subscribe(() => { a++; });
    s.subscribe(() => { b++; });
    s.set(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("handles null and undefined values", () => {
    const s = signal<string | null>(null);
    expect(s.get()).toBe(null);
    s.set("hello");
    expect(s.get()).toBe("hello");
    s.set(null);
    expect(s.get()).toBe(null);
  });

  it("handles object values", () => {
    const s = signal({ name: "Ada" });
    expect(s.get()).toEqual({ name: "Ada" });
    const newObj = { name: "Bob" };
    s.set(newObj);
    expect(s.get()).toBe(newObj);
  });
});

describe("computed", () => {
  it("derives value from source signals", () => {
    const a = signal(2);
    const b = signal(3);
    const sum = computed([a, b], ([x, y]) => (x as number) + (y as number));
    expect(sum.get()).toBe(5);
  });

  it("recomputes when a source changes", () => {
    const a = signal(2);
    const b = signal(3);
    const sum = computed([a, b], ([x, y]) => (x as number) + (y as number));
    a.set(10);
    expect(sum.get()).toBe(13);
  });

  it("notifies subscribers when derived value changes", () => {
    const count = signal(0);
    const doubled = computed([count], ([c]) => (c as number) * 2);
    let notified = false;
    doubled.subscribe(() => {
      notified = true;
    });
    count.set(5);
    expect(notified).toBe(true);
    expect(doubled.get()).toBe(10);
  });

  it("does NOT notify when derived value is unchanged", () => {
    const a = signal(3);
    const isPositive = computed([a], ([v]) => (v as number) > 0);
    expect(isPositive.get()).toBe(true);
    let callCount = 0;
    isPositive.subscribe(() => {
      callCount++;
    });
    a.set(5); // still positive → derived value stays `true`
    expect(callCount).toBe(0);
  });

  it("getSnapshot returns current derived value", () => {
    const s = signal("hello");
    const upper = computed([s], ([v]) => (v as string).toUpperCase());
    expect(upper.getSnapshot()).toBe("HELLO");
  });

  it("supports single source signal", () => {
    const name = signal("Ada");
    const greeting = computed([name], ([n]) => `Hello, ${n as string}!`);
    expect(greeting.get()).toBe("Hello, Ada!");
    name.set("Bob");
    expect(greeting.get()).toBe("Hello, Bob!");
  });

  it("does not expose set method", () => {
    const s = signal(1);
    const c = computed([s], ([v]) => v);
    expect("set" in c).toBe(false);
  });
});
