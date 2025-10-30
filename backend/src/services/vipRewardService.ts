import { db } from "../db/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { WalletService } from "./walletService";
import { users, vipLevels } from "../db/schema";

const ApplyLevelUpRewardsSchema = z.object({
  userId: z.string().uuid(),
  operatorId: z.string().uuid(),
  newLevel: z.number().positive(),
});

const ApplyCashbackSchema = z.object({
  userId: z.string().uuid(),
  operatorId: z.string().uuid(),
  lossAmount: z.number().positive(),
});

const ApplyFreeSpinsSchema = z.object({
  userId: z.string().uuid(),
  operatorId: z.string().uuid(),
  level: z.number().positive(),
});

export type ApplyLevelUpRewards = z.infer<typeof ApplyLevelUpRewardsSchema>;
export type ApplyCashback = z.infer<typeof ApplyCashbackSchema>;
export type ApplyFreeSpins = z.infer<typeof ApplyFreeSpinsSchema>;

export class VIPRewardService {
  /**
   * Apply rewards when user levels up
   */
  static async applyLevelUpRewards(input: ApplyLevelUpRewards): Promise<{
    freeSpinsGranted: number;
    cashbackRate: number;
  }> {
    const validatedInput = ApplyLevelUpRewardsSchema.parse(input);

    // Get VIP level details
    const vipLevel = await this.getVIPLevel(validatedInput.newLevel);
    if (!vipLevel) {
      throw new Error("VIP level not found");
    }

    // Grant free spins to bonus balance
    let freeSpinsGranted = 0;
    if (vipLevel.freeSpinsPerMonth > 0) {
      await WalletService.creditToWallet({
        userId: validatedInput.userId,
        operatorId: validatedInput.operatorId,
        amount: vipLevel.freeSpinsPerMonth,
        isReal: false, // Free spins to bonus balance
      });
      freeSpinsGranted = vipLevel.freeSpinsPerMonth;
    }

    return {
      freeSpinsGranted,
      cashbackRate: Number(vipLevel.cashbackRate),
    };
  }

  /**
   * Apply cashback on losses for VIP users
   */
  static async applyCashback(input: ApplyCashback): Promise<{
    cashbackAmount: number;
  }> {
    const validatedInput = ApplyCashbackSchema.parse(input);

    // Get user's current VIP level
    const [user] = await db
      .select({ vipExperience: sql<number>`${users.vipExperience}::numeric` })
      .from(users)
      .where(eq(users.id, validatedInput.userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const vipLevel = await this.getCurrentVIPLevel(user.vipExperience);
    if (!vipLevel || vipLevel.cashbackRate <= 0) {
      return { cashbackAmount: 0 };
    }

    const cashbackAmount =
      validatedInput.lossAmount * (Number(vipLevel.cashbackRate) / 100);

    if (cashbackAmount > 0) {
      await WalletService.creditToWallet({
        userId: validatedInput.userId,
        operatorId: validatedInput.operatorId,
        amount: cashbackAmount,
        isReal: false, // Cashback to bonus balance
      });
    }

    return { cashbackAmount };
  }

  /**
   * Grant monthly free spins to VIP users
   */
  static async grantMonthlyFreeSpins(input: ApplyFreeSpins): Promise<{
    freeSpinsGranted: number;
  }> {
    const validatedInput = ApplyFreeSpinsSchema.parse(input);

    // Get VIP level details
    const vipLevel = await this.getVIPLevel(validatedInput.level);
    if (!vipLevel || vipLevel.freeSpinsPerMonth <= 0) {
      return { freeSpinsGranted: 0 };
    }

    // Grant free spins to bonus balance
    await WalletService.creditToWallet({
      userId: validatedInput.userId,
      operatorId: validatedInput.operatorId,
      amount: vipLevel.freeSpinsPerMonth,
      isReal: false,
    });

    return { freeSpinsGranted: vipLevel.freeSpinsPerMonth };
  }

  /**
   * Get current VIP level for XP amount
   */
  private static async getCurrentVIPLevel(xp: number) {
    const [level] = await db
      .select({
        level: sql<number>`${vipLevels.level}::numeric`,
        name: vipLevels.name,
        minExperience: sql<number>`${vipLevels.minExperience}::numeric`,
        cashbackRate: sql<number>`${vipLevels.cashbackRate}::numeric`,
        freeSpinsPerMonth: sql<number>`${vipLevels.freeSpinsPerMonth}::numeric`,
      })
      .from(vipLevels)
      .where(sql`${vipLevels.minExperience} <= ${xp}`)
      .orderBy(sql`${vipLevels.minExperience} DESC`)
      .limit(1);

    return level || null;
  }

  /**
   * Get VIP level by level number
   */
  private static async getVIPLevel(level: number) {
    const [vipLevel] = await db
      .select({
        level: sql<number>`${vipLevels.level}::numeric`,
        name: vipLevels.name,
        minExperience: sql<number>`${vipLevels.minExperience}::numeric`,
        cashbackRate: sql<number>`${vipLevels.cashbackRate}::numeric`,
        freeSpinsPerMonth: sql<number>`${vipLevels.freeSpinsPerMonth}::numeric`,
        benefits: vipLevels.benefits,
      })
      .from(vipLevels)
      .where(sql`${vipLevels.level} = ${level}`)
      .limit(1);

    return vipLevel || null;
  }
}
