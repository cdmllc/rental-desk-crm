import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const crmState = sqliteTable("crm_state", {
  workspaceId: text("workspace_id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
