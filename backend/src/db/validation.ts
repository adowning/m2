import { z } from "zod";

// Re-export schemas from schema.ts for input validation
export {
  operators,
  users,
  sessions,
  gameCategories,
  games,
  wallets,
  transactions,
  betLogs,
  vipLevels,
  bonusTasks,
  jackpotPools,
  jackpots,
} from "./schema";

// Zod schemas for input validation

// Operators
export const CreateOperatorSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export const UpdateOperatorSchema = CreateOperatorSchema.partial();

// Users
export const CreateUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be less than 50 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const UpdateUserSchema = CreateUserSchema.omit({
  password: true,
}).partial();

export const LoginUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

// Sessions
export const CreateSessionSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  sessionToken: z.string().min(1, "Session token is required"),
  expiresAt: z.date(),
});

// Game Categories
export const CreateGameCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export const UpdateGameCategorySchema = CreateGameCategorySchema.partial();

// Games
export const CreateGameSchema = z.object({
  name: z.string().min(1, "Name is required"),
  categoryId: z.string().uuid("Invalid category ID").nullable(),
  provider: z.string().min(1, "Provider is required"),
  rtp: z.number().min(0).max(100, "RTP must be between 0 and 100"),
  jackpotGroup: z.string().nullable(),
  minBet: z.number().min(0, "Min bet must be positive"),
  maxBet: z.number().min(0, "Max bet must be positive"),
  paytable: z.unknown(), // JSONB, strict typing later
});

export const UpdateGameSchema = CreateGameSchema.partial();

// Wallets
export const CreateWalletSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  operatorId: z.string().uuid("Invalid operator ID"),
  realBalance: z
    .number()
    .min(0, "Real balance must be non-negative")
    .optional()
    .default(0),
  bonusBalance: z
    .number()
    .min(0, "Bonus balance must be non-negative")
    .optional()
    .default(0),
});

export const UpdateWalletSchema = z.object({
  realBalance: z
    .number()
    .min(0, "Real balance must be non-negative")
    .optional(),
  bonusBalance: z
    .number()
    .min(0, "Bonus balance must be non-negative")
    .optional(),
});

// Transactions
export const CreateTransactionSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  operatorId: z.string().uuid("Invalid operator ID"),
  type: z.enum(["deposit", "withdrawal"], {
    errorMap: () => ({ message: "Type must be deposit or withdrawal" }),
  }),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  paymentMethod: z.string().optional(),
  externalId: z.string().optional(),
  notes: z.string().optional(),
});

export const UpdateTransactionStatusSchema = z.object({
  status: z.enum(["pending", "completed", "rejected", "processing"], {
    errorMap: () => ({ message: "Invalid status" }),
  }),
  notes: z.string().optional(),
});

// Bet Logs
export const CreateBetLogSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  operatorId: z.string().uuid("Invalid operator ID"),
  gameId: z.string().uuid("Invalid game ID"),
  wager: z.number().min(0.01, "Wager must be greater than 0"),
  win: z.number().min(0, "Win must be non-negative").optional().default(0),
  betType: z.enum(["real", "bonus"], {
    errorMap: () => ({ message: "Bet type must be real or bonus" }),
  }),
  preRealBalance: z.number().min(0, "Pre real balance must be non-negative"),
  postRealBalance: z.number().min(0, "Post real balance must be non-negative"),
  preBonusBalance: z.number().min(0, "Pre bonus balance must be non-negative"),
  postBonusBalance: z
    .number()
    .min(0, "Post bonus balance must be non-negative"),
  jackpotContribution: z
    .number()
    .min(0, "Jackpot contribution must be non-negative")
    .optional()
    .default(0),
  vipPointsAdded: z
    .number()
    .min(0, "VIP points added must be non-negative")
    .optional()
    .default(0),
  wageringProgress: z.unknown().optional(), // JSONB
  ggrContribution: z.number(),
});

// VIP Levels
export const CreateVipLevelSchema = z.object({
  level: z.number().int().min(1, "Level must be positive integer"),
  name: z.string().min(1, "Name is required"),
  minExperience: z.number().min(0, "Min experience must be non-negative"),
  cashbackRate: z
    .number()
    .min(0)
    .max(100, "Cashback rate must be between 0 and 100")
    .optional()
    .default(0),
  freeSpinsPerMonth: z
    .number()
    .int()
    .min(0, "Free spins per month must be non-negative")
    .optional()
    .default(0),
  benefits: z.unknown().optional(), // JSONB
});

export const UpdateVipLevelSchema = CreateVipLevelSchema.partial();

// Bonus Tasks
export const CreateBonusTaskSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  operatorId: z.string().uuid("Invalid operator ID"),
  type: z.enum(["deposit", "bonus"], {
    errorMap: () => ({ message: "Type must be deposit or bonus" }),
  }),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  wageringMultiplier: z
    .number()
    .min(0.1, "Wagering multiplier must be at least 0.1")
    .optional()
    .default(1),
  wagered: z
    .number()
    .min(0, "Wagered must be non-negative")
    .optional()
    .default(0),
  isCompleted: z.boolean().optional().default(false),
});

export const UpdateBonusTaskSchema = z.object({
  wagered: z.number().min(0, "Wagered must be non-negative").optional(),
  isCompleted: z.boolean().optional(),
});

// Jackpot Pools
export const CreateJackpotPoolSchema = z.object({
  group: z.string().min(1, "Group is required"),
  level: z.enum(["mini", "minor", "major", "grand"], {
    errorMap: () => ({ message: "Invalid level" }),
  }),
  currentValue: z
    .number()
    .min(0, "Current value must be non-negative")
    .optional()
    .default(0),
  seedValue: z.number().min(0, "Seed value must be non-negative"),
  contributionRate: z
    .number()
    .min(0)
    .max(1, "Contribution rate must be between 0 and 1"),
  isActive: z.boolean().optional().default(true),
});

export const UpdateJackpotPoolSchema = CreateJackpotPoolSchema.omit({
  group: true,
  level: true,
}).partial();

// Jackpots
export const CreateJackpotSchema = z.object({
  poolId: z.string().uuid("Invalid pool ID"),
  userId: z.string().uuid("Invalid user ID").nullable(),
  operatorId: z.string().uuid("Invalid operator ID").nullable(),
  gameId: z.string().uuid("Invalid game ID").nullable(),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
});

// Additional schemas for betting flow
export const PlaceBetSchema = z.object({
  gameId: z.string().uuid("Invalid game ID"),
  wager: z.number().min(0.01, "Wager must be greater than 0"),
});

export const DepositSchema = z.object({
  operatorId: z.string().uuid("Invalid operator ID"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  paymentMethod: z.string().min(1, "Payment method is required"),
});

export const WithdrawalSchema = z.object({
  operatorId: z.string().uuid("Invalid operator ID"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  paymentMethod: z.string().min(1, "Payment method is required"),
});
