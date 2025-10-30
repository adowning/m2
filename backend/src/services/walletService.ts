import { db } from "../db/db";
import { wallets } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

const WalletOperationSchema = z.object({
  userId: z.string().uuid(),
  operatorId: z.string().uuid(),
  amount: z.number().positive(),
});

const WalletBalanceSchema = z.object({
  userId: z.string().uuid(),
  operatorId: z.string().uuid(),
});

export type WalletOperation = z.infer<typeof WalletOperationSchema>;
export type WalletBalance = z.infer<typeof WalletBalanceSchema>;

export class WalletService {
  /**
   * Get wallet balances for a user-operator pair
   */
  static async getWalletBalances(input: WalletBalance): Promise<{
    realBalance: number;
    bonusBalance: number;
  } | null> {
    const validatedInput = WalletBalanceSchema.parse(input);

    const [wallet] = await db
      .select({
        realBalance: sql<number>`${wallets.realBalance}::numeric`,
        bonusBalance: sql<number>`${wallets.bonusBalance}::numeric`,
      })
      .from(wallets)
      .where(
        and(
          eq(wallets.userId, validatedInput.userId),
          eq(wallets.operatorId, validatedInput.operatorId)
        )
      )
      .limit(1);

    return wallet || null;
  }

  /**
   * Credit amount to wallet (add to balance)
   */
  static async creditToWallet(
    input: WalletOperation & { isReal: boolean }
  ): Promise<{ realBalance: number; bonusBalance: number }> {
    const validatedInput = WalletOperationSchema.extend({
      isReal: z.boolean(),
    }).parse(input);

    const column = validatedInput.isReal
      ? wallets.realBalance
      : wallets.bonusBalance;

    const [updated] = await db
      .update(wallets)
      .set({
        [validatedInput.isReal
          ? "realBalance"
          : "bonusBalance"]: sql`${column} + ${validatedInput.amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wallets.userId, validatedInput.userId),
          eq(wallets.operatorId, validatedInput.operatorId)
        )
      )
      .returning({
        realBalance: sql<number>`${wallets.realBalance}::numeric`,
        bonusBalance: sql<number>`${wallets.bonusBalance}::numeric`,
      });

    if (!updated) {
      throw new Error("Wallet not found");
    }

    return updated;
  }

  /**
   * Debit amount from wallet (subtract from balance)
   */
  static async debitFromWallet(
    input: WalletOperation & { isReal: boolean }
  ): Promise<{ realBalance: number; bonusBalance: number }> {
    const validatedInput = WalletOperationSchema.extend({
      isReal: z.boolean(),
    }).parse(input);

    const balances = await this.getWalletBalances({
      userId: validatedInput.userId,
      operatorId: validatedInput.operatorId,
    });

    if (!balances) {
      throw new Error("Wallet not found");
    }

    const currentBalance = validatedInput.isReal
      ? balances.realBalance
      : balances.bonusBalance;

    if (currentBalance < validatedInput.amount) {
      throw new Error("Insufficient balance");
    }

    const column = validatedInput.isReal
      ? wallets.realBalance
      : wallets.bonusBalance;

    const [updated] = await db
      .update(wallets)
      .set({
        [validatedInput.isReal
          ? "realBalance"
          : "bonusBalance"]: sql`${column} - ${validatedInput.amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wallets.userId, validatedInput.userId),
          eq(wallets.operatorId, validatedInput.operatorId)
        )
      )
      .returning({
        realBalance: sql<number>`${wallets.realBalance}::numeric`,
        bonusBalance: sql<number>`${wallets.bonusBalance}::numeric`,
      });

    return updated!;
  }

  /**
   * Check if wallet has sufficient balance
   */
  static async hasSufficientBalance(
    input: WalletOperation & { isReal: boolean }
  ): Promise<boolean> {
    const validatedInput = WalletOperationSchema.extend({
      isReal: z.boolean(),
    }).parse(input);

    const balances = await this.getWalletBalances({
      userId: validatedInput.userId,
      operatorId: validatedInput.operatorId,
    });

    if (!balances) return false;

    const currentBalance = validatedInput.isReal
      ? balances.realBalance
      : balances.bonusBalance;

    return currentBalance >= validatedInput.amount;
  }
}
