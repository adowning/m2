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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
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
    paytable: jsonb("paytable"), // complex data like payouts
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
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    operatorId: uuid("operator_id")
      .references(() => operators.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type").notNull(), // 'deposit' or 'withdrawal'
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    status: transactionStatus("status").default("pending").notNull(),
    paymentMethod: text("payment_method"), // e.g., 'cashapp', 'in_store_cash'
    externalId: text("external_id"), // for webhook matching
    notes: text("notes"), // rejection reason, etc.
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("transactions_user_id_idx").on(table.userId),
    operatorIdIdx: index("transactions_operator_id_idx").on(table.operatorId),
    statusIdx: index("transactions_status_idx").on(table.status),
    externalIdIdx: index("transactions_external_id_idx").on(table.externalId),
  })
);

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

// Relations
export const operatorsRelations = relations(operators, ({ many }) => ({
  wallets: many(wallets),
  transactions: many(transactions),
  betLogs: many(betLogs),
  bonusTasks: many(bonusTasks),
  jackpots: many(jackpots),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  wallets: many(wallets),
  transactions: many(transactions),
  betLogs: many(betLogs),
  bonusTasks: many(bonusTasks),
  jackpots: many(jackpots),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const gameCategoriesRelations = relations(
  gameCategories,
  ({ many }) => ({
    games: many(games),
  })
);

export const gamesRelations = relations(games, ({ one, many }) => ({
  category: one(gameCategories, {
    fields: [games.categoryId],
    references: [gameCategories.id],
  }),
  betLogs: many(betLogs),
  jackpots: many(jackpots),
}));

export const walletsRelations = relations(wallets, ({ one }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
  operator: one(operators, {
    fields: [wallets.operatorId],
    references: [operators.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  operator: one(operators, {
    fields: [transactions.operatorId],
    references: [operators.id],
  }),
}));

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
