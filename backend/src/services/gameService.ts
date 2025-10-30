import { db } from "../db/db";
import { games, gameCategories } from "../db/schema";
import { eq, like, and } from "drizzle-orm";
import { z } from "zod";
import type { Game, GameCategory } from "../db/schema";

const CreateGameInputSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().uuid().nullable(),
  provider: z.string().min(1),
  rtp: z.number().min(0).max(100),
  jackpotGroup: z.string().nullable(),
  minBet: z.number().min(0),
  maxBet: z.number().min(0),
  paytable: z.unknown(),
});

const UpdateGameInputSchema = CreateGameInputSchema.partial();

const CreateGameCategoryInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const UpdateGameCategoryInputSchema = CreateGameCategoryInputSchema.partial();

export type CreateGameInput = z.infer<typeof CreateGameInputSchema>;
export type UpdateGameInput = z.infer<typeof UpdateGameInputSchema>;
export type CreateGameCategoryInput = z.infer<
  typeof CreateGameCategoryInputSchema
>;
export type UpdateGameCategoryInput = z.infer<
  typeof UpdateGameCategoryInputSchema
>;

export class GameService {
  static async createGame(input: CreateGameInput): Promise<Game> {
    const validatedInput = CreateGameInputSchema.parse(input);

    const [game] = await db
      .insert(games)
      .values({
        name: validatedInput.name,
        categoryId: validatedInput.categoryId,
        provider: validatedInput.provider,
        rtp: validatedInput.rtp.toString(),
        jackpotGroup: validatedInput.jackpotGroup,
        minBet: validatedInput.minBet.toString(),
        maxBet: validatedInput.maxBet.toString(),
        paytable: validatedInput.paytable,
      })
      .returning();

    return game;
  }

  static async getGames(category?: string): Promise<Game[]> {
    const whereCondition = category
      ? and(
          eq(games.categoryId, category) // Note: This assumes category is the ID, but PRD says filter by category name
          // Actually looking at schema, categoryId is UUID, so we need to join
        )
      : undefined;

    // For now, just get all games - category filtering needs join
    const gameList = await db.select().from(games);

    // If category filter requested, we need to implement join
    if (category) {
      const filteredGames = await db
        .select()
        .from(games)
        .innerJoin(gameCategories, eq(games.categoryId, gameCategories.id))
        .where(like(gameCategories.name, `%${category}%`));

      return filteredGames.map(({ games: g }) => g);
    }

    return gameList;
  }

  static async getGameById(id: string): Promise<Game | null> {
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, id))
      .limit(1);
    return game || null;
  }

  static async updateGame(
    id: string,
    input: UpdateGameInput
  ): Promise<Game | null> {
    const validatedInput = UpdateGameInputSchema.parse(input);

    const updateData: Partial<typeof games.$inferInsert> = {};

    if (validatedInput.name !== undefined)
      updateData.name = validatedInput.name;
    if (validatedInput.categoryId !== undefined)
      updateData.categoryId = validatedInput.categoryId;
    if (validatedInput.provider !== undefined)
      updateData.provider = validatedInput.provider;
    if (validatedInput.rtp !== undefined)
      updateData.rtp = validatedInput.rtp.toString();
    if (validatedInput.jackpotGroup !== undefined)
      updateData.jackpotGroup = validatedInput.jackpotGroup;
    if (validatedInput.minBet !== undefined)
      updateData.minBet = validatedInput.minBet.toString();
    if (validatedInput.maxBet !== undefined)
      updateData.maxBet = validatedInput.maxBet.toString();
    if (validatedInput.paytable !== undefined)
      updateData.paytable = validatedInput.paytable;

    updateData.updatedAt = new Date();

    const [updatedGame] = await db
      .update(games)
      .set(updateData)
      .where(eq(games.id, id))
      .returning();

    return updatedGame || null;
  }

  static async deleteGame(id: string): Promise<boolean> {
    // Soft delete by setting isActive to false - but schema doesn't have isActive, so hard delete
    const result = await db.delete(games).where(eq(games.id, id));
    return result.rowCount > 0;
  }

  static async getGameCategories(): Promise<GameCategory[]> {
    return await db.select().from(gameCategories);
  }

  static async createGameCategory(
    input: CreateGameCategoryInput
  ): Promise<GameCategory> {
    const validatedInput = CreateGameCategoryInputSchema.parse(input);

    const [category] = await db
      .insert(gameCategories)
      .values({
        name: validatedInput.name,
        description: validatedInput.description,
      })
      .returning();

    return category;
  }

  static async updateGameCategory(
    id: string,
    input: UpdateGameCategoryInput
  ): Promise<GameCategory | null> {
    const validatedInput = UpdateGameCategoryInputSchema.parse(input);

    const updateData: Partial<typeof gameCategories.$inferInsert> = {};

    if (validatedInput.name !== undefined)
      updateData.name = validatedInput.name;
    if (validatedInput.description !== undefined)
      updateData.description = validatedInput.description;

    updateData.updatedAt = new Date();

    const [updatedCategory] = await db
      .update(gameCategories)
      .set(updateData)
      .where(eq(gameCategories.id, id))
      .returning();

    return updatedCategory || null;
  }

  static async deleteGameCategory(id: string): Promise<boolean> {
    const result = await db
      .delete(gameCategories)
      .where(eq(gameCategories.id, id));
    return result.rowCount > 0;
  }
}
