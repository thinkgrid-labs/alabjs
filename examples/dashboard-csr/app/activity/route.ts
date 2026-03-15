import { defineSSEHandler } from "alabjs/server";

// Sample activity events — replace with real DB change feed or Redis pub/sub
const EVENTS = [
  { user: "Maria Santos",   action: "logged in",           icon: "→" },
  { user: "Juan Dela Cruz", action: "updated their profile", icon: "✎" },
  { user: "Ana Reyes",      action: "was deactivated",      icon: "✕" },
  { user: "Carlo Mendoza",  action: "changed their role to admin", icon: "★" },
  { user: "Lea Garcia",     action: "exported user data",   icon: "↓" },
];

export interface ActivityEvent {
  id: number;
  user: string;
  action: string;
  icon: string;
  ts: string;
}

export const GET = defineSSEHandler(async function* () {
  let seq = 0;

  while (true) {
    // Emit a random event every 2 seconds
    const evt = EVENTS[seq % EVENTS.length];
    const payload: ActivityEvent = {
      id: seq++,
      ...evt,
      ts: new Date().toLocaleTimeString(),
    };
    yield { event: "activity", data: payload };

    await new Promise((r) => setTimeout(r, 2000));
  }
});
