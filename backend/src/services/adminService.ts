import { db } from "../db/db";
import {
  affiliatePayoutTable,
  betLogs,
  transactionLogTable,
} from "../db/schema";
import { wallets } from "../db/schema";
import { games } from "../db/schema";
import { eq, and, gte, lte, sum, count, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { WebSocketService } from "./websocketService";

const TransactionFilterSchema = z.object({
  operatorId: z.string().uuid(),
  playerId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const RTPFilterSchema = z.object({
  operatorId: z.string().uuid(),
  gameId: z.string().uuid().optional(),
  playerId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type TransactionFilter = z.infer<typeof TransactionFilterSchema>;
export type RTPFilter = z.infer<typeof RTPFilterSchema>;

export class AdminService {
  /**
   * Get transactions (deposits, withdrawals, bets) filtered by operator and optionally player
   */
  static async getTransactions(filter: TransactionFilter): Promise<any[]> {
    const validatedFilter = TransactionFilterSchema.parse(filter);

    const whereConditions = [
      eq(transactionLogTable.operatorId, validatedFilter.operatorId),
    ];

    if (validatedFilter.playerId) {
      whereConditions.push(
        eq(transactionLogTable.userId, validatedFilter.playerId)
      );
    }

    if (validatedFilter.startDate) {
      whereConditions.push(
        gte(transactionLogTable.createdAt, new Date(validatedFilter.startDate))
      );
    }

    if (validatedFilter.endDate) {
      whereConditions.push(
        lte(transactionLogTable.createdAt, new Date(validatedFilter.endDate))
      );
    }

    const transactions = await db
      .select({
        id: transactionLogTable.id,
        userId: transactionLogTable.userId,
        type: transactionLogTable.type,
        status: transactionLogTable.status,
        wagerAmount: transactionLogTable.wagerAmount,
        realBalanceBefore: transactionLogTable.realBalanceBefore,
        realBalanceAfter: transactionLogTable.realBalanceAfter,
        bonusBalanceBefore: transactionLogTable.bonusBalanceBefore,
        bonusBalanceAfter: transactionLogTable.bonusBalanceAfter,
        gameId: transactionLogTable.gameId,
        gameName: transactionLogTable.gameName,
        createdAt: transactionLogTable.createdAt,
      })
      .from(transactionLogTable)
      .where(and(...whereConditions))
      .orderBy(desc(transactionLogTable.createdAt));

    return transactions;
  }

  /**
   * Get game performance data (wagers, wins, RTP per player)
   */
  static async getGamePerformance(
    operatorId: string,
    gameId: string
  ): Promise<any> {
    // Get all bet logs for this game and operator
    const bets = await db
      .select({
        userId: betLogs.userId,
        wager: betLogs.wager,
        win: betLogs.win,
      })
      .from(betLogs)
      .where(
        and(eq(betLogs.operatorId, operatorId), eq(betLogs.gameId, gameId))
      );

    // Aggregate by player
    const playerPerformance = new Map<
      string,
      { totalWager: number; totalWin: number; betCount: number }
    >();

    for (const bet of bets) {
      const current = playerPerformance.get(bet.userId) || {
        totalWager: 0,
        totalWin: 0,
        betCount: 0,
      };
      playerPerformance.set(bet.userId, {
        totalWager: current.totalWager + Number(bet.wager),
        totalWin: current.totalWin + Number(bet.win),
        betCount: current.betCount + 1,
      });
    }

    // Calculate RTP per player
    const performance = Array.from(playerPerformance.entries()).map(
      ([userId, data]) => ({
        playerId: userId,
        totalWager: data.totalWager,
        totalWin: data.totalWin,
        betCount: data.betCount,
        rtp: data.totalWager > 0 ? (data.totalWin / data.totalWager) * 100 : 0,
      })
    );

    // Overall game RTP
    const totalWager = performance.reduce((sum, p) => sum + p.totalWager, 0);
    const totalWin = performance.reduce((sum, p) => sum + p.totalWin, 0);
    const overallRTP = totalWager > 0 ? (totalWin / totalWager) * 100 : 0;

    return {
      gameId,
      overallRTP,
      totalWager,
      totalWin,
      totalBets: bets.length,
      playerPerformance: performance,
    };
  }

  /**
   * Get RTP data with filtering
   */
  static async getRTP(filter: RTPFilter): Promise<any> {
    const validatedFilter = RTPFilterSchema.parse(filter);

    const whereConditions = [
      eq(betLogs.operatorId, validatedFilter.operatorId),
    ];

    if (validatedFilter.gameId) {
      whereConditions.push(eq(betLogs.gameId, validatedFilter.gameId));
    }

    if (validatedFilter.playerId) {
      whereConditions.push(eq(betLogs.userId, validatedFilter.playerId));
    }

    if (validatedFilter.startDate) {
      whereConditions.push(
        gte(betLogs.createdAt, new Date(validatedFilter.startDate))
      );
    }

    if (validatedFilter.endDate) {
      whereConditions.push(
        lte(betLogs.createdAt, new Date(validatedFilter.endDate))
      );
    }

    // Get aggregated RTP data
    const rtpData = await db
      .select({
        gameId: betLogs.gameId,
        gameName: games.name,
        totalWager: sum(betLogs.wager),
        totalWin: sum(betLogs.win),
        betCount: count(betLogs.id),
      })
      .from(betLogs)
      .leftJoin(games, eq(betLogs.gameId, games.id))
      .where(and(...whereConditions))
      .groupBy(betLogs.gameId, games.name);

    const results = rtpData.map((row: any) => ({
      gameId: row.gameId,
      gameName: row.gameName,
      totalWager: Number(row.totalWager),
      totalWin: Number(row.totalWin),
      betCount: Number(row.betCount),
      rtp:
        Number(row.totalWager) > 0
          ? (Number(row.totalWin) / Number(row.totalWager)) * 100
          : 0,
    }));

    // Overall RTP if no game filter
    let overallRTP = null;
    if (!validatedFilter.gameId) {
      const totalWager = results.reduce(
        (sum: number, game: any) => sum + game.totalWager,
        0
      );
      const totalWin = results.reduce(
        (sum: number, game: any) => sum + game.totalWin,
        0
      );
      overallRTP = totalWager > 0 ? (totalWin / totalWager) * 100 : 0;
    }

    return {
      overallRTP,
      games: results,
      filters: validatedFilter,
    };
  }

  /**
   * Get financial overview (balances, GGR, affiliate payouts)
   */
  static async getFinancials(operatorId: string): Promise<any> {
    // Get total balances across all wallets for this operator
    const balanceData = await db
      .select({
        totalRealBalance: sum(wallets.realBalance),
        totalBonusBalance: sum(wallets.bonusBalance),
      })
      .from(wallets)
      .where(eq(wallets.operatorId, operatorId));

    const totalRealBalance = Number(balanceData[0]?.totalRealBalance || 0);
    const totalBonusBalance = Number(balanceData[0]?.totalBonusBalance || 0);

    // Calculate GGR (Gross Gaming Revenue) from bet logs
    const ggrData = await db
      .select({
        totalGGR: sum(betLogs.ggrContribution),
      })
      .from(betLogs)
      .where(eq(betLogs.operatorId, operatorId));

    const totalGGR = Number(ggrData[0]?.totalGGR || 0);

    // Get affiliate payout data
    const affiliateData = await db
      .select({
        totalPayouts: sum(affiliatePayoutTable.commissionAmount),
        pendingPayouts: sql<number>`sum(case when ${affiliatePayoutTable.status} = 'NEEDS_REVIEWED' then ${affiliatePayoutTable.commissionAmount} else 0 end)`,
        completedPayouts: sql<number>`sum(case when ${affiliatePayoutTable.status} = 'COMPLETED' then ${affiliatePayoutTable.commissionAmount} else 0 end)`,
      })
      .from(affiliatePayoutTable)
      .where(eq(affiliatePayoutTable.affiliateId, operatorId)); // Assuming operatorId is stored as affiliateId for operators

    const totalAffiliatePayouts = Number(affiliateData[0]?.totalPayouts || 0);
    const pendingAffiliatePayouts = Number(
      affiliateData[0]?.pendingPayouts || 0
    );
    const completedAffiliatePayouts = Number(
      affiliateData[0]?.completedPayouts || 0
    );

    const result = {
      operatorId,
      balances: {
        totalRealBalance,
        totalBonusBalance,
        totalBalance: totalRealBalance + totalBonusBalance,
      },
      gamingRevenue: {
        totalGGR,
      },
      affiliatePayouts: {
        total: totalAffiliatePayouts,
        pending: pendingAffiliatePayouts,
        completed: completedAffiliatePayouts,
      },
    };

    // Send real-time metrics update via WebSocket
    WebSocketService.broadcastToAdmin(operatorId, {
      type: "metric_update",
      operatorId,
      data: result,
    });

    return result;
  }
}
