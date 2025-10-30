import { describe, it, expect, vi, beforeEach } from "bun:test";
import { BetService } from "../../src/services/betService";
import {
  mockRNGService,
  mockWalletService,
  mockVIPService,
  mockVIPRewardService,
  mockJackpotService,
  mockWebSocketService
} from "../test-setup";

// Mock the database
const mockDb = {
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock("../../src/db/schema", () => ({
  db: mockDb,
  betLogs: {
    id: "id",
    userId: "user_id",
    operatorId: "operator_id",
    gameId: "game_id",
    wager: "wager",
    win: "win",
    betType: "bet_type",
    preRealBalance: "pre_real_balance",
    postRealBalance: "post_real_balance",
    preBonusBalance: "pre_bonus_balance",
    postBonusBalance: "post_bonus_balance",
    jackpotContribution: "jackpot_contribution",
    vipPointsAdded: "vip_points_added",
    ggrContribution: "ggr_contribution",
    wageringProgress: "wagering_progress",
  },
  bonusTasks: {
    id: "id",
    userId: "user_id",
    operatorId: "operator_id",
    isCompleted: "is_completed",
    wagered: "wagered",
    wageringRequired: "wagering_required",
    awardedAmount: "awarded_amount",
    updatedAt: "updated_at",
  },
  games: {
    id: "id",
    rtp: "rtp",
    jackpotGroup: "jackpot_group",
    minBet: "min_bet",
    maxBet: "max_bet",
  },
}));

describe("Concurrent Betting Load Tests", () => {
  const testOperatorId = "456e7890-e89b-12d3-a456-426614174001";
  const testGameId = "789e0123-e89b-12d3-a456-426614174002";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Concurrent bet placement", () => {
    it("should handle 10 concurrent bets without race conditions", async () => {
      const numberOfConcurrentBets = 10;
      const wagerAmount = 10;

      // Setup mocks for each bet
      for (let i = 0; i < numberOfConcurrentBets; i++) {
        const mockTx = {
          select: vi.fn(),
          insert: vi.fn(),
          update: vi.fn(),
        };

        mockDb.transaction.mockImplementationOnce(async (callback) => {
          return callback(mockTx);
        });

        // Mock game lookup
        mockTx.select.mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: testGameId,
                rtp: "0.95",
                jackpotGroup: null,
                minBet: "1",
                maxBet: "100",
              }]),
            }),
          }),
        });

        // Mock RNG outcome - mix of wins and losses
        mockRNGService.generateOutcome.mockResolvedValueOnce({
          winAmount: i % 2 === 0 ? wagerAmount * 2 : 0, // Alternate wins/losses
          multiplier: i % 2 === 0 ? 2 : 0,
          isJackpotWin: false,
          outcome: i % 2 === 0 ? "win" : "loss",
        });

        // Mock bet log insertion with unique IDs
        mockTx.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: `bet-log-${i}`,
            }]),
          }),
        });
      }

      // Create concurrent bet promises
      const betPromises = Array.from({ length: numberOfConcurrentBets }, (_, i) =>
        BetService.placeBet({
          userId: `user-${i}`,
          operatorId: testOperatorId,
          gameId: testGameId,
          wager: wagerAmount,
        })
      );

      // Execute all bets concurrently
      const results = await Promise.all(betPromises);

      // Verify all bets completed successfully
      expect(results).toHaveLength(numberOfConcurrentBets);
      results.forEach((result, i) => {
        expect(result.outcome).toBeDefined();
        expect(result.balances).toBeDefined();
        expect(result.betLogId).toBe(`bet-log-${i}`);
      });

      // Verify database transactions were called correctly
      expect(mockDb.transaction).toHaveBeenCalledTimes(numberOfConcurrentBets);
      expect(mockRNGService.generateOutcome).toHaveBeenCalledTimes(numberOfConcurrentBets);
      expect(mockWalletService.debitFromWallet).toHaveBeenCalledTimes(numberOfConcurrentBets);
      expect(mockVIPService.awardXP).toHaveBeenCalledTimes(numberOfConcurrentBets);
    });

    it("should handle jackpot wins during concurrent betting", async () => {
      const numberOfConcurrentBets = 5;
      const wagerAmount = 20;

      // Setup mocks
      for (let i = 0; i < numberOfConcurrentBets; i++) {
        const mockTx = {
          select: vi.fn(),
          insert: vi.fn(),
          update: vi.fn(),
        };

        mockDb.transaction.mockImplementationOnce(async (callback) => {
          return callback(mockTx);
        });

        // Mock game with jackpot
        mockTx.select.mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: testGameId,
                rtp: "0.95",
                jackpotGroup: "mega-jackpot",
                minBet: "1",
                maxBet: "100",
              }]),
            }),
          }),
        });

        // One jackpot win, others regular wins
        const isJackpotWin = i === 2; // Third bet wins jackpot
        mockRNGService.generateOutcome.mockResolvedValueOnce({
          winAmount: isJackpotWin ? 100 : wagerAmount * 1.5,
          multiplier: isJackpotWin ? 5 : 1.5,
          isJackpotWin,
          outcome: isJackpotWin ? "jackpot" : "win",
        });

        if (isJackpotWin) {
          mockJackpotService.calculateContributions.mockResolvedValue([
            { level: "grand", contributionAmount: 0.4 },
          ]);
          mockJackpotService.getJackpotValue.mockResolvedValue(1000);
        } else {
          mockJackpotService.calculateContributions.mockResolvedValue([
            { level: "mini", contributionAmount: 0.2 },
          ]);
        }

        mockTx.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: `jackpot-bet-log-${i}`,
            }]),
          }),
        });
      }

      // Execute concurrent bets
      const betPromises = Array.from({ length: numberOfConcurrentBets }, (_, i) =>
        BetService.placeBet({
          userId: `user-${i}`,
          operatorId: testOperatorId,
          gameId: testGameId,
          wager: wagerAmount,
        })
      );

      const results = await Promise.all(betPromises);

      // Verify jackpot handling
      const jackpotResult = results.find(r => r.outcome.isJackpotWin);
      expect(jackpotResult).toBeDefined();
      expect(jackpotResult!.outcome.winAmount).toBe(50 + 1000); // Base win + jackpot
      expect(mockJackpotService.awardJackpot).toHaveBeenCalledTimes(1);
    });

    it("should handle database transaction rollbacks on errors", async () => {
      const numberOfBets = 3;
      const wagerAmount = 10;

      // Setup successful mocks for first 2 bets
      for (let i = 0; i < 2; i++) {
        const mockTx = {
          select: vi.fn(),
          insert: vi.fn(),
          update: vi.fn(),
        };

        mockDb.transaction.mockImplementationOnce(async (callback) => {
          return callback(mockTx);
        });

        mockTx.select.mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: testGameId,
                rtp: "0.95",
                jackpotGroup: null,
                minBet: "1",
                maxBet: "100",
              }]),
            }),
          }),
        });

        mockRNGService.generateOutcome.mockResolvedValueOnce({
          winAmount: wagerAmount * 1.2,
          multiplier: 1.2,
          isJackpotWin: false,
          outcome: "win",
        });

        mockTx.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: `bet-log-${i}`,
            }]),
          }),
        });
      }

      // Setup failing transaction for third bet
      mockDb.transaction.mockImplementationOnce(async (callback) => {
        throw new Error("Database connection lost");
      });

      const betPromises = Array.from({ length: numberOfBets }, (_, i) =>
        BetService.placeBet({
          userId: `user-${i}`,
          operatorId: testOperatorId,
          gameId: testGameId,
          wager: wagerAmount,
        }).catch(error => ({ error: error.message }))
      );

      const results = await Promise.all(betPromises);

      // First two should succeed, third should fail
      expect(results[0]).not.toHaveProperty('error');
      expect(results[1]).not.toHaveProperty('error');
      expect(results[2]).toHaveProperty('error');
      expect(results[2].error).toBe("Database connection lost");
    });

    it("should maintain data consistency under load", async () => {
      const numberOfBets = 20;
      const wagerAmount = 5;
      const initialBalance = 100;

      // Track balance changes
      let currentBalance = initialBalance;
      let totalWagered = 0;
      let totalWon = 0;

      for (let i = 0; i < numberOfBets; i++) {
        const mockTx = {
          select: vi.fn(),
          insert: vi.fn(),
          update: vi.fn(),
        };

        mockDb.transaction.mockImplementationOnce(async (callback) => {
          return callback(mockTx);
        });

        mockTx.select.mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: testGameId,
                rtp: "0.95",
                jackpotGroup: null,
                minBet: "1",
                maxBet: "100",
              }]),
            }),
          }),
        });

        // Simulate realistic RTP distribution
        const winAmount = Math.random() < 0.5 ? wagerAmount * (1 + Math.random()) : 0;
        totalWagered += wagerAmount;
        totalWon += winAmount;

        mockRNGService.generateOutcome.mockResolvedValueOnce({
          winAmount,
          multiplier: winAmount > 0 ? winAmount / wagerAmount : 0,
          isJackpotWin: false,
          outcome: winAmount > 0 ? "win" : "loss",
        });

        // Update expected balance
        currentBalance = currentBalance - wagerAmount + winAmount;

        mockTx.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: `load-bet-log-${i}`,
            }]),
          }),
        });
      }

      const betPromises = Array.from({ length: numberOfBets }, (_, i) =>
        BetService.placeBet({
          userId: `load-user-${i}`,
          operatorId: testOperatorId,
          gameId: testGameId,
          wager: wagerAmount,
        })
      );

      const results = await Promise.all(betPromises);

      // Verify all bets completed
      expect(results).toHaveLength(numberOfBets);
      results.forEach(result => {
        expect(result.betLogId).toMatch(/^load-bet-log-/);
      });

      // Verify wallet operations were called correctly
      expect(mockWalletService.debitFromWallet).toHaveBeenCalledTimes(numberOfBets);
      expect(mockWalletService.creditToWallet).toHaveBeenCalledTimes(
        results.filter(r => r.outcome.winAmount > 0).length
      );
    });
  });
});