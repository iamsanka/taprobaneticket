import {
  pgTable,
  serial,
  varchar,
  timestamp,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";

/* ============================
   USER ROLES ENUM
============================ */

export const userRoleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",
  "ADMIN",
  "AUDIT",
  "STAFF",
  "CUSTOMER",
]);

/* ============================
   USERS TABLE
============================ */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),

  email: varchar("email", { length: 255 })
    .notNull()
    .unique(),

  // For Google login customers, passwordHash will be NULL
  passwordHash: varchar("password_hash", { length: 255 }),

  role: userRoleEnum("role").notNull(),

  // ⭐ NEW: soft-delete flag. Deactivated users cannot log in
  // but their history (orders, audit entries) is preserved.
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),
});