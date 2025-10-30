import { describe, it, expect, vi, beforeEach } from "bun:test";
import { testClient } from "hono/testing";
import { app as betsRoutes } from "../../src/routes/bets";
import {
  mockWalletService,
  mockRNGService,
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

// Mock auth middleware
vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: vi.fn((c: any, next: any) => {
    c.set('user', { id: 'test-user-id' });
    return next();
  }),
}));

describe("Bets Routes Integration", () => {
  let client: ReturnType<typeof testClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = testClient(betsRoutes);
  });

  describe("POST /bets", () => {
    it("should successfully place a bet", async () => {
      const betData = {
        gameId: "game-123",
        wager: 10,
      };

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
              id: betData.gameId,
              rtp: "0.95",
              jackpotGroup: null,
              minBet: "1",
              maxBet: "100",
            }]),
          }),
        }),
      });

      // Mock bet log insertion
      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "bet-log-123",
          }]),
        }),
      });

      const response = await client.bets.$post({
        json: betData,
        headers: {
          'X-Operator-ID': 'operator-123',
        },
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.outcome).toBeDefined();
      expect(result.data.balances).toBeDefined();
      expect(result.data.vipUpdate).toBeDefined();
      expect(result.data.betId).toBe("bet-log-123");
    });

    it("should handle bet placement with jackpot win", async () => {
      const betData = {
        gameId: "jackpot-game-123",
        wager: 20,
      };

      const mockTx = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      // Mock game with jackpot
      mockTx.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{
              id: betData.gameId,
              rtp: "0.95",
              jackpotGroup: "mega-jackpot",
              minBet: "1",
              maxBet: "100",
            }]),
          }),
        }),
      });

      // Mock jackpot win
      mockRNGService.generateOutcome.mockResolvedValue({
        winAmount: 50,
        multiplier: 2.5,
        isJackpotWin: true,
        outcome: "jackpot",
      });

      mockJackpotService.calculateContributions.mockResolvedValue([
        { level: "grand", contributionAmount: 0.4 },
      ]);

      mockJackpotService.getJackpotValue.mockResolvedValue(1000);

      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "jackpot-bet-log",
          }]),
        }),
      });

      const response = await client.bets.$post({
        json: betData,
        headers: {
          'X-Operator-ID': 'operator-123',
        },
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.data.outcome.winAmount).toBe(1050); // 50 + 1000 jackpot
      expect(result.data.outcome.isJackpotWin).toBe(true);
      expect(mockJackpotService.awardJackpot).toHaveBeenCalled();
    });

    it("should validate wager amount bounds", async () => {
      const betData = {
        gameId: "game-123",
        wager: 0.5, // Below minimum
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn(),
        };

        mockTx.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: betData.gameId,
                rtp: "0.95",
                minBet: "1",
                maxBet: "100",
              }]),
            }),
          }),
        });

        return callback(mockTx);
      });

      const response = await client.bets.$post({
        json: betData,
        headers: {
          'X-Operator-ID': 'operator-123',
        },
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.success).toBe(false);
      expect(result.error).toContain("Wager amount out of bounds");
    });

    it("should handle insufficient funds", async () => {
      const betData = {
        gameId: "game-123",
        wager: 50,
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn(),
        };

        mockTx.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: betData.gameId,
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
        realBalance: 25,
        bonusBalance: 10,
      });

      const response = await client.bets.$post({
        json: betData,
        headers: {
          'X-Operator-ID': 'operator-123',
        },
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.success).toBe(false);
      expect(result.error).toBe("Insufficient funds");
    });

    it("should handle game not found", async () => {
      const betData = {
        gameId: "nonexistent-game",
        wager: 10,
      };

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

      const response = await client.bets.$post({
        json: betData,
        headers: {
          'X-Operator-ID': 'operator-123',
        },
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.success).toBe(false);
      expect(result.error).toBe("Game not found");
    });

    it("should validate input schema", async () => {
      const invalidBetData = {
        gameId: "invalid-uuid",
        wager: -10, // Invalid negative wager
      };

      const response = await client.bets.$post({
        json: invalidBetData,
        headers: {
          'X-Operator-ID': 'operator-123',
        },
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.success).toBe(false);
      expect(result.error).toBe("Validation error");
    });

    it("should handle bonus bet wagering progress", async () => {
      const betData = {
        gameId: "game-123",
        wager: 5,
      };

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
              id: betData.gameId,
              rtp: "0.95",
              jackpotGroup: null,
              minBet: "1",
              maxBet: "100",
            }]),
          }),
        }),
      });

      // Setup for bonus bet (insufficient real balance)
      mockWalletService.getWalletBalances
        .mockResolvedValueOnce({ realBalance: 0, bonusBalance: 10 }) // Initial check
        .mockResolvedValueOnce({ realBalance: 0, bonusBalance: 5 }); // After debit

      // Mock active bonus task
      mockTx.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: "bonus-task-123",
                userId: "test-user-id",
                operatorId: "operator-123",
                wagered: "5",
                wageringRequired: "25",
                awardedAmount: "10",
                isCompleted: false,
              }]),
            }),
          }),
        }),
      });

      // Mock bet log insertion
      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "bonus-bet-log",
          }]),
        }),
      });

      const response = await client.bets.$post({
        json: betData,
        headers: {
          'X-Operator-ID': 'operator-123',
        },
      });

      expect(response.status).toBe(200);
      expect(mockTx.update).toHaveBeenCalled(); // Should update bonus task progress
    });
  });
});