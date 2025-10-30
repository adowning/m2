import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { adminOnly, userOnly } from "../middleware/auth";
import { GameService, type CreateGameInput, type UpdateGameInput } from "../services/gameService";

const app = new Hono();

// Zod schemas for validation
const CreateGameSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().optional(), // Category name for filtering, but in schema it's categoryId UUID
  provider: z.string().min(1, "Provider is required"),
  rtp: z.number().min(0).max(100, "RTP must be between 0 and 100"),
  jackpotGroup: z.string().nullable().optional(),
  minBet: z.number().min(0, "Min bet must be positive"),
  maxBet: z.number().min(0, "Max bet must be positive"),
  paytable: z.unknown(), // JSONB
});

const UpdateGameSchema = CreateGameSchema.partial();

// POST /games - Create game (admin-only)
app.post(
  "/games",
  adminOnly,
  zValidator("json", CreateGameSchema),
  async (c) => {
    try {
      const body = c.req.valid("json");

      // Convert to service input - need to handle category lookup
      const input: CreateGameInput = {
        name: body.name,
        categoryId: null, // For now, will need to lookup category by name
        provider: body.provider,
        rtp: body.rtp,
        jackpotGroup: body.jackpotGroup || null,
        minBet: body.minBet,
        maxBet: body.maxBet,
        paytable: body.paytable,
      };

      const game = await GameService.createGame(input);

      return c.json({ game }, 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: "Validation error", details: error.errors }, 400);
      }
      console.error("Error creating game:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  }
);

// GET /games - List games (user auth required)
app.get("/games", userOnly, async (c) => {
  try {
    const category = c.req.query("category");

    const games = await GameService.getGames(category);

    return c.json({ games });
  } catch (error) {
    console.error("Error fetching games:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PUT /games/:id - Update game (admin-only)
app.put(
  "/games/:id",
  adminOnly,
  zValidator("json", UpdateGameSchema),
  async (c) => {
    try {
      const id = c.req.param("id");
      const body = c.req.valid("json");

      const input: UpdateGameInput = {
        name: body.name,
        provider: body.provider,
        rtp: body.rtp,
        jackpotGroup: body.jackpotGroup,
        minBet: body.minBet,
        maxBet: body.maxBet,
        paytable: body.paytable,
      };

      const game = await GameService.updateGame(id, input);

      if (!game) {
        return c.json({ error: "Game not found" }, 404);
      }

      return c.json({ game });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: "Validation error", details: error.errors }, 400);
      }
      console.error("Error updating game:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  }
);

// DELETE /games/:id - Delete game (admin-only)
app.delete("/games/:id", adminOnly, async (c) => {
  try {
    const id = c.req.param("id");

    const deleted = await GameService.deleteGame(id);

    if (!deleted) {
      return c.json({ error: "Game not found" }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting game:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /categories - List categories (user auth required)
app.get("/categories", userOnly, async (c) => {
  try {
    const categories = await GameService.getGameCategories();
    return c.json({ categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /admin/categories - Create category (admin-only)
app.post(
  "/admin/categories",
  adminOnly,
  zValidator("json", z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
  })),
  async (c) => {
    try {
      const body = c.req.valid("json");

      const category = await GameService.createGameCategory({
        name: body.name,
        description: body.description,
      });

      return c.json({ category }, 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: "Validation error", details: error.errors }, 400);
      }
      console.error("Error creating category:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  }
);

export default app;