import { db } from "../db/db";
import {
  depositTable as deposits,
  withdrawalTable as withdrawals,
  transactionLogTable,
} from "../../database/schema/finance";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { WalletService } from "./walletService";
import { VIPService } from "./vipService";
import { VIPRewardService } from "./vipRewardService";
import { WebSocketService } from "./websocketService";

const DepositInitiateSchema = z.object({
  userId: z.string().uuid(),
  operatorId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.string(),
  referenceId: z.string().uuid(),
});

const WithdrawalRequestSchema = z.object({
  userId: z.string().uuid(),
  operatorId: z.string().uuid(),
  amount: z.number().positive(),
  payoutMethod: z.string(),
});

const WebhookCompleteSchema = z.object({
  provider: z.string(),
  transactionId: z.string().uuid(),
  amount: z.number().positive(),
  externalId: z.string(),
});

const AdminActionSchema = z.object({
  withdrawalId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().optional(),
  adminId: z.string().uuid(),
});

export type DepositInitiate = z.infer<typeof DepositInitiateSchema>;
export type WithdrawalRequest = z.infer<typeof WithdrawalRequestSchema>;
export type WebhookComplete = z.infer<typeof WebhookCompleteSchema>;
export type AdminAction = z.infer<typeof AdminActionSchema>;

export class TransactionService {
  /**
   * Initiate a deposit: create deposit record and transaction log
   */
  static async initiateDeposit(
    input: DepositInitiate
  ): Promise<{ depositId: string }> {
    const validatedInput = DepositInitiateSchema.parse(input);

    const depositId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      // Create deposit record
      await tx.insert(deposits).values({
        id: depositId,
        userId: validatedInput.userId,
        amount: validatedInput.amount,
        paymentMethod: validatedInput.paymentMethod,
        referenceId: validatedInput.referenceId,
        status: "PENDING",
        bonusAmount: 0, // Will be calculated on completion
      });

      // Get balances before
      const balances = await WalletService.getWalletBalances({
        userId: validatedInput.userId,
        operatorId: validatedInput.operatorId,
      });
      // Create transaction log
      await tx.insert(transactionLogTable).values({
        userId: validatedInput.userId,
        operatorId: validatedInput.operatorId,
        type: "DEPOSIT",
        status: "PENDING",
        wagerAmount: validatedInput.amount,
        realBalanceBefore: balances?.realBalance ?? 0,
        realBalanceAfter: balances?.realBalance ?? 0,
        bonusBalanceBefore: balances?.bonusBalance ?? 0,
        bonusBalanceAfter: balances?.bonusBalance ?? 0,
        metadata: { depositId, paymentMethod: validatedInput.paymentMethod },
      });
    });

    return { depositId };
  }

  /**
   * Complete deposit via webhook
   */
  static async completeDeposit(input: WebhookComplete): Promise<void> {
    const validatedInput = WebhookCompleteSchema.parse(input);

    await db.transaction(async (tx) => {
      // Find pending deposit
      const [deposit] = await tx
        .select()
        .from(deposits)
        .where(
          and(
            eq(deposits.referenceId, validatedInput.transactionId),
            eq(deposits.status, "PENDING")
          )
        )
        .limit(1);

      if (!deposit) throw new Error("Deposit not found or already processed");

      // Find the original transaction log to get the operatorId
      const [txLog] = await tx
        .select()
        .from(transactionLogTable)
        .where(
          and(
            eq(transactionLogTable.userId, deposit.userId),
            eq(transactionLogTable.type, "DEPOSIT"),
            eq(transactionLogTable.status, "PENDING")
          )
        )
        .limit(1);

      if (!txLog || !txLog.operatorId)
        throw new Error("Transaction log not found or operatorId is missing");

      const operatorId = txLog.operatorId;

      // Get balances before
      const balances = await WalletService.getWalletBalances({
        userId: deposit.userId,
        operatorId: operatorId,
      });

      if (!balances) throw new Error("Wallet not found");

      // Credit wallet
      const newBalances = await WalletService.creditToWallet({
        userId: deposit.userId,
        operatorId: operatorId,
        amount: deposit.amount,
        isReal: true,
      });

      // Award free spins bonus (1 free spin per $50 deposited)
      const freeSpinsAwarded = Math.floor(deposit.amount / 50);
      let finalBalances = newBalances;
      if (freeSpinsAwarded > 0) {
        finalBalances = await WalletService.creditToWallet({
          userId: deposit.userId,
          operatorId: operatorId,
          amount: freeSpinsAwarded,
          isReal: false, // Free spins to bonus balance
        });
      }
      // Award XP bonus
      const xpResult = await VIPService.awardXP({
        userId: deposit.userId,
        xpAmount: Math.floor(deposit.amount / 10), // 1 XP per $10 deposited, configurable
        multiplier: 1,
      });

      // Apply level-up rewards if user leveled up
      if (xpResult.levelUp) {
        await VIPRewardService.applyLevelUpRewards({
          userId: deposit.userId,
          operatorId: operatorId,
          newLevel: xpResult.levelUp.newLevel,
        });
      }

      // Update deposit status and bonus amount
      await tx
        .update(deposits)
        .set({
          status: "COMPLETED",
          bonusAmount: freeSpinsAwarded,
          updatedAt: new Date(),
        })
        .where(eq(deposits.id, deposit.id));

      // Update transaction log
      await tx
        .update(transactionLogTable)
        .set({
          status: "COMPLETED",
          realBalanceAfter: finalBalances.realBalance,
          bonusBalanceAfter: finalBalances.bonusBalance,
          vipPointsAdded: xpResult.newXP,
          updatedAt: new Date(),
          metadata: { completed: true, externalId: validatedInput.externalId },
        })
        .where(eq(transactionLogTable.id, txLog.id));

      // Send real-time notification for deposit completion
      WebSocketService.broadcastToUser(deposit.userId, {
        type: "balance_update",
        userId: deposit.userId,
        data: {
          balanceUpdate: finalBalances,
          transaction: {
            type: "deposit",
            amount: deposit.amount,
            status: "completed",
          },
        },
      });

      // Send real-time notification to admin for new transaction
      WebSocketService.broadcastToAllAdmins({
        type: "new_transaction",
        operatorId: operatorId,
        data: {
          transactionType: "deposit",
          userId: deposit.userId,
          amount: deposit.amount,
          status: "completed",
        },
      });
    });
  }

  /**
   * Request a withdrawal
   */
  static async requestWithdrawal(
    input: WithdrawalRequest
  ): Promise<{ withdrawalId: string }> {
    const validatedInput = WithdrawalRequestSchema.parse(input);

    // Check wagering requirements (placeholder - implement wagering service)
    // if (!await WageringService.checkRequirements(validatedInput.userId, validatedInput.operatorId)) {
    //   throw new Error('Wagering requirements not met');
    // }

    const withdrawalId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      const balancesBefore = await WalletService.getWalletBalances({
        userId: validatedInput.userId,
        operatorId: validatedInput.operatorId,
      });

      // Debit wallet
      const balancesAfter = await WalletService.debitFromWallet({
        userId: validatedInput.userId,
        operatorId: validatedInput.operatorId,
        amount: validatedInput.amount,
        isReal: true,
      });

      // Create withdrawal record
      await tx.insert(withdrawals).values({
        id: withdrawalId,
        userId: validatedInput.userId,
        amount: validatedInput.amount,
        payoutMethod: validatedInput.payoutMethod,
        status: "PENDING",
      });

      // Create transaction log
      await tx.insert(transactionLogTable).values({
        userId: validatedInput.userId,
        operatorId: validatedInput.operatorId,
        type: "WITHDRAWAL",
        status: "PENDING",
        wagerAmount: validatedInput.amount,
        realBalanceBefore: balancesBefore?.realBalance || 0,
        realBalanceAfter: balancesAfter.realBalance,
        bonusBalanceBefore: balancesBefore?.bonusBalance || 0,
        bonusBalanceAfter: balancesAfter.bonusBalance,
        metadata: { withdrawalId },
      });
    });

    return { withdrawalId };
  }

  /**
   * Admin approve/reject withdrawal
   */
  static async processWithdrawal(input: AdminAction): Promise<void> {
    const validatedInput = AdminActionSchema.parse(input);

    await db.transaction(async (tx) => {
      const [withdrawal] = await tx
        .select()
        .from(withdrawals)
        .where(
          and(
            eq(withdrawals.id, validatedInput.withdrawalId),
            eq(withdrawals.status, "PENDING")
          )
        )
        .limit(1);

      if (!withdrawal)
        throw new Error("Withdrawal not found or already processed");

      const newStatus =
        validatedInput.action === "approve" ? "COMPLETED" : "REJECTED";

      // Update withdrawal
      await tx
        .update(withdrawals)
        .set({
          status: newStatus,
          updatedBy: validatedInput.adminId,
          note: validatedInput.note,
          updatedAt: new Date(),
        })
        .where(eq(withdrawals.id, validatedInput.withdrawalId));

      const [txLog] = await tx
        .select()
        .from(transactionLogTable)
        .where(
          and(
            eq(transactionLogTable.userId, withdrawal.userId),
            eq(transactionLogTable.type, "WITHDRAWAL"),
            eq(transactionLogTable.status, "PENDING")
          )
        )
        .limit(1);

      if (!txLog || !txLog.operatorId)
        throw new Error("Transaction log not found or operatorId is missing");

      const operatorId = txLog.operatorId;

      // If rejected, return funds
      if (validatedInput.action === "reject") {
        await WalletService.creditToWallet({
          userId: withdrawal.userId,
          operatorId: operatorId,
          amount: withdrawal.amount,
          isReal: true,
        });
      }

      // Update transaction log
      await tx
        .update(transactionLogTable)
        .set({
          status: newStatus,
          updatedBy: validatedInput.adminId,
          updatedAt: new Date(),
          metadata: { processed: true, note: validatedInput.note },
        })
        .where(eq(transactionLogTable.id, txLog.id));

      // Send real-time notification to user for withdrawal update
      WebSocketService.broadcastToUser(withdrawal.userId, {
        type: "balance_update",
        userId: withdrawal.userId,
        data: {
          transaction: {
            type: "withdrawal",
            amount: withdrawal.amount,
            status: newStatus.toLowerCase(),
            note: validatedInput.note,
          },
        },
      });

      // Send real-time notification to admin for transaction update
      WebSocketService.broadcastToAllAdmins({
        type: "new_transaction",
        operatorId: operatorId,
        data: {
          transactionType: "withdrawal",
          userId: withdrawal.userId,
          amount: withdrawal.amount,
          status: newStatus.toLowerCase(),
        },
      });
    });
  }
}
