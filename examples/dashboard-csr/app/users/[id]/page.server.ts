import { defineServerFn } from "alab/server";
import type { User } from "../page.server";

const USERS: Record<string, User> = {
  "1": { id: "1", name: "Maria Santos",   email: "maria@example.com",  role: "admin",  status: "active"   },
  "2": { id: "2", name: "Juan Dela Cruz",  email: "juan@example.com",   role: "member", status: "active"   },
  "3": { id: "3", name: "Ana Reyes",       email: "ana@example.com",    role: "member", status: "inactive" },
  "4": { id: "4", name: "Carlo Mendoza",   email: "carlo@example.com",  role: "member", status: "active"   },
  "5": { id: "5", name: "Lea Garcia",      email: "lea@example.com",    role: "admin",  status: "active"   },
};

export const getUser = defineServerFn(async ({ params }) => {
  const user = USERS[params["id"] ?? ""];
  if (!user) throw new Error(`User not found: ${params["id"] ?? ""}`);
  return user;
});
