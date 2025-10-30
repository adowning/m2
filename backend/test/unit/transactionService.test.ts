import { describe, it, expect, vi, beforeEach } from "bun:test";
import { TransactionService } from "../../src/services/transactionService";
import {
  mockWalletService,
  mockVIPService,
  mockVIPRewardService,
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
  deposits: {
    id: "id",
    userId: "user_id",
    amount: "amount",
    paymentMethod: "payment_method",
    referenceId: "reference_id",
    status: "status",
    bonusAmount: "bonus_amount",
    updatedAt: "updated_at",
  },
  withdrawals: {
    id: "id",
    userId: "user_id",
    amount: "amount",
    payoutMethod: "payout_method",
    status: "status",
    updatedBy: "updated_by",
    note: "note",
    updatedAt: "updated_at",
  },
  transactionLogTable: {
    userId: "user_id",
    operatorId: "operator_id",
    type: "type",
    status: "status",
    wagerAmount: "wager_amount",
    realBalanceBefore: "real_balance_before",
    realBalanceAfter: "real_balance_after",
    bonusBalanceBefore: "bonus_balance_before",
    bonusBalanceAfter: "bonus_balance_after",
    vipPointsAdded: "vip_points_added",
    updatedAt: "updated_at",
    metadata: "metadata",
  },
}));

describe("TransactionService", () => {
  const testUserId = "123e4567-e89b-12d3-a456-426614174000";
  const testOperatorId = "456e7890-e89b-12d3-a456-426614174001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initiateDeposit", () => {
    it("should successfully initiate a deposit", async () => {
      const amount = 100;
      const paymentMethod = "credit_card";
      const referenceId = "ref-123";

      const mockTx = {
        insert: vi.fn(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      // Mock crypto.randomUUID
      const mockDepositId = "deposit-123";
      global.crypto = {
        randomUUID: vi.fn().mockReturnValue(mockDepositId),
      };

      mockTx.insert.mockResolvedValue([]);

      const result = await TransactionService.initiateDeposit({
        userId: testUserId,
        operatorId: testOperatorId,
        amount,
        paymentMethod,
        referenceId,
      });

      expect(result.depositId).toBe(mockDepositId);
      expect(mockTx.insert).toHaveBeenCalledTimes(2); // deposit and transaction log
    });

    it("should validate input with Zod schema", async () => {
      await expect(
        TransactionService.initiateDeposit({
          userId: "invalid-uuid",
          operatorId: testOperatorId,
          amount: -50, // Invalid negative amount
          paymentMethod: "invalid",
          referenceId: "ref-123",
        })
      ).rejects.toThrow();
    });
  });

  describe("completeDeposit", () => {
    it("should successfully complete a deposit", async () => {
      const amount = 100;
      const externalId = "ext-123";

      const mockTx = {
        select: vi.fn(),
        update: vi.fn(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      // Mock deposit lookup
      mockTx.select.mockResolvedValue([{
        id: "deposit-123",
        userId: testUserId,
        operatorId: testOperatorId,
        amount,
        status: "PENDING",
      }]);

      // Mock VIP XP awarding
      mockVIPService.awardXP.mockResolvedValue({
        newXP: 10,
      });

      mockTx.update.mockResolvedValue([]);

      await TransactionService.completeDeposit({
        provider: "stripe",
        transactionId: "ref-123",
        amount,
        externalId,
      });

      expect(mockWalletService.creditToWallet).toHaveBeenCalledWith({
        userId: testUserId,
        operatorId: testOperatorId,
        amount,
        isReal: true,
      });
      expect(mockVIPService.awardXP).toHaveBeenCalledWith({
        userId: testUserId,
        xpAmount: Math.floor(amount / 10),
        multiplier: 1,
      });
      expect(mockWebSocketService.broadcastToUser).toHaveBeenCalled();
      expect(mockWebSocketService.broadcastToAllAdmins).toHaveBeenCalled();
    });

    it("should award free spins bonus", async () => {
      const amount = 100; // Should give 1 free spin

      const mockTx = {
        select: vi.fn(),
        update: vi.fn(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      mockTx.select.mockResolvedValue([{
        id: "deposit-123",
        userId: testUserId,
        operatorId: testOperatorId,
        amount,
        status: "PENDING",
      }]);

      mockVIPService.awardXP.mockResolvedValue({
        newXP: 10,
      });

      await TransactionService.completeDeposit({
        provider: "stripe",
        transactionId: "ref-123",
        amount,
        externalId: "ext-123",
      });

      expect(mockWalletService.creditToWallet).toHaveBeenCalledTimes(2); // Real money + free spins
      expect(mockWalletService.creditToWallet).toHaveBeenNthCalledWith(2, {
        userId: testUserId,
        operatorId: testOperatorId,
        amount: 1, // 1 free spin
        isReal: false,
      });
    });

    it("should apply level up rewards if user leveled up", async () => {
      const amount = 50;

      const mockTx = {
        select: vi.fn(),
        update: vi.fn(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      mockTx.select.mockResolvedValue([{
        id: "deposit-123",
        userId: testUserId,
        operatorId: testOperatorId,
        amount,
        status: "PENDING",
      }]);

      mockVIPService.awardXP.mockResolvedValue({
        newXP: 100,
        levelUp: {
          newLevel: 2,
          levelName: "Silver",
        },
      });

      await TransactionService.completeDeposit({
        provider: "stripe",
        transactionId: "ref-123",
        amount,
        externalId: "ext-123",
      });

      expect(mockVIPRewardService.applyLevelUpRewards).toHaveBeenCalledWith({
        userId: testUserId,
        operatorId: testOperatorId,
        newLevel: 2,
      });
    });

    it("should throw error if deposit not found", async () => {
      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockResolvedValue([]), // No deposit found
        };

        return callback(mockTx);
      });

      await expect(
        TransactionService.completeDeposit({
          provider: "stripe",
          transactionId: "nonexistent-ref",
          amount: 100,
          externalId: "ext-123",
        })
      ).rejects.toThrow("Deposit not found or already processed");
    });

    it("should validate input with Zod schema", async () => {
      await expect(
        TransactionService.completeDeposit({
          provider: "stripe",
          transactionId: "invalid-uuid",
          amount: -100, // Invalid negative amount
          externalId: "ext-123",
        })
      ).rejects.toThrow();
    });
  });

  describe("requestWithdrawal", () => {
    it("should successfully request a withdrawal", async () => {
      const amount = 50;
      const payoutMethod = "bank_transfer";

      const mockTx = {
        insert: vi.fn(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      // Mock crypto.randomUUID
      const mockWithdrawalId = "withdrawal-123";
      global.crypto = {
        randomUUID: vi.fn().mockReturnValue(mockWithdrawalId),
      };

      mockTx.insert.mockResolvedValue([]);

      const result = await TransactionService.requestWithdrawal({
        userId: testUserId,
        operatorId: testOperatorId,
        amount,
        payoutMethod,
      });

      expect(result.withdrawalId).toBe(mockWithdrawalId);
      expect(mockWalletService.debitFromWallet).toHaveBeenCalledWith({
        userId: testUserId,
        operatorId: testOperatorId,
        amount,
        isReal: true,
      });
    });

    it("should validate input with Zod schema", async () => {
      await expect(
        TransactionService.requestWithdrawal({
          userId: "invalid-uuid",
          operatorId: testOperatorId,
          amount: -50, // Invalid negative amount
          payoutMethod: "invalid",
        })
      ).rejects.toThrow();
    });
  });

  describe("processWithdrawal", () => {
    it("should approve withdrawal successfully", async () => {
      const withdrawalId = "withdrawal-123";
      const adminId = "admin-456";

      const mockTx = {
        select: vi.fn(),
        update: vi.fn(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      mockTx.select.mockResolvedValue([{
        id: withdrawalId,
        userId: testUserId,
        operatorId: testOperatorId,
        amount: 50,
        status: "PENDING",
      }]);

      mockTx.update.mockResolvedValue([]);

      await TransactionService.processWithdrawal({
        withdrawalId,
        action: "approve",
        adminId,
      });

      expect(mockTx.update).toHaveBeenCalledTimes(2); // withdrawal and transaction log
    });

    it("should reject withdrawal and return funds", async () => {
      const withdrawalId = "withdrawal-123";
      const adminId = "admin-456";
      const amount = 50;

      const mockTx = {
        select: vi.fn(),
        update: vi.fn(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      mockTx.select.mockResolvedValue([{
        id: withdrawalId,
        userId: testUserId,
        operatorId: testOperatorId,
        amount,
        status: "PENDING",
      }]);

      mockTx.update.mockResolvedValue([]);

      await TransactionService.processWithdrawal({
        withdrawalId,
        action: "reject",
        adminId,
        note: "Insufficient verification",
      });

      expect(mockWalletService.creditToWallet).toHaveBeenCalledWith({
        userId: testUserId,
        operatorId: testOperatorId,
        amount,
        isReal: true,
      });
    });

    it("should throw error if withdrawal not found", async () => {
      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          select: vi.fn().mockResolvedValue([]), // No withdrawal found
        };

        return callback(mockTx);
      });

      await expect(
        TransactionService.processWithdrawal({
          withdrawalId: "nonexistent-id",
          action: "approve",
          adminId: "admin-123",
        })
      ).rejects.toThrow("Withdrawal not found or already processed");
    });

    it("should validate input with Zod schema", async () => {
      await expect(
        TransactionService.processWithdrawal({
          withdrawalId: "invalid-uuid",
          action: "invalid_action", // Invalid action
          adminId: "admin-123",
        })
      ).rejects.toThrow();
    });
  });
});