import { db } from "../db/db";
import {
  operators,
  users,
  gameCategories,
  games,
  vipLevels,
  jackpotPools,
  wallets,
} from "../db/schema";
import { z } from "zod";

// Zod schemas for seeding data validation
const OperatorSchema = z.object({
  name: z.string(),
});

const GameCategorySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

const GameSchema = z.object({
  name: z.string(),
  categoryId: z.string().uuid(),
  provider: z.string(),
  rtp: z.number().min(0).max(100),
  jackpotGroup: z.string().optional(),
  minBet: z.number().min(0),
  maxBet: z.number().min(0),
  paytable: z.record(z.any()),
});

const VipLevelSchema = z.object({
  level: z.number().min(1),
  name: z.string(),
  minExperience: z.number().min(0),
  cashbackRate: z.number().min(0).max(100),
  freeSpinsPerMonth: z.number().min(0),
  benefits: z.record(z.any()).optional(),
});

const JackpotPoolSchema = z.object({
  group: z.string(),
  level: z.enum(["mini", "minor", "major", "grand"]),
  seedValue: z.number().min(0),
  contributionRate: z.number().min(0).max(100),
});

export class SeedingService {
  /**
   * Seeds the database with initial static data
   */
  static async seedDatabase(): Promise<void> {
    try {
      console.log("Starting database seeding...");

      // Seed operators
      await this.seedOperators();

      // Seed game categories
      await this.seedGameCategories();

      // Seed games
      await this.seedGames();

      // Seed VIP levels
      await this.seedVipLevels();

      // Seed jackpot pools
      await this.seedJackpotPools();

      console.log("Database seeding completed successfully");
    } catch (error) {
      console.error("Database seeding failed:", error);
      throw error;
    }
  }

  /**
   * Seeds operators
   */
  private static async seedOperators(): Promise<void> {
    const operatorsData = [
      { name: "Casino Deluxe" },
      { name: "Jackpot Palace" },
      { name: "Fortune Casino" },
      { name: "Royal Flush Gaming" },
      { name: "Diamond Slots" },
    ];

    for (const operatorData of operatorsData) {
      OperatorSchema.parse(operatorData);
      await db.insert(operators).values(operatorData).onConflictDoNothing();
    }

    console.log(`Seeded ${operatorsData.length} operators`);
  }

  /**
   * Seeds game categories
   */
  private static async seedGameCategories(): Promise<void> {
    const categoriesData = [
      { name: "Slots", description: "Slot machine games" },
      {
        name: "Table Games",
        description: "Classic table games like blackjack and roulette",
      },
      {
        name: "Live Dealer",
        description: "Live dealer games with real dealers",
      },
      { name: "Video Poker", description: "Video poker machines" },
      { name: "Other", description: "Other game types" },
    ];

    for (const categoryData of categoriesData) {
      GameCategorySchema.parse(categoryData);
      await db
        .insert(gameCategories)
        .values(categoryData)
        .onConflictDoNothing();
    }

    console.log(`Seeded ${categoriesData.length} game categories`);
  }

  /**
   * Seeds games
   */
  private static async seedGames(): Promise<void> {
    // Get category IDs
    const categories = await db.select().from(gameCategories);

    const categoryMap = categories.reduce((acc, cat) => {
      acc[cat.name] = cat.id;
      return acc;
    }, {} as Record<string, string>);

    const gamesData = [
      {
        name: "Mega Fortune",
        categoryId: categoryMap["Slots"],
        provider: "NetEnt",
        rtp: 96.6,
        jackpotGroup: "progressive_main",
        minBet: 1.0,
        maxBet: 100.0,
        paytable: {
          "3x": 5,
          "4x": 50,
          "5x": 500,
          jackpots: ["mini", "minor", "major", "grand"],
        },
      },
      {
        name: "Book of Ra",
        categoryId: categoryMap["Slots"],
        provider: "Novomatic",
        rtp: 96.1,
        minBet: 0.2,
        maxBet: 50.0,
        paytable: {
          "3x": 10,
          "4x": 100,
          "5x": 1000,
        },
      },
      {
        name: "Blackjack Classic",
        categoryId: categoryMap["Table Games"],
        provider: "Evolution",
        rtp: 99.5,
        minBet: 5.0,
        maxBet: 1000.0,
        paytable: {
          blackjack: 1.5,
          win: 1.0,
          push: 0,
          loss: -1,
        },
      },
      {
        name: "European Roulette",
        categoryId: categoryMap["Table Games"],
        provider: "Playtech",
        rtp: 97.3,
        minBet: 1.0,
        maxBet: 500.0,
        paytable: {
          straight: 35,
          split: 17,
          street: 11,
          corner: 8,
          six_line: 5,
          dozen_column: 2,
          red_black: 1,
        },
      },
      {
        name: "Live Baccarat",
        categoryId: categoryMap["Live Dealer"],
        provider: "Evolution",
        rtp: 98.9,
        minBet: 10.0,
        maxBet: 2000.0,
        paytable: {
          banker: 0.95,
          player: 1.0,
          tie: 8.0,
        },
      },
    ];

    for (const gameData of gamesData) {
      GameSchema.parse(gameData);
      await db.insert(games).values(gameData).onConflictDoNothing();
    }

    console.log(`Seeded ${gamesData.length} games`);
  }

  /**
   * Seeds VIP levels
   */
  private static async seedVipLevels(): Promise<void> {
    const vipLevelsData = [
      {
        level: 1,
        name: "Bronze",
        minExperience: 0,
        cashbackRate: 0,
        freeSpinsPerMonth: 0,
        benefits: { multiplier: 1.0 },
      },
      {
        level: 2,
        name: "Silver",
        minExperience: 1000,
        cashbackRate: 2.5,
        freeSpinsPerMonth: 10,
        benefits: { multiplier: 1.1 },
      },
      {
        level: 3,
        name: "Gold",
        minExperience: 5000,
        cashbackRate: 5.0,
        freeSpinsPerMonth: 25,
        benefits: { multiplier: 1.25 },
      },
      {
        level: 4,
        name: "Platinum",
        minExperience: 25000,
        cashbackRate: 7.5,
        freeSpinsPerMonth: 50,
        benefits: { multiplier: 1.5 },
      },
      {
        level: 5,
        name: "Diamond",
        minExperience: 100000,
        cashbackRate: 10.0,
        freeSpinsPerMonth: 100,
        benefits: { multiplier: 2.0 },
      },
    ];

    for (const vipData of vipLevelsData) {
      VipLevelSchema.parse(vipData);
      await db.insert(vipLevels).values(vipData).onConflictDoNothing();
    }

    console.log(`Seeded ${vipLevelsData.length} VIP levels`);
  }

  /**
   * Seeds jackpot pools
   */
  private static async seedJackpotPools(): Promise<void> {
    const poolsData = [
      {
        group: "progressive_main",
        level: "mini",
        seedValue: 10000,
        contributionRate: 2.0,
      },
      {
        group: "progressive_main",
        level: "minor",
        seedValue: 50000,
        contributionRate: 1.0,
      },
      {
        group: "progressive_main",
        level: "major",
        seedValue: 250000,
        contributionRate: 0.5,
      },
      {
        group: "progressive_main",
        level: "grand",
        seedValue: 1000000,
        contributionRate: 0.1,
      },
    ];

    for (const poolData of poolsData) {
      JackpotPoolSchema.parse(poolData);
      await db
        .insert(jackpotPools)
        .values({
          ...poolData,
          currentValue: poolData.seedValue,
        })
        .onConflictDoNothing();
    }

    console.log(`Seeded ${poolsData.length} jackpot pools`);
  }
}
