import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const crmState = sqliteTable("crm_state", {
  workspaceId: text("workspace_id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const crmUsers = sqliteTable("crm_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["admin", "agent"] }).notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: integer("must_change_password").notNull().default(1),
  active: integer("active").notNull().default(1),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: integer("locked_until").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const crmSessions = sqliteTable("crm_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => crmUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});
