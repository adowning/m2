import { db } from "../db/db";
import { users, vipLevels } from "../db/schema";
import { eq, gte, asc, sql } from "drizzle-orm";
import { z } from "zod";

const AwardXPInputSchema = z.object({
  userId: z.string().uuid(),
  xpAmount: z.number().nonnegative(),
  multiplier: z.number().positive().default(1),
});

const GetUserVIPStatusSchema = z.object({
  userId: z.string().uuid(),
});

export type AwardXPInput = z.infer<typeof AwardXPInputSchema>;
export type GetUserVIPStatus = z.infer<typeof GetUserVIPStatusSchema>;

export class VIPService {
  /**
   * Award XP to user and check for level up
   */
  static async awardXP(input: AwardXPInput): Promise<{
    newXP: number;
    levelUp?: {
      newLevel: number;
      levelName: string;
    };
  }> {
    const validatedInput = AwardXPInputSchema.parse(input);
    const xpToAdd = validatedInput.xpAmount * validatedInput.multiplier;

    // Get current XP
    const [user] = await db
      .select({ vipExperience: sql<number>`${users.vipExperience}::numeric` })
      .from(users)
      .where(eq(users.id, validatedInput.userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const currentXP = user.vipExperience;
    const newXP = currentXP + xpToAdd;

    // Update XP
    await db
      .update(users)
      .set({
        vipExperience: sql`${users.vipExperience} + ${xpToAdd}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, validatedInput.userId));

    // Check for level up
    const currentLevel = await this.getCurrentLevel(newXP);
    const previousLevel = await this.getCurrentLevel(currentXP);

    let levelUp: { newLevel: number; levelName: string } | undefined;
    if (
      currentLevel &&
      (!previousLevel || currentLevel.level > previousLevel.level)
    ) {
      levelUp = {
        newLevel: Number(currentLevel.level),
        levelName: currentLevel.name,
      };
    }

    return {
      newXP,
      levelUp,
    };
  }

  /**
   * Get user's current VIP status
   */
  static async getUserVIPStatus(input: GetUserVIPStatus): Promise<{
    currentXP: number;
    currentLevel: {
      level: number;
      name: string;
      minExperience: number;
    } | null;
    nextLevel: {
      level: number;
      name: string;
      minExperience: number;
    } | null;
  }> {
    const validatedInput = GetUserVIPStatusSchema.parse(input);

    const [user] = await db
      .select({ vipExperience: sql<number>`${users.vipExperience}::numeric` })
      .from(users)
      .where(eq(users.id, validatedInput.userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const currentXP = user.vipExperience;
    const currentLevel = await this.getCurrentLevel(currentXP);
    const nextLevel = await this.getNextLevel(currentXP);

    return {
      currentXP,
      currentLevel: currentLevel
        ? {
            level: Number(currentLevel.level),
            name: currentLevel.name,
            minExperience: Number(currentLevel.minExperience),
          }
        : null,
      nextLevel: nextLevel
        ? {
            level: Number(nextLevel.level),
            name: nextLevel.name,
            minExperience: Number(nextLevel.minExperience),
          }
        : null,
    };
  }

  /**
   * Get current VIP level based on XP
   */
  private static async getCurrentLevel(xp: number) {
    const [level] = await db
      .select({
        level: sql<number>`${vipLevels.level}::numeric`,
        name: vipLevels.name,
        minExperience: sql<number>`${vipLevels.minExperience}::numeric`,
      })
      .from(vipLevels)
      .where(gte(vipLevels.minExperience, xp))
      .orderBy(asc(vipLevels.minExperience))
      .limit(1);

    return level || null;
  }

  /**
   * Get next VIP level based on XP
   */
  private static async getNextLevel(xp: number) {
    const levels = await db
      .select({
        level: sql<number>`${vipLevels.level}::numeric`,
        name: vipLevels.name,
        minExperience: sql<number>`${vipLevels.minExperience}::numeric`,
      })
      .from(vipLevels)
      .where(gte(vipLevels.minExperience, xp))
      .orderBy(asc(vipLevels.minExperience))
      .limit(2);

    // Return the second level (next one) if it exists
    return levels.length > 1 ? levels[1] : null;
  }

  /**
   * Get VIP level by level number
   */
  static async getVIPLevel(level: number) {
    const [vipLevel] = await db
      .select()
      .from(vipLevels)
      .where(eq(vipLevels.level, level.toString()))
      .limit(1);

    return vipLevel || null;
  }

  /**
   * Add XP to a user (alias for awardXP for consistency)
   */
  static async addXpToUser(input: AwardXPInput): Promise<{
    newXP: number;
    levelUp?: {
      newLevel: number;
      levelName: string;
    };
  }> {
    return this.awardXP(input);
  }

  /**
   * Get VIP status for a user (alias for getUserVIPStatus)
   */
  static async getVipStatus(input: GetUserVIPStatus): Promise<{
    currentXP: number;
    currentLevel: {
      level: number;
      name: string;
      minExperience: number;
    } | null;
    nextLevel: {
      level: number;
      name: string;
      minExperience: number;
    } | null;
  }> {
    return this.getUserVIPStatus(input);
  }

  /**
   * Check if user has leveled up after gaining XP
   */
  static async checkLevelUp(
    userId: string,
    previousXP: number
  ): Promise<{
    leveledUp: boolean;
    newLevel?: {
      level: number;
      levelName: string;
    };
  }> {
    const [user] = await db
      .select({ vipExperience: sql<number>`${users.vipExperience}::numeric` })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const currentXP = user.vipExperience;
    const currentLevel = await this.getCurrentLevel(currentXP);
    const previousLevel = await this.getCurrentLevel(previousXP);

    const leveledUp =
      currentLevel &&
      (!previousLevel || currentLevel.level > previousLevel.level);

    return {
      leveledUp,
      newLevel: leveledUp
        ? {
            level: Number(currentLevel.level),
            levelName: currentLevel.name,
          }
        : undefined,
    };
  }

  /**
   * Get all VIP levels
   */
  static async getVipLevels(): Promise<
    {
      level: number;
      name: string;
      minExperience: number;
      cashbackRate: number;
      freeSpinsPerMonth: number;
      benefits: any;
    }[]
  > {
    const levels = await db
      .select({
        level: sql<number>`${vipLevels.level}::numeric`,
        name: vipLevels.name,
        minExperience: sql<number>`${vipLevels.minExperience}::numeric`,
        cashbackRate: sql<number>`${vipLevels.cashbackRate}::numeric`,
        freeSpinsPerMonth: sql<number>`${vipLevels.freeSpinsPerMonth}::numeric`,
        benefits: vipLevels.benefits,
      })
      .from(vipLevels)
      .orderBy(asc(vipLevels.minExperience));

    return levels;
  }
}
