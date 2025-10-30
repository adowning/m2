import { describe, it, expect, vi, beforeEach } from "bun:test";
import { WalletService } from "../../src/services/walletService";
import { z } from "zod";

// Mock the database
const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
  execute: vi.fn(),
};

vi.mock("../../src/db/schema", () => ({
  db: mockDb,
  wallets: {
    realBalance: "real_balance",
    bonusBalance: "bonus_balance",
    userId: "user_id",
    operatorId: "operator_id",
    updatedAt: "updated_at",
  },
}));

describe("WalletService", () => {
  const testUserId = "123e4567-e89b-12d3-a456-426614174000";
  const testOperatorId = "456e7890-e89b-12d3-a456-426614174001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getWalletBalances", () => {
    it("should return wallet balances for valid user-operator pair", async () => {
      const mockBalances = {
        realBalance: 100.5,
        bonusBalance: 50.25,
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockBalances]),
          }),
        }),
      });

      const result = await WalletService.getWalletBalances({
        userId: testUserId,
        operatorId: testOperatorId,
      });

      expect(result).toEqual(mockBalances);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it("should return null when wallet not found", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await WalletService.getWalletBalances({
        userId: testUserId,
        operatorId: testOperatorId,
      });

      expect(result).toBeNull();
    });

    it("should validate input with Zod schema", async () => {
      await expect(
        WalletService.getWalletBalances({
          userId: "invalid-uuid",
          operatorId: testOperatorId,
        })
      ).rejects.toThrow();
    });
  });

  describe("creditToWallet", () => {
    it("should successfully credit real balance", async () => {
      const amount = 50;
      const mockUpdatedBalances = {
        realBalance: 150.5,
        bonusBalance: 50.25,
      };

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdatedBalances]),
          }),
        }),
      });

      const result = await WalletService.creditToWallet({
        userId: testUserId,
        operatorId: testOperatorId,
        amount,
        isReal: true,
      });

      expect(result).toEqual(mockUpdatedBalances);
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it("should successfully credit bonus balance", async () => {
      const amount = 25;
      const mockUpdatedBalances = {
        realBalance: 100.5,
        bonusBalance: 75.25,
      };

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdatedBalances]),
          }),
        }),
      });

      const result = await WalletService.creditToWallet({
        userId: testUserId,
        operatorId: testOperatorId,
        amount,
        isReal: false,
      });

      expect(result).toEqual(mockUpdatedBalances);
    });

    it("should throw error when wallet not found", async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(
        WalletService.creditToWallet({
          userId: testUserId,
          operatorId: testOperatorId,
          amount: 50,
          isReal: true,
        })
      ).rejects.toThrow("Wallet not found");
    });

    it("should validate input with Zod schema", async () => {
      await expect(
        WalletService.creditToWallet({
          userId: "invalid-uuid",
          operatorId: testOperatorId,
          amount: -10, // Invalid negative amount
          isReal: true,
        })
      ).rejects.toThrow();
    });
  });

  describe("debitFromWallet", () => {
    it("should successfully debit real balance", async () => {
      const amount = 30;
      const mockBalances = { realBalance: 100, bonusBalance: 50 };
      const mockUpdatedBalances = {
        realBalance: 70,
        bonusBalance: 50,
      };

      // Mock getWalletBalances
      vi.spyOn(WalletService, "getWalletBalances").mockResolvedValue(mockBalances);

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdatedBalances]),
          }),
        }),
      });

      const result = await WalletService.debitFromWallet({
        userId: testUserId,
        operatorId: testOperatorId,
        amount,
        isReal: true,
      });

      expect(result).toEqual(mockUpdatedBalances);
    });

    it("should throw error for insufficient balance", async () => {
      const mockBalances = { realBalance: 20, bonusBalance: 50 };

      vi.spyOn(WalletService, "getWalletBalances").mockResolvedValue(mockBalances);

      await expect(
        WalletService.debitFromWallet({
          userId: testUserId,
          operatorId: testOperatorId,
          amount: 50, // More than available
          isReal: true,
        })
      ).rejects.toThrow("Insufficient balance");
    });

    it("should throw error when wallet not found", async () => {
      vi.spyOn(WalletService, "getWalletBalances").mockResolvedValue(null);

      await expect(
        WalletService.debitFromWallet({
          userId: testUserId,
          operatorId: testOperatorId,
          amount: 10,
          isReal: true,
        })
      ).rejects.toThrow("Wallet not found");
    });
  });

  describe("hasSufficientBalance", () => {
    it("should return true for sufficient real balance", async () => {
      const mockBalances = { realBalance: 100, bonusBalance: 50 };
      vi.spyOn(WalletService, "getWalletBalances").mockResolvedValue(mockBalances);

      const result = await WalletService.hasSufficientBalance({
        userId: testUserId,
        operatorId: testOperatorId,
        amount: 80,
        isReal: true,
      });

      expect(result).toBe(true);
    });

    it("should return false for insufficient bonus balance", async () => {
      const mockBalances = { realBalance: 100, bonusBalance: 30 };
      vi.spyOn(WalletService, "getWalletBalances").mockResolvedValue(mockBalances);

      const result = await WalletService.hasSufficientBalance({
        userId: testUserId,
        operatorId: testOperatorId,
        amount: 50,
        isReal: false,
      });

      expect(result).toBe(false);
    });

    it("should return false when wallet not found", async () => {
      vi.spyOn(WalletService, "getWalletBalances").mockResolvedValue(null);

      const result = await WalletService.hasSufficientBalance({
        userId: testUserId,
        operatorId: testOperatorId,
        amount: 10,
        isReal: true,
      });

      expect(result).toBe(false);
    });
  });
});