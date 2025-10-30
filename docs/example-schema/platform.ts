import {
  createSelectSchema,
  createUpdateSchema,
  createInsertSchema,
} from "drizzle-zod";
import type { z } from "zod";
import { pgTable, serial, integer } from "drizzle-orm/pg-core";

export const platformSettingTable = pgTable("platform_settings", {
  id: serial("id").primaryKey().notNull(),
  depositWrMultiplier: integer("deposit_wr_multiplier").default(1).notNull(),
  bonusWrMultiplier: integer("bonus_wr_multiplier").default(30).notNull(),
  freeSpinWrMultiplier: integer("free_spin_wr_multiplier")
    .default(30)
    .notNull(),
  avgFreeSpinValue: integer("avg_free_spin_win_value").default(15).notNull(),
});

export const PlatformSettingSelectSchema =
  createSelectSchema(platformSettingTable);
export const PlatformSettingInsertSchema =
  createInsertSchema(platformSettingTable);
export const PlatformSettingUpdateSchema =
  createUpdateSchema(platformSettingTable);
export type PlatformSetting = z.infer<typeof PlatformSettingSelectSchema>;
export type PlatformSettingInsert = typeof platformSettingTable.$inferInsert;
export type PlatformSettingSelect = typeof platformSettingTable.$inferSelect &
  PlatformSetting;
