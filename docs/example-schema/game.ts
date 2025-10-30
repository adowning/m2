import {
  createSelectSchema,
  createUpdateSchema,
  createInsertSchema,
} from "drizzle-zod";
import type { z } from "zod";
import { sql } from "drizzle-orm"; // Import sql
import {
  pgTable,
  text,
  boolean,
  integer,
  real,
  jsonb,
  uuid,
  unique,
  index,
} from "drizzle-orm/pg-core";
import {
  gameCategoriesEnum,
  gameStatusEnum,
  jackpotGroupEnum,
  sessionStatusEnum,
} from "./enums";
import { userTable } from "./user";
import { customTimestamp } from "./custom";
import { timestampColumns } from "./custom-types";

export const operatorTable = pgTable("operators", {
  id: uuid("id").primaryKey().notNull(),
  createdAt: timestampColumns.createdAt,
  updatedAt: timestampColumns.updatedAt,
  updatedBy: text("updated_by").default("system").notNull(),
  version: integer("version").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  name: text("name").notNull(),
});
export const operatorsNameUnique = unique("operators_name_unique").on(
  operatorTable.name
);

export const OperatorSelectSchema = createSelectSchema(operatorTable);
export const OperatorInsertSchema = createInsertSchema(operatorTable);
export const OperatorUpdateSchema = createUpdateSchema(operatorTable);
export type Operator = z.infer<typeof OperatorSelectSchema>;

export const gameTable = pgTable(
  "games",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    createdAt: timestampColumns.createdAt,
    updatedAt: timestampColumns.updatedAt,
    version: integer("version").default(1).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    name: text("name").notNull(),
    title: text("title"),
    description: text("description"),
    category: gameCategoriesEnum("category").default("SLOTS").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    bannerUrl: text("banner_url"),
    developer: text("developer"),
    operatorId: uuid("operator_id").references(() => operatorTable.id),
    targetRtp: real("target_rtp"),
    status: gameStatusEnum("status").default("ACTIVE").notNull(),
    minBet: integer("min_bet").default(100),
    maxBet: integer("max_bet").default(100000),
    isFeatured: boolean("is_featured").default(false),
    jackpotGroup: jackpotGroupEnum("jackpot_group"),
    goldsvetData: jsonb("goldsvet_data"),
  },
  (t) => [
    index("category_index").on(t.category),
    index("games_operator_index").on(t.operatorId),
    index("games_status_index").on(t.status),
  ]
);

export const GameSelectSchema = createSelectSchema(gameTable);
export const GameInsertSchema = createInsertSchema(gameTable);
export const GameUpdateSchema = createUpdateSchema(gameTable);
export type Game = z.infer<typeof GameSelectSchema>;
