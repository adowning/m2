import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
  pgEnum,
  jsonb,
  index,
  integer,
  real,
} from "drizzle-orm/pg-core";

import { relations } from "drizzle-orm";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import type z from "zod";

// Enums

export const bonusStatusEnum = pgEnum("bonus_status_enum", [
  "PENDING",
  "ACTIVE",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
]);
export const affiliateStatusEnum = pgEnum("affliate_status_enum", [
  "PAID",
  "NEEDS_REVIEWED",
  "PASSED_REVIEW",
  "FAILED_REVIEW",
]);
export const bonusTypeEnum = pgEnum("bonus_type_enum", [
  "DEPOSIT_MATCH",
  "FREE_SPINS",
  "CASHBACK",
  "LEVEL_UP",
  "MANUAL",
]);
export const gameCategoriesEnum = pgEnum("game_categories_enum", [
  "SLOTS",
  "FISH",
  "TABLE",
  "LIVE",
  "OTHER",
]);
export const gameStatusEnum = pgEnum("game_status_enum", [
  "ACTIVE",
  "INACTIVE",
  "MAINTENANCE",
]);
export const jackpotGroupEnum = pgEnum("jackpot_group_enum", [
  "minor",
  "major",
  "mega",
]);
export const userRoleEnum = pgEnum("user_role_enum", [
  "USER",
  "AFFILIATE",
  "ADMIN",
  "OPERATOR",
]);

export const sessionStatusEnum = pgEnum("session_status_enum", [
  "ACTIVE",
  "COMPLETED",
  "EXPIRED",
  "ABANDONED",
  "TIMEOUT",
  "OTP_PENDING",
]);
export const transactionStatusEnum = pgEnum("transaction_status_enum", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
]);
export const transactionTypeEnum = pgEnum("transaction_type_enum", [
  "DEPOSIT",
  "WITHDRAWAL",
  "BET",
  "WIN",
  "BONUS_AWARD",
  "BONUS_WAGER",
  "BONUS_CONVERT",
  "ADJUSTMENT",
  "CASHBACK",
  "AFFILIATE_PAYOUT",
  "BONUS",
]);
export const jackpotTypeEnum = pgEnum("type_of_jackpot_enum", [
  "MINOR",
  "MAJOR",
  "GRAND",
]);
export const userStatusEnum = pgEnum("user_status_enum", [
  "ACTIVE",
  "INACTIVE",
  "BANNED",
  "PENDING",
]);

export const equalityOperatorEnum = pgEnum("equality_op", [
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "in",
]);

export const transactionStatus = pgEnum("transaction_status", [
  "pending",
  "completed",
  "rejected",
  "processing",
]);
export const betType = pgEnum("bet_type", ["real", "bonus"]);
export const jackpotLevel = pgEnum("jackpot_level", [
  "mini",
  "minor",
  "major",
  "grand",
]);

import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

const customTimestamp = customType<{
  data: Date; // The type in your application code
  driverData: string; // The type in the database driver
  config: { precision: number | undefined };
  zodType: z.ZodDate; // Updated from 'zod' to 'zodType' for drizzle-zod
}>({
  dataType() {
    const precision = 3;
    return precision
      ? `timestamp(${precision}) with time zone`
      : "timestamp with time zone";
  },

  toDriver(value: Date): string {
    return value.toISOString();
  },

  fromDriver(value: string): Date {
    return new Date(value);
  },
});

export const timestampColumns = {
  createdAt: customTimestamp("created_at", { precision: 3 })
    .default(sql`now()`)
    .notNull(),
  updatedAt: customTimestamp("updated_at", { precision: 3 }),
};

// You'll also need to decide on a standard for nullable/mode-specific timestamps
export const expiresAtTimestamp = customTimestamp("expires_at", {
  precision: 3,
});

// Operators table (central casino brands)
export const operators = pgTable(
  "operators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: index("operators_name_idx").on(table.name),
  })
);

// Users table (players, linked to operators, global VIP experience)
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    role: userRoleEnum("role").notNull(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    vipExperience: numeric("vip_experience", { precision: 15, scale: 2 })
      .default("0")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
    usernameIdx: index("users_username_idx").on(table.username),
    vipExperienceIdx: index("users_vip_experience_idx").on(table.vipExperience),
  })
);
export const UserSelectSchema = createSelectSchema(users);
export const UserInsertSchema = createInsertSchema(users);
export const UserUpdateSchema = createUpdateSchema(users);
export type User = z.infer<typeof UserSelectSchema>;
export type UserInsert = typeof users.$inferInsert;
export type UserSelect = typeof users.$inferSelect & User;
// Sessions table (for auth)
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sessionToken: text("session_token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("sessions_user_id_idx").on(table.userId),
    sessionTokenIdx: index("sessions_session_token_idx").on(table.sessionToken),
  })
);

// Game categories table
export const gameCategories = pgTable("game_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Games table (with category, RTP, provider, jackpot group)
export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    categoryId: uuid("category_id").references(() => gameCategories.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    rtp: numeric("rtp", { precision: 5, scale: 2 }).notNull(), // e.g., 96.50
    jackpotGroup: text("jackpot_group"), // nullable for games not in jackpot
    minBet: numeric("min_bet", { precision: 10, scale: 2 }).notNull(),
    maxBet: numeric("max_bet", { precision: 10, scale: 2 }).notNull(),
    paytable: jsonb("paytable").$type<Record<string, number>[]>(), // complex data like payouts
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: index("games_name_idx").on(table.name),
    categoryIdIdx: index("games_category_id_idx").on(table.categoryId),
    jackpotGroupIdx: index("games_jackpot_group_idx").on(table.jackpotGroup),
  })
);

// Wallets table (per user-operator, real/bonus balances)
export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    operatorId: uuid("operator_id")
      .references(() => operators.id, { onDelete: "cascade" })
      .notNull(),
    realBalance: numeric("real_balance", { precision: 15, scale: 2 })
      .default("0")
      .notNull(),
    bonusBalance: numeric("bonus_balance", { precision: 15, scale: 2 })
      .default("0")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userOperatorIdx: index("wallets_user_operator_idx").on(
      table.userId,
      table.operatorId
    ),
    realBalanceIdx: index("wallets_real_balance_idx").on(table.realBalance),
    bonusBalanceIdx: index("wallets_bonus_balance_idx").on(table.bonusBalance),
  })
);

// Transactions table (deposits/withdrawals, with status)
export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  operatorId: uuid("operator_id")
    .references(() => operators.id, { onDelete: "cascade" })
    .notNull(),
  type: pgEnum("type", ["deposit", "withdrawal"]), // 'deposit' or 'withdrawal'
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  status: transactionStatus("status").default("pending").notNull(),
  paymentMethod: text("payment_method"), // e.g., 'cashapp', 'in_store_cash'
  externalId: text("external_id"), // for webhook matching
  notes: text("notes"), // rejection reason, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Bet logs table (comprehensive betting history)
export const betLogs = pgTable(
  "bet_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    operatorId: uuid("operator_id")
      .references(() => operators.id, { onDelete: "cascade" })
      .notNull(),
    gameId: uuid("game_id")
      .references(() => games.id, { onDelete: "set null" })
      .notNull(),
    wager: numeric("wager", { precision: 15, scale: 2 }).notNull(),
    win: numeric("win", { precision: 15, scale: 2 }).default("0").notNull(),
    betType: betType("bet_type").notNull(),
    preRealBalance: numeric("pre_real_balance", {
      precision: 15,
      scale: 2,
    }).notNull(),
    postRealBalance: numeric("post_real_balance", {
      precision: 15,
      scale: 2,
    }).notNull(),
    preBonusBalance: numeric("pre_bonus_balance", {
      precision: 15,
      scale: 2,
    }).notNull(),
    postBonusBalance: numeric("post_bonus_balance", {
      precision: 15,
      scale: 2,
    }).notNull(),
    jackpotContribution: numeric("jackpot_contribution", {
      precision: 15,
      scale: 2,
    })
      .default("0")
      .notNull(),
    vipPointsAdded: numeric("vip_points_added", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    wageringProgress: jsonb("wagering_progress"), // updates to bonus/deposit tasks
    ggrContribution: numeric("ggr_contribution", {
      precision: 15,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("bet_logs_user_id_idx").on(table.userId),
    operatorIdIdx: index("bet_logs_operator_id_idx").on(table.operatorId),
    gameIdIdx: index("bet_logs_game_id_idx").on(table.gameId),
    createdAtIdx: index("bet_logs_created_at_idx").on(table.createdAt),
    betTypeIdx: index("bet_logs_bet_type_idx").on(table.betType),
  })
);

// VIP levels table (thresholds, benefits like cashback rate, free spins)
export const vipLevels = pgTable(
  "vip_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    level: numeric("level", { precision: 3 }).notNull().unique(),
    name: text("name").notNull(),
    minExperience: numeric("min_experience", {
      precision: 15,
      scale: 2,
    }).notNull(),
    cashbackRate: numeric("cashback_rate", { precision: 5, scale: 2 })
      .default("0")
      .notNull(), // e.g., 5.00 for 5%
    freeSpinsPerMonth: numeric("free_spins_per_month", { precision: 5 })
      .default("0")
      .notNull(),
    benefits: jsonb("benefits"), // additional benefits as JSON
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    levelIdx: index("vip_levels_level_idx").on(table.level),
    minExperienceIdx: index("vip_levels_min_experience_idx").on(
      table.minExperience
    ),
  })
);

// Bonus tasks table (active bonus wagering requirements)
export const bonusTasks = pgTable(
  "bonus_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    operatorId: uuid("operator_id")
      .references(() => operators.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type").notNull(), // 'deposit' or 'bonus'
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    wageringMultiplier: numeric("wagering_multiplier", {
      precision: 5,
      scale: 2,
    })
      .default("1")
      .notNull(), // e.g., 20 for 20x
    wagered: numeric("wagered", { precision: 15, scale: 2 })
      .default("0")
      .notNull(),
    isCompleted: boolean("is_completed").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userOperatorIdx: index("bonus_tasks_user_operator_idx").on(
      table.userId,
      table.operatorId
    ),
    typeIdx: index("bonus_tasks_type_idx").on(table.type),
    isCompletedIdx: index("bonus_tasks_is_completed_idx").on(table.isCompleted),
  })
);

// Jackpot pools table (shared across platform, configurable contribution rates)
export const jackpotPools = pgTable(
  "jackpot_pools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    group: text("group").notNull(), // e.g., 'slots_main'
    level: jackpotLevel("level").notNull(),
    currentValue: numeric("current_value", { precision: 20, scale: 2 })
      .default("0")
      .notNull(),
    seedValue: numeric("seed_value", { precision: 20, scale: 2 }).notNull(),
    contributionRate: numeric("contribution_rate", {
      precision: 5,
      scale: 4,
    }).notNull(), // e.g., 0.0200 for 2%
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    groupLevelIdx: index("jackpot_pools_group_level_idx").on(
      table.group,
      table.level
    ),
    currentValueIdx: index("jackpot_pools_current_value_idx").on(
      table.currentValue
    ),
  })
);

// Jackpots table (individual jackpot wins history)
export const jackpots = pgTable(
  "jackpots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poolId: uuid("pool_id")
      .references(() => jackpotPools.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    operatorId: uuid("operator_id").references(() => operators.id, {
      onDelete: "set null",
    }),
    gameId: uuid("game_id").references(() => games.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    poolIdIdx: index("jackpots_pool_id_idx").on(table.poolId),
    userIdIdx: index("jackpots_user_id_idx").on(table.userId),
    createdAtIdx: index("jackpots_created_at_idx").on(table.createdAt),
  })
);
export const transactionLogTable = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    createdAt: timestampColumns.createdAt,
    updatedAt: timestampColumns.updatedAt,
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    relatedId: uuid("related_id"),
    sessionId: uuid("session_id"),
    tnxId: uuid("tnx_id"),
    type: transactionTypeEnum("type").notNull(),
    typeDescription: text("type_description"),
    status: transactionStatusEnum("status").default("COMPLETED").notNull(),
    wagerAmount: integer("wager_amount"),
    realBalanceBefore: integer("real_balance_before").notNull(),
    realBalanceAfter: integer("real_balance_after").notNull(),
    bonusBalanceBefore: integer("bonus_balance_before").notNull(),
    bonusBalanceAfter: integer("bonus_balance_after").notNull(),
    gameId: uuid("game_id").references(() => games.id),
    gameName: text("game_name"),
    provider: text("provider"),
    category: text("category"),
    operatorId: uuid("operator_id").references(() => operators.id),
    ggrContribution: integer("ggr_contribution"),
    jackpotContribution: integer("jackpot_contribution"),
    vipPointsAdded: integer("vip_points_added"),
    processingTime: integer("processing_time"),
    metadata: jsonb("metadata"),
    affiliateId: uuid("affiliate_id"),
    path: text("path").array(),
    updatedBy: text("updated_by").default("system").notNull(),
    version: integer("version").default(1).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (t) => [
    index("transaction_log_user_id_index").on(t.userId),
    index("transaction_log_type_index").on(t.type),
    index("transaction_log_status_index").on(t.status),
    index("transaction_log_game_id_index").on(t.gameId),
  ]
);

export const TransactionLogSelectSchema =
  createSelectSchema(transactionLogTable);
export const TransactionLogInsertSchema =
  createInsertSchema(transactionLogTable);
export const TransactionLogUpdateSchema =
  createUpdateSchema(transactionLogTable);
export type TransactionLog = z.infer<typeof TransactionLogSelectSchema>;

export const depositTable = pgTable(
  "deposits",
  {
    id: uuid("id").primaryKey().notNull(),
    createdAt: timestampColumns.createdAt,
    updatedAt: timestampColumns.updatedAt,
    version: integer("version").default(1).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => operators.id),
    transactionId: uuid("transaction_id").references(
      () => transactionLogTable.id
    ),
    amount: integer("amount").notNull(),
    status: transactionStatusEnum("status").default("PENDING").notNull(),
    paymentMethod: text("payment_method"),
    referenceId: uuid("reference_id"),
    note: text("note"),
    metadata: jsonb("metadata"),
    bonusAmount: integer("bonus_amount").notNull(),
  },

  (t) => [
    index("deposit_user_id_index").on(t.userId),
    index("deposit_referenceId_index").on(t.referenceId),
    index("deposit_status_index").on(t.status),
    index("deposit_transactionId_id_index").on(t.transactionId),
  ]
);

export const DepositSelectSchema = createSelectSchema(depositTable);
export const DepositInsertSchema = createInsertSchema(depositTable);
export const DepositUpdateSchema = createUpdateSchema(depositTable);
export type Deposit = z.infer<typeof DepositSelectSchema>;

export const withdrawalTable = pgTable(
  "withdrawals",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    createdAt: timestampColumns.createdAt,
    updatedAt: timestampColumns.updatedAt,
    updatedBy: text("updated_by").default("system").notNull(),
    version: integer("version").default(1).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => operators.id),
    transactionId: uuid("transaction_id").references(
      () => transactionLogTable.id
    ),
    amount: integer("amount").notNull(),
    status: transactionStatusEnum("status").default("PENDING").notNull(),
    payoutMethod: text("payout_method"),
    note: text("note"),
    metadata: jsonb("metadata"),
  },

  (t) => [
    index("withdrawal_user_id_index").on(t.userId),
    index("withdrawal_status_index").on(t.status),
    index("withdrawal_transactionId_id_index").on(t.transactionId),
  ]
);

export const WithdrawalSelectSchema = createSelectSchema(withdrawalTable);
export const WithdrawalInsertSchema = createInsertSchema(withdrawalTable);
export const WithdrawalUpdateSchema = createUpdateSchema(withdrawalTable);
export type Withdrawal = z.infer<typeof WithdrawalSelectSchema>;

export const affiliatePayoutTable = pgTable("affiliate_payouts", {
  id: uuid("id").primaryKey().notNull(),
  createdAt: timestampColumns.createdAt,
  updatedAt: timestampColumns.updatedAt,
  updatedBy: text("updated_by").default("system").notNull(),
  version: integer("version").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  affiliateId: uuid("affiliate_id")
    .notNull()
    .references(() => users.id),
  weekStart: customTimestamp("week_start", {
    precision: 3,
  }).notNull(),
  weekEnd: customTimestamp("week_end", {
    precision: 3,
  }).notNull(),
  totalGgr: integer("total_ggr").notNull(),
  commissionRate: real("commission_rate").notNull(),
  commissionAmount: integer("commission_amount").notNull(),
  status: affiliateStatusEnum("status").default("NEEDS_REVIEWED"),
  transactionId: uuid("transaction_id"),
  paidAt: customTimestamp("paid_at", { precision: 3 }),
});

// export const affiliatePayoutsWeekIdx = index("affiliate_payouts_week_idx").on(
//   affiliatePayoutTable.affiliateId,
//   affiliatePayoutTable.weekStart
// );
// export const affiliatePayoutsStatusIdx = index(
//   "affiliate_payouts_status_idx"
// ).on(affiliatePayoutTable.status);

export const AffiliatePayoutSelectSchema =
  createSelectSchema(affiliatePayoutTable);
export const AffiliatePayoutInsertSchema =
  createInsertSchema(affiliatePayoutTable);
export const AffiliatePayoutUpdateSchema =
  createUpdateSchema(affiliatePayoutTable);
export type AffiliatePayout = z.infer<typeof AffiliatePayoutSelectSchema>;

export const commissionTable = pgTable("commissions", {
  id: uuid("id").primaryKey().notNull(),
  createdAt: timestampColumns.createdAt,
  updatedAt: timestampColumns.updatedAt,
  version: integer("version").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  level: integer("level").notNull(),
  name: text("name").notNull(),
  rate: real("rate").notNull(),
});

// export const commissionsLevelIdx = uniqueIndex("commissions_level_idx").on(
//   commissionTable.level
// );
// export const commissionsLevelUnique = unique("commissions_level_unique").on(
//   commissionTable.level
// );

export const CommissionSelectSchema = createSelectSchema(commissionTable);
export const CommissionInsertSchema = createInsertSchema(commissionTable);
export const CommissionUpdateSchema = createUpdateSchema(commissionTable);
export type Commission = z.infer<typeof CommissionSelectSchema>;

export const betLogsRelations = relations(betLogs, ({ one }) => ({
  user: one(users, {
    fields: [betLogs.userId],
    references: [users.id],
  }),
  operator: one(operators, {
    fields: [betLogs.operatorId],
    references: [operators.id],
  }),
  game: one(games, {
    fields: [betLogs.gameId],
    references: [games.id],
  }),
}));

export const vipLevelsRelations = relations(vipLevels, ({}) => ({}));

export const bonusTasksRelations = relations(bonusTasks, ({ one }) => ({
  user: one(users, {
    fields: [bonusTasks.userId],
    references: [bonusTasks.userId],
  }),
  operator: one(operators, {
    fields: [bonusTasks.operatorId],
    references: [operators.id],
  }),
}));

export const jackpotPoolsRelations = relations(jackpotPools, ({ many }) => ({
  jackpots: many(jackpots),
}));

export const jackpotsRelations = relations(jackpots, ({ one }) => ({
  pool: one(jackpotPools, {
    fields: [jackpots.poolId],
    references: [jackpotPools.id],
  }),
  user: one(users, {
    fields: [jackpots.userId],
    references: [users.id],
  }),
  operator: one(operators, {
    fields: [jackpots.operatorId],
    references: [operators.id],
  }),
  game: one(games, {
    fields: [jackpots.gameId],
    references: [games.id],
  }),
}));

export const GameSelectSchema = createSelectSchema(games);
export const GameInsertSchema = createInsertSchema(games);
export const GameUpdateSchema = createUpdateSchema(games);
export type Game = z.infer<typeof GameSelectSchema>;

export const GameCategorySelectSchema = createSelectSchema(gameCategories);
export const GameCategoryInsertSchema = createInsertSchema(gameCategories);
export const GameCategoryUpdateSchema = createUpdateSchema(gameCategories);
export type GameCategory = z.infer<typeof GameCategorySelectSchema>;

export const OperatorSelectSchema = createSelectSchema(operators);
export const OperatorInsertSchema = createInsertSchema(operators);
export const OperatorUpdateSchema = createUpdateSchema(operators);
export type Operator = z.infer<typeof OperatorSelectSchema>;
