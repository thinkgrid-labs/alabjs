import { defineServerFn } from "alabjs/server";
import type { User } from "../page.server";

// In-memory store — for demonstration only.
// ⚠️  Do NOT use this pattern in production:
//   • State is lost on every server restart.
//   • Multiple server instances (horizontal scaling) will diverge immediately.
//   • Concurrent toggleUserStatus calls can interleave without locking,
//     producing inconsistent state under load.
// Replace with a database (e.g. Postgres via Drizzle, Prisma, or raw sql).
const USERS: Record<string, User> = {
  "1": { id: "1", name: "Maria Santos",   email: "maria@example.com",  role: "admin",  status: "active"   },
  "2": { id: "2", name: "Juan Dela Cruz",  email: "juan@example.com",   role: "member", status: "active"   },
  "3": { id: "3", name: "Ana Reyes",       email: "ana@example.com",    role: "member", status: "inactive" },
  "4": { id: "4", name: "Carlo Mendoza",   email: "carlo@example.com",  role: "member", status: "active"   },
  "5": { id: "5", name: "Lea Garcia",      email: "lea@example.com",    role: "admin",  status: "active"   },
};

export const getUser = defineServerFn(async (_ctx, { id }: { id: string }) => {
  const user = USERS[id];
  if (!user) throw new Error(`User not found: ${id}`);
  return user;
});

export const toggleUserStatus = defineServerFn(async (_ctx, { id }: { id: string }) => {
  const user = USERS[id];
  if (!user) throw new Error(`User not found: ${id}`);
  USERS[id] = { ...user, status: user.status === "active" ? "inactive" : "active" };
  return USERS[id];
});
