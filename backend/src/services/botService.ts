import { db } from "../db/db";
import { users, wallets, operators } from "../db/schema";
import { z } from "zod";
import { faker } from "@faker-js/faker";

// Zod schema for bot creation
const BotCreationSchema = z.object({
  count: z.number().min(1).max(1000),
});

// Bot behavior profiles
export const BOT_PROFILES = {
  CASUAL: {
    name: "casual",
    betFrequency: 300,
    depositFrequency: 3600,
    withdrawalFrequency: 7200,
    avgBetSize: 5,
    betVariance: 2,
  },
  REGULAR: {
    name: "regular",
    betFrequency: 120,
    depositFrequency: 1800,
    withdrawalFrequency: 3600,
    avgBetSize: 10,
    betVariance: 3,
  },
  HIGH_ROLLER: {
    name: "high_roller",
    betFrequency: 60,
    depositFrequency: 900,
    withdrawalFrequency: 1800,
    avgBetSize: 50,
    betVariance: 10,
  },
  WHALE: {
    name: "whale",
    betFrequency: 30,
    depositFrequency: 600,
    withdrawalFrequency: 1200,
    avgBetSize: 200,
    betVariance: 50,
  },
} as const;

export type BotProfile = (typeof BOT_PROFILES)[keyof typeof BOT_PROFILES];

export interface BotUser {
  id: string;
  username: string;
  email: string;
  profile: BotProfile;
  operators: string[]; // Operator IDs this bot uses
}

export class BotService {
  private static bots: BotUser[] = [];

  /**
   * Creates bot users with realistic profiles
   */
  static async createBots(count: number): Promise<BotUser[]> {
    try {
      BotCreationSchema.parse({ count });

      console.log(`Creating ${count} bot users...`);

      // Get all operators
      const allOperators = await db.select().from(operators);

      if (allOperators.length === 0) {
        throw new Error("No operators found. Please seed the database first.");
      }

      const createdBots: BotUser[] = [];

      for (let i = 0; i < count; i++) {
        const bot = await this.createSingleBot(allOperators);
        createdBots.push(bot);
        this.bots.push(bot);
      }

      console.log(`Successfully created ${createdBots.length} bot users`);
      return createdBots;
    } catch (error) {
      console.error("Bot creation failed:", error);
      throw error;
    }
  }

  /**
   * Creates a single bot user
   */
  private static async createSingleBot(
    allOperators: (typeof operators.$inferSelect)[]
  ): Promise<BotUser> {
    // Generate bot profile with varied behaviors
    const profile = this.generateBotProfile();

    // Generate unique username and email
    const username = `bot_${faker.internet.username()}_${Date.now()}`;
    const email = `bot.${username}@casino-seed.com`;

    // Hash a default password for bots
    const passwordHash = await this.hashPassword("BotDefaultPass123!");

    // Create user in database
    const [user] = await db
      .insert(users)
      .values({
        email,
        username,
        passwordHash,
        vipExperience: this.generateInitialVipExperience(profile),
      })
      .returning();

    // Assign bot to random operators (1-3 operators per bot)
    const assignedOperators = faker.helpers.arrayElements(
      allOperators,
      faker.number.int({ min: 1, max: Math.min(3, allOperators.length) })
    );

    // Create wallets for assigned operators
    for (const operator of assignedOperators) {
      await db.insert(wallets).values({
        userId: user.id,
        operatorId: operator.id,
        realBalance: this.generateInitialBalance(profile),
        bonusBalance: this.generateInitialBonusBalance(profile),
      });
    }

    const botUser: BotUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      profile,
      operators: assignedOperators.map((op) => op.id),
    };

    return botUser;
  }

  /**
   * Generates a bot profile based on realistic distribution
   */
  private static generateBotProfile(): BotProfile {
    const rand = Math.random();

    // Distribution: 70% casual, 20% regular, 8% high roller, 2% whale
    if (rand < 0.7) return BOT_PROFILES.CASUAL;
    if (rand < 0.9) return BOT_PROFILES.REGULAR;
    if (rand < 0.98) return BOT_PROFILES.HIGH_ROLLER;
    return BOT_PROFILES.WHALE;
  }

  /**
   * Generates initial VIP experience based on profile
   */
  private static generateInitialVipExperience(profile: BotProfile): string {
    const baseExp = {
      [BOT_PROFILES.CASUAL.name]: 0,
      [BOT_PROFILES.REGULAR.name]: 500,
      [BOT_PROFILES.HIGH_ROLLER.name]: 2500,
      [BOT_PROFILES.WHALE.name]: 10000,
    };

    const variance = Math.random() * 0.5 - 0.25; // ±25% variance
    const base = baseExp[profile.name];
    return Math.max(0, Math.floor(base * (1 + variance))).toString();
  }

  /**
   * Generates initial real balance based on profile
   */
  private static generateInitialBalance(profile: BotProfile): string {
    const baseBalance = {
      [BOT_PROFILES.CASUAL.name]: 50,
      [BOT_PROFILES.REGULAR.name]: 200,
      [BOT_PROFILES.HIGH_ROLLER.name]: 1000,
      [BOT_PROFILES.WHALE.name]: 5000,
    };

    const base = baseBalance[profile.name];
    const variance = Math.random() * 0.8 - 0.4; // ±40% variance
    return Math.max(0, base * (1 + variance)).toFixed(2);
  }

  /**
   * Generates initial bonus balance based on profile
   */
  private static generateInitialBonusBalance(profile: BotProfile): string {
    const bonusChance = {
      [BOT_PROFILES.CASUAL.name]: 0.1,
      [BOT_PROFILES.REGULAR.name]: 0.3,
      [BOT_PROFILES.HIGH_ROLLER.name]: 0.5,
      [BOT_PROFILES.WHALE.name]: 0.7,
    };

    if (Math.random() > bonusChance[profile.name]) {
      return "0";
    }

    const baseBonus = {
      [BOT_PROFILES.CASUAL.name]: 10,
      [BOT_PROFILES.REGULAR.name]: 50,
      [BOT_PROFILES.HIGH_ROLLER.name]: 200,
      [BOT_PROFILES.WHALE.name]: 1000,
    };

    const base = baseBonus[profile.name];
    return (base * (0.5 + Math.random())).toFixed(2);
  }

  /**
   * Simple password hashing (in real implementation, use proper hashing)
   */
  private static async hashPassword(password: string): Promise<string> {
    // For seeding purposes, using a simple hash
    // In production, use bcrypt or similar
    const encoder = new TextEncoder();
    const data = encoder.encode(password + "seed-salt");
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Gets all created bots
   */
  static getBots(): BotUser[] {
    return this.bots;
  }

  /**
   * Gets bots by profile type
   */
  static getBotsByProfile(profileName: string): BotUser[] {
    return this.bots.filter((bot) => bot.profile.name === profileName);
  }

  /**
   * Gets total bot count
   */
  static getBotCount(): number {
    return this.bots.length;
  }
}
