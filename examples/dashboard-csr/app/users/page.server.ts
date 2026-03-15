import { defineServerFn } from "alabjs/server";

export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  status: "active" | "inactive";
};

const USERS: User[] = [
  { id: "1", name: "Maria Santos",  email: "maria@example.com",  role: "admin",  status: "active"   },
  { id: "2", name: "Juan Dela Cruz", email: "juan@example.com",  role: "member", status: "active"   },
  { id: "3", name: "Ana Reyes",     email: "ana@example.com",    role: "member", status: "inactive" },
  { id: "4", name: "Carlo Mendoza", email: "carlo@example.com",  role: "member", status: "active"   },
  { id: "5", name: "Lea Garcia",    email: "lea@example.com",    role: "admin",  status: "active"   },
];

export const getUsers = defineServerFn(async (_ctx) => USERS);
