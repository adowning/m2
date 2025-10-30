import { timestampColumns } from "./custom-types";
import {
  createSelectSchema,
  createUpdateSchema,
  createInsertSchema,
} from "drizzle-zod";
import type { z } from "zod";
import {
  pgTable,
  text,
  integer,
  real,
  uuid,
  jsonb,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { jackpotGroupEnum } from "./enums";
import { userTable } from "./user";
import { customTimestamp } from "./custom";

type JackpotContribution = {
  wagerAmount: number;
  contributionAmount: number;
  winAmount: number | 0;
  betTransactionId: string;
  jackpotId: string;
  createdAt: Date;
  operatorId: string;
};

type JackpotWin = {
  userId: string;
  gameId: string;
  amountWon: number;
  winningSpinTransactionId: string;
  timeStampOfWin: Date;
  numberOfJackpotWinsForUserBefore: number;
  numberOfJackpotWinsForUserAfter: number;
  operatorId: string;
  userCreateDate: Date;
  videoClipLocation: string;
};

export const jackpotTable = pgTable("jackpots", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  group: jackpotGroupEnum("group").notNull(),
  currentAmount: integer("current_amount").notNull(),
  seedAmount: integer("seed_amount").notNull(),
  maxAmount: integer("max_amount"),
  contributionRate: real("contribution_rate").notNull(),
  minBet: integer("min_bet"),
  lastWonAmount: integer("last_won_amount"),
  lastWonAt: customTimestamp("last_won_at", { precision: 3 }),
  lastWonByUserId: uuid("last_won_by_user_id").references(() => userTable.id),
  totalContributions: integer("total_contributions").default(0),
  totalWins: integer("total_wins").default(0),
  winHistory: jsonb("jackpot_wins").$type<JackpotWin[]>().notNull().default([]),
  contributionHistory: jsonb("contribution_history")
    .$type<JackpotContribution[]>()
    .default([])
    .notNull(),
  createdAt: timestampColumns.createdAt,
  updatedAt: timestampColumns.updatedAt,
});
// export const jackpotsGroupIdx = uniqueIndex("jackpots_group_idx").on(
//   jackpotTable.group
// );
// export const jackpotsGroupUnique = unique("jackpots_group_unique").on(
//   jackpotTable.group
// );

export const JackpotSelectSchema = createSelectSchema(jackpotTable);
export const JackpotInsertSchema = createInsertSchema(jackpotTable);
export const JackpotUpdateSchema = createUpdateSchema(jackpotTable);
export type Jackpot = z.infer<typeof JackpotSelectSchema>;
// curl -X POST "https://crqbazcsrncvbnapuxcp.supabase.co/auth/v1/admin/users" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNycWJhemNzcm5jdmJuYXB1eGNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTMwOTUwNiwiZXhwIjoyMDc2ODg1NTA2fQ.JbZGZYDlQRebFS1hdaz5wzJo7-TLOSAWu3uwXOQCrkU" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNycWJhemNzcm5jdmJuYXB1eGNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTMwOTUwNiwiZXhwIjoyMDc2ODg1NTA2fQ.JbZGZYDlQRebFS1hdaz5wzJo7-TLOSAWu3uwXOQCrkU" -H "Content-Type: application/json" -d '{"email":"asdf@asdf.com","password":"asdfasdf","user_metadata":{"username":"asdf"}}'
