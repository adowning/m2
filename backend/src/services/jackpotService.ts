import { db } from "../db/db";
import { jackpotPools, jackpots } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

const ContributeToJackpotSchema = z.object({
  group: z.string(),
  level: z.enum(["mini", "minor", "major", "grand"]),
  contributionAmount: z.number().nonnegative(),
});

const GetJackpotSchema = z.object({
  group: z.string(),
  level: z.enum(["mini", "minor", "major", "grand"]),
});

export type ContributeToJackpot = z.infer<typeof ContributeToJackpotSchema>;
export type GetJackpot = z.infer<typeof GetJackpotSchema>;

export class JackpotService {
  /**
   * Contribute to jackpot pool
   */
  static async contributeToJackpot(input: ContributeToJackpot): Promise<{
    newValue: number;
  }> {
    const validatedInput = ContributeToJackpotSchema.parse(input);

    const [updated] = await db
      .update(jackpotPools)
      .set({
        currentValue: sql`${jackpotPools.currentValue} + ${validatedInput.contributionAmount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jackpotPools.group, validatedInput.group),
          eq(jackpotPools.level, validatedInput.level)
        )
      )
      .returning({
        newValue: sql<number>`${jackpotPools.currentValue}::numeric`,
      });

    if (!updated) {
      throw new Error("Jackpot pool not found");
    }

    return { newValue: updated.newValue };
  }

  /**
   * Get current jackpot value
   */
  static async getJackpotValue(input: GetJackpot): Promise<number | null> {
    const validatedInput = GetJackpotSchema.parse(input);

    const [pool] = await db
      .select({
        currentValue: sql<number>`${jackpotPools.currentValue}::numeric`,
      })
      .from(jackpotPools)
      .where(
        and(
          eq(jackpotPools.group, validatedInput.group),
          eq(jackpotPools.level, validatedInput.level),
          eq(jackpotPools.isActive, true)
        )
      )
      .limit(1);

    return pool ? pool.currentValue : null;
  }

  /**
   * Award jackpot win and reset pool
   */
  static async awardJackpot(
    input: GetJackpot & {
      userId: string;
      operatorId: string;
      gameId: string;
      amount: number;
    }
  ): Promise<void> {
    const validatedInput = z
      .object({
        group: z.string(),
        level: z.enum(["mini", "minor", "major", "grand"]),
        userId: z.string().uuid(),
        operatorId: z.string().uuid(),
        gameId: z.string().uuid(),
        amount: z.number().positive(),
      })
      .parse(input);

    // Record the jackpot win
    await db.insert(jackpots).values({
      poolId: sql`(SELECT id FROM ${jackpotPools} WHERE group = ${validatedInput.group} AND level = ${validatedInput.level} LIMIT 1)`,
      userId: validatedInput.userId,
      operatorId: validatedInput.operatorId,
      gameId: validatedInput.gameId,
      amount: validatedInput.amount.toString(),
    });

    // Reset pool to seed value
    const [pool] = await db
      .select({
        seedValue: sql<number>`${jackpotPools.seedValue}::numeric`,
      })
      .from(jackpotPools)
      .where(
        and(
          eq(jackpotPools.group, validatedInput.group),
          eq(jackpotPools.level, validatedInput.level)
        )
      )
      .limit(1);

    if (pool) {
      await db
        .update(jackpotPools)
        .set({
          currentValue: pool.seedValue.toFixed(2),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(jackpotPools.group, validatedInput.group),
            eq(jackpotPools.level, validatedInput.level)
          )
        );
    }
  }

  /**
   * Get jackpot pools for a specific group
   */
  static async getJackpotPoolsForGroup(group: string): Promise<
    Array<{
      level: string;
      currentValue: number;
      contributionRate: number;
    }>
  > {
    const pools = await db
      .select({
        level: jackpotPools.level,
        currentValue: sql<number>`${jackpotPools.currentValue}::numeric`,
        contributionRate: sql<number>`${jackpotPools.contributionRate}::numeric`,
      })
      .from(jackpotPools)
      .where(
        and(eq(jackpotPools.group, group), eq(jackpotPools.isActive, true))
      );

    return pools;
  }

  /**
   * Calculate contribution amounts for each pool in a group
   */
  static async calculateContributions(
    wager: number,
    group: string
  ): Promise<Array<{ level: string; contributionAmount: number }>> {
    const pools = await this.getJackpotPoolsForGroup(group);

    return pools.map((pool) => ({
      level: pool.level,
      contributionAmount: wager * pool.contributionRate,
    }));
  }
}
