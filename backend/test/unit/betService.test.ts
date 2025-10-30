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
    createdAt: "created_at",
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

describe("BetService", () => {
  const testUserId = "123e4567-e89b-12d3-a456-426614174000";
  const testOperatorId = "456e7890-e89b-12d3-a456-426614174001";
  const testGameId = "789e0123-e89b-12d3-a456-426614174002";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("placeBet", () => {
    it("should successfully place a real money bet", async () => {
      const wager = 10;
      const rtp = 0.95;

      // Mock database transaction
      const mockTx = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      // Mock game lookup
      mockTx.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{
              id: testGameId,
              rtp: rtp.toString(),
              jackpotGroup: null,
              minBet: "1",
              maxBet: "100",
            }]),
          }),
        }),
      });

      // Mock RNG outcome
      mockRNGService.generateOutcome.mockResolvedValue({
        winAmount: 5,
        multiplier: 0.5,
        isJackpotWin: false,
        outcome: "win",
      });

      // Mock bet log insertion
      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "bet-log-123",
          }]),
        }),
      });

      const result = await BetService.placeBet({
        userId: testUserId,
        operatorId: testOperatorId,
        gameId: testGameId,
        wager,
      });

      expect(result.outcome.winAmount).toBe(5);
      expect(result.outcome.multiplier).toBe(0.5);
      expect(result.balances.realBalance).toBe(110);
      expect(result.balances.bonusBalance).toBe(50);
      expect(mockWalletService.debitFromWallet).toHaveBeenCalledWith({
        userId: testUserId,
        operatorId: testOperatorId,
        amount: wager,
        isReal: true,
      });
      expect(mockWalletService.creditToWallet).toHaveBeenCalledWith({
        userId: testUserId,
        operatorId: testOperatorId,
        amount: 5,
        isReal: true,
      });
      expect(mockVIPService.awardXP).toHaveBeenCalledWith({
        userId: testUserId,
        xpAmount: wager,
        multiplier: 1,
      });
      expect(mockWebSocketService.broadcastToUser).toHaveBeenCalled();
    });

    it("should successfully place a bonus money bet", async () => {
      const wager = 5;

      const mockTx = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
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

      // Setup wallet to have insufficient real balance but sufficient bonus
      mockWalletService.getWalletBalances
        .mockResolvedValueOnce({ realBalance: 0, bonusBalance: 10 }) // Initial check
        .mockResolvedValueOnce({ realBalance: 0, bonusBalance: 5 }) // After debit
        .mockResolvedValueOnce({ realBalance: 0, bonusBalance: 10 }); // After credit

      // Mock RNG outcome
      mockRNGService.generateOutcome.mockResolvedValue({
        winAmount: 0,
        multiplier: 0,
        isJackpotWin: false,
        outcome: "loss",
      });

      // Mock bet log insertion
      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "bet-log-456",
          }]),
        }),
      });

      const result = await BetService.placeBet({
        userId: testUserId,
        operatorId: testOperatorId,
        gameId: testGameId,
        wager,
      });

      expect(result.outcome.winAmount).toBe(0);
      expect(mockWalletService.debitFromWallet).toHaveBeenCalledWith({
        userId: testUserId,
        operatorId: testOperatorId,
        amount: wager,
        isReal: false, // Bonus bet
      });
    });

    it("should handle jackpot win correctly", async () => {
      const wager = 20;
      const jackpotAmount = 1000;

      const mockTx = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      // Mock game with jackpot group
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

      // Mock jackpot contributions
      mockJackpotService.calculateContributions.mockResolvedValue([
        { level: "grand", contributionAmount: 0.4 },
      ]);

      // Mock jackpot win
      mockRNGService.generateOutcome.mockResolvedValue({
        winAmount: 50,
        multiplier: 2.5,
        isJackpotWin: true,
        outcome: "jackpot",
      });

      mockJackpotService.getJackpotValue.mockResolvedValue(jackpotAmount);

      // Mock bet log insertion
      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "jackpot-bet-log",
          }]),
        }),
      });

      const result = await BetService.placeBet({
        userId: testUserId,
        operatorId: testOperatorId,
        gameId: testGameId,
        wager,
      });

      expect(result.outcome.winAmount).toBe(50 + jackpotAmount);
      expect(result.outcome.isJackpotWin).toBe(true);
      expect(mockJackpotService.awardJackpot).toHaveBeenCalled();
    });

    it("should apply cashback on loss", async () => {
      const wager = 10;

      const mockTx = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
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

      // Mock loss outcome
      mockRNGService.generateOutcome.mockResolvedValue({
        winAmount: 0,
        multiplier: 0,
        isJackpotWin: false,
        outcome: "loss",
      });

      // Mock cashback
      mockVIPRewardService.applyCashback.mockResolvedValue({
        cashbackAmount: 1,
      });

      // Mock bet log insertion
      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "loss-bet-log",
          }]),
        }),
      });

      const result = await BetService.placeBet({
        userId: testUserId,
        operatorId: testOperatorId,
        gameId: testGameId,
        wager,
      });

      expect(mockVIPRewardService.applyCashback).toHaveBeenCalledWith({
        userId: testUserId,
        operatorId: testOperatorId,
        lossAmount: wager,
      });
    });

    it("should throw error for game not found", async () => {
      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn(),
        };

        mockTx.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // No game found
            }),
          }),
        });

        return callback(mockTx);
      });

      await expect(
        BetService.placeBet({
          userId: testUserId,
          operatorId: testOperatorId,
          gameId: testGameId,
          wager: 10,
        })
      ).rejects.toThrow("Game not found");
    });

    it("should throw error for wager out of bounds", async () => {
      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn(),
        };

        mockTx.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: testGameId,
                rtp: "0.95",
                minBet: "10",
                maxBet: "50",
              }]),
            }),
          }),
        });

        return callback(mockTx);
      });

      await expect(
        BetService.placeBet({
          userId: testUserId,
          operatorId: testOperatorId,
          gameId: testGameId,
          wager: 5, // Below min bet
        })
      ).rejects.toThrow("Wager amount out of bounds");
    });

    it("should throw error for insufficient funds", async () => {
      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn(),
        };

        mockTx.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: testGameId,
                rtp: "0.95",
                minBet: "1",
                maxBet: "100",
              }]),
            }),
          }),
        });

        return callback(mockTx);
      });

      // Mock insufficient funds
      mockWalletService.getWalletBalances.mockResolvedValueOnce({
        realBalance: 5,
        bonusBalance: 0,
      });

      await expect(
        BetService.placeBet({
          userId: testUserId,
          operatorId: testOperatorId,
          gameId: testGameId,
          wager: 10,
        })
      ).rejects.toThrow("Insufficient funds");
    });

    it("should validate input with Zod schema", async () => {
      await expect(
        BetService.placeBet({
          userId: "invalid-uuid",
          operatorId: testOperatorId,
          gameId: testGameId,
          wager: -10, // Invalid negative wager
        })
      ).rejects.toThrow();
    });
  });
});