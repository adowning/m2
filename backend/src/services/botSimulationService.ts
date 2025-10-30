import { db } from "../db/db";
import {
  betLogs,
  transactions,
  wallets,
  games,
  jackpotPools,
  jackpots,
  users,
} from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  BotService,
  type BotUser,
  BOT_PROFILES,
  type BotProfile,
} from "./botService";

// Simulation state
interface SimulationState {
  isRunning: boolean;
  botsActive: number;
  totalActions: number;
  startTime: Date | null;
  duration: number;
  intensity: "low" | "medium" | "high";
  intervalId: NodeJS.Timeout | null;
}

export class BotSimulationService {
  private static state: SimulationState = {
    isRunning: false,
    botsActive: 0,
    totalActions: 0,
    startTime: null,
    duration: 0,
    intensity: "medium",
    intervalId: null,
  };

  private static readonly ACTION_INTERVALS = {
    low: 5000, // 5 seconds
    medium: 2000, // 2 seconds
    high: 500, // 0.5 seconds
  };

  /**
   * Starts the bot simulation
   */
  static startSimulation(
    durationSeconds: number,
    intensity: "low" | "medium" | "high" = "medium"
  ): void {
    if (this.state.isRunning) {
      throw new Error("Simulation is already running");
    }

    console.log(
      `Starting bot simulation for ${durationSeconds} seconds at ${intensity} intensity`
    );

    this.state.isRunning = true;
    this.state.startTime = new Date();
    this.state.duration = durationSeconds;
    this.state.intensity = intensity;
    this.state.totalActions = 0;
    this.state.botsActive = BotService.getBotCount();

    if (this.state.botsActive === 0) {
      throw new Error(
        "No bots available. Please create bots first using /seed/bots"
      );
    }

    // Start the simulation loop
    this.state.intervalId = setInterval(() => {
      this.performSimulationStep();
    }, this.ACTION_INTERVALS[intensity]);

    // Schedule simulation end
    setTimeout(() => {
      this.stopSimulation();
    }, durationSeconds * 1000);
  }

  /**
   * Stops the bot simulation
   */
  static stopSimulation(): boolean {
    if (!this.state.isRunning) {
      return false;
    }

    console.log(
      `Stopping bot simulation. Total actions: ${this.state.totalActions}`
    );

    if (this.state.intervalId) {
      clearInterval(this.state.intervalId);
      this.state.intervalId = null;
    }

    this.state.isRunning = false;
    this.state.startTime = null;
    this.state.botsActive = 0;

    return true;
  }

  /**
   * Gets the current simulation status
   */
  static getStatus(): Omit<SimulationState, "intervalId"> {
    return {
      isRunning: this.state.isRunning,
      botsActive: this.state.botsActive,
      totalActions: this.state.totalActions,
      startTime: this.state.startTime,
      duration: this.state.duration,
      intensity: this.state.intensity,
    };
  }

  /**
   * Performs one step of the simulation
   */
  private static async performSimulationStep(): Promise<void> {
    try {
      const bots = BotService.getBots();

      // Select random subset of bots to act (20-50% based on intensity)
      const activeRatio = {
        low: 0.2,
        medium: 0.35,
        high: 0.5,
      };

      const numActiveBots = Math.max(
        1,
        Math.floor(bots.length * activeRatio[this.state.intensity])
      );
      const activeBots = this.getRandomElements(bots, numActiveBots);

      for (const bot of activeBots) {
        await this.performBotAction(bot);
        this.state.totalActions++;
      }
    } catch (error) {
      console.error("Simulation step error:", error);
    }
  }

  /**
   * Performs a random action for a bot
   */
  private static async performBotAction(bot: BotUser): Promise<void> {
    const actionType = this.chooseActionType(bot.profile);

    switch (actionType) {
      case "bet":
        await this.performBetAction(bot);
        break;
      case "deposit":
        await this.performDepositAction(bot);
        break;
      case "withdraw":
        await this.performWithdrawAction(bot);
        break;
    }
  }

  /**
   * Chooses what action a bot should perform based on profile
   */
  private static chooseActionType(
    profile: BotProfile
  ): "bet" | "deposit" | "withdraw" {
    // Weight actions based on profile
    const weights = {
      [BOT_PROFILES.CASUAL.name]: { bet: 0.9, deposit: 0.08, withdraw: 0.02 },
      [BOT_PROFILES.REGULAR.name]: { bet: 0.85, deposit: 0.1, withdraw: 0.05 },
      [BOT_PROFILES.HIGH_ROLLER.name]: {
        bet: 0.8,
        deposit: 0.15,
        withdraw: 0.05,
      },
      [BOT_PROFILES.WHALE.name]: { bet: 0.75, deposit: 0.2, withdraw: 0.05 },
    };

    const profileWeights = weights[profile.name];
    const rand = Math.random();

    if (rand < profileWeights.bet) return "bet";
    if (rand < profileWeights.bet + profileWeights.deposit) return "deposit";
    return "withdraw";
  }

  /**
   * Performs a bet action for a bot
   */
  private static async performBetAction(bot: BotUser): Promise<void> {
    try {
      // Select random operator and game
      const operatorId = this.getRandomElement(bot.operators);
      const game = await this.getRandomGame();

      if (!game) return;

      // Get bot's wallet for this operator
      const [wallet] = await db
        .select()
        .from(wallets)
        .where(
          and(eq(wallets.userId, bot.id), eq(wallets.operatorId, operatorId))
        )
        .limit(1);

      if (!wallet) return;

      // Calculate bet amount based on profile
      const betAmount = this.calculateBetAmount(
        bot.profile,
        parseFloat(wallet.realBalance),
        parseFloat(wallet.bonusBalance)
      );

      if (betAmount <= 0) return;

      // Determine bet type (real or bonus)
      const betType: "real" | "bonus" = Math.random() < 0.7 ? "real" : "bonus";
      const balanceField = betType === "real" ? "realBalance" : "bonusBalance";
      const currentBalance = parseFloat(wallet[balanceField]);

      if (currentBalance < betAmount) {
        // Not enough balance, skip bet
        return;
      }

      // Simulate RNG outcome
      const outcome = this.simulateGameOutcome(parseInt(game.rtp));
      const winAmount = outcome.win
        ? this.calculateWinAmount(betAmount, outcome.multiplier)
        : 0;

      // Update balances
      const newBalance = currentBalance - betAmount + winAmount;
      const ggrContribution = betAmount - winAmount;

      await db
        .update(wallets)
        .set({
          [balanceField]: newBalance.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, wallet.id));

      // Calculate jackpot contribution if applicable
      let jackpotContribution = 0;
      if (game.jackpotGroup) {
        jackpotContribution = betAmount * 0.01; // 1% contribution
        await this.updateJackpotPool(game.jackpotGroup, jackpotContribution);
      }

      // Calculate VIP points (1 point per $1 wagered)
      const vipPointsAdded = betAmount;

      // Update user VIP experience
      await db
        .update(users)
        .set({
          vipExperience: sql`${users.vipExperience} + ${vipPointsAdded.toFixed(
            2
          )}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, bot.id));

      // Log the bet
      await db.insert(betLogs).values({
        userId: bot.id,
        operatorId: operatorId,
        gameId: game.id,
        wager: betAmount.toFixed(2),
        win: winAmount.toFixed(2),
        betType,
        preRealBalance:
          betType === "real" ? currentBalance.toFixed(2) : wallet.realBalance,
        postRealBalance:
          betType === "real" ? newBalance.toFixed(2) : wallet.realBalance,
        preBonusBalance:
          betType === "bonus" ? currentBalance.toFixed(2) : wallet.bonusBalance,
        postBonusBalance:
          betType === "bonus" ? newBalance.toFixed(2) : wallet.bonusBalance,
        jackpotContribution: jackpotContribution.toFixed(2),
        vipPointsAdded: vipPointsAdded.toFixed(2),
        ggrContribution: ggrContribution.toFixed(2),
      });

      // Check for jackpot win (rare event)
      if (outcome.jackpot && game.jackpotGroup) {
        await this.awardJackpot(bot.id, operatorId, game.id, game.jackpotGroup);
      }
    } catch (error) {
      console.error(`Bet action failed for bot ${bot.username}:`, error);
    }
  }

  /**
   * Performs a deposit action for a bot
   */
  private static async performDepositAction(bot: BotUser): Promise<void> {
    try {
      const operatorId = this.getRandomElement(bot.operators);
      const depositAmount = this.calculateDepositAmount(bot.profile);

      // Create transaction
      await db.insert(transactions).values({
        userId: bot.id,
        operatorId,
        type: "deposit",
        amount: depositAmount.toFixed(2),
        status: "completed",
        paymentMethod: "cashapp",
        externalId: `seed_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
      });

      // Credit wallet
      await db
        .update(wallets)
        .set({
          realBalance: sql`${wallets.realBalance} + ${depositAmount.toFixed(
            2
          )}`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(wallets.userId, bot.id), eq(wallets.operatorId, operatorId))
        );

      // Add VIP experience for deposit
      const vipBonus = depositAmount * 0.1; // 10% of deposit as XP
      await db
        .update(users)
        .set({
          vipExperience: sql`${users.vipExperience} + ${vipBonus.toFixed(2)}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, bot.id));
    } catch (error) {
      console.error(`Deposit action failed for bot ${bot.username}:`, error);
    }
  }

  /**
   * Performs a withdrawal action for a bot
   */
  private static async performWithdrawAction(bot: BotUser): Promise<void> {
    try {
      const operatorId = this.getRandomElement(bot.operators);

      // Get wallet balance
      const [wallet] = await db
        .select()
        .from(wallets)
        .where(
          and(eq(wallets.userId, bot.id), eq(wallets.operatorId, operatorId))
        )
        .limit(1);

      if (!wallet) return;

      const realBalance = parseFloat(wallet.realBalance);
      if (realBalance <= 10) return; // Minimum balance

      const withdrawAmount = Math.min(
        realBalance * 0.5,
        this.calculateWithdrawAmount(bot.profile)
      );

      // Create transaction
      await db.insert(transactions).values({
        userId: bot.id,
        operatorId,
        type: "withdrawal",
        amount: withdrawAmount.toFixed(2),
        status: "completed",
        paymentMethod: "cashapp",
        externalId: `seed_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
      });

      // Debit wallet
      await db
        .update(wallets)
        .set({
          realBalance: sql`${wallets.realBalance} - ${withdrawAmount.toFixed(
            2
          )}`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(wallets.userId, bot.id), eq(wallets.operatorId, operatorId))
        );
    } catch (error) {
      console.error(`Withdraw action failed for bot ${bot.username}:`, error);
    }
  }

  /**
   * Utility methods
   */
  private static getRandomElements<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  private static getRandomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private static async getRandomGame() {
    const allGames = await db.select().from(games);
    return allGames.length > 0 ? this.getRandomElement(allGames) : null;
  }

  private static calculateBetAmount(
    profile: BotProfile,
    realBalance: number,
    bonusBalance: number
  ): number {
    const totalBalance = realBalance + bonusBalance;
    if (totalBalance < profile.avgBetSize * 0.1) return 0;

    const baseAmount = profile.avgBetSize;
    const variance = (Math.random() - 0.5) * 2 * profile.betVariance;
    const amount = Math.max(0.1, baseAmount + variance);

    return Math.min(amount, totalBalance * 0.1); // Max 10% of balance
  }

  private static simulateGameOutcome(rtp: number): {
    win: boolean;
    multiplier: number;
    jackpot: boolean;
  } {
    const rand = Math.random() * 100;

    if (rand < rtp) {
      // Win - calculate multiplier based on RTP
      const winRand = Math.random();
      let multiplier = 0;

      if (winRand < 0.7) {
        multiplier = 0.5 + Math.random() * 1.5; // Small win
      } else if (winRand < 0.9) {
        multiplier = 2 + Math.random() * 3; // Medium win
      } else {
        multiplier = 5 + Math.random() * 10; // Big win
      }

      return { win: true, multiplier, jackpot: false };
    }

    return { win: false, multiplier: 0, jackpot: Math.random() < 0.0001 }; // Very rare jackpot
  }

  private static calculateWinAmount(
    betAmount: number,
    multiplier: number
  ): number {
    return betAmount * multiplier;
  }

  private static calculateDepositAmount(profile: BotProfile): number {
    const baseAmounts = {
      [BOT_PROFILES.CASUAL.name]: 50,
      [BOT_PROFILES.REGULAR.name]: 200,
      [BOT_PROFILES.HIGH_ROLLER.name]: 1000,
      [BOT_PROFILES.WHALE.name]: 5000,
    };

    const base = baseAmounts[profile.name];
    const variance = Math.random() * 0.6 - 0.3; // ±30% variance
    return Math.max(10, base * (1 + variance));
  }

  private static calculateWithdrawAmount(profile: BotProfile): number {
    const baseAmounts = {
      [BOT_PROFILES.CASUAL.name]: 25,
      [BOT_PROFILES.REGULAR.name]: 100,
      [BOT_PROFILES.HIGH_ROLLER.name]: 500,
      [BOT_PROFILES.WHALE.name]: 2500,
    };

    const base = baseAmounts[profile.name];
    const variance = Math.random() * 0.4 - 0.2; // ±20% variance
    return Math.max(5, base * (1 + variance));
  }

  private static async updateJackpotPool(
    group: string,
    contribution: number
  ): Promise<void> {
    await db
      .update(jackpotPools)
      .set({
        currentValue: sql`${jackpotPools.currentValue} + ${contribution.toFixed(
          2
        )}`,
        updatedAt: new Date(),
      })
      .where(eq(jackpotPools.group, group));
  }

  private static async awardJackpot(
    userId: string,
    operatorId: string,
    gameId: string,
    group: string
  ): Promise<void> {
    const [pool] = await db
      .select()
      .from(jackpotPools)
      .where(eq(jackpotPools.group, group))
      .limit(1);

    if (!pool) return;

    const jackpotAmount = parseFloat(pool.currentValue);

    // Reset pool to seed value
    await db
      .update(jackpotPools)
      .set({
        currentValue: pool.seedValue,
        updatedAt: new Date(),
      })
      .where(eq(jackpotPools.id, pool.id));

    // Award jackpot
    await db.insert(jackpots).values({
      poolId: pool.id,
      userId,
      operatorId,
      gameId,
      amount: jackpotAmount.toFixed(2),
    });

    // Credit winner's wallet
    await db
      .update(wallets)
      .set({
        realBalance: sql`${wallets.realBalance} + ${jackpotAmount.toFixed(2)}`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(wallets.userId, userId), eq(wallets.operatorId, operatorId))
      );

    console.log(
      `Jackpot won! ${jackpotAmount.toFixed(2)} awarded to user ${userId}`
    );
  }
}
