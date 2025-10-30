import { Hono } from "hono";
import { z } from "zod";
import { SeedingService } from "../services/seedingService";
import { BotService } from "../services/botService";
import { BotSimulationService } from "../services/botSimulationService";

const app = new Hono();

// Zod schemas for request validation
const SeedDatabaseSchema = z.object({
  confirm: z.literal(true).optional(), // Optional confirmation
});

const CreateBotsSchema = z.object({
  count: z.number().min(1).max(1000).default(100),
});

const SimulateBotsSchema = z.object({
  duration: z.number().min(1).max(3600).default(300), // Duration in seconds, default 5 minutes
  intensity: z.enum(["low", "medium", "high"]).default("medium"),
});

// POST /seed/database - Seed initial database data
app.post("/database", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    SeedDatabaseSchema.parse(body);

    await SeedingService.seedDatabase();

    return c.json({
      success: true,
      message: "Database seeded successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Database seeding error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /seed/bots - Create bot users
app.post("/bots", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const validatedData = CreateBotsSchema.parse(body);

    const createdBots = await BotService.createBots(validatedData.count);

    return c.json({
      success: true,
      message: `Created ${createdBots.length} bot users`,
      bots: createdBots.map(bot => ({
        id: bot.id,
        username: bot.username,
        email: bot.email,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Bot creation error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /seed/simulate - Run bot simulation
app.post("/simulate", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const validatedData = SimulateBotsSchema.parse(body);

    // Start simulation in background
    BotSimulationService.startSimulation(validatedData.duration, validatedData.intensity);

    return c.json({
      success: true,
      message: `Bot simulation started for ${validatedData.duration} seconds at ${validatedData.intensity} intensity`,
      status: "running",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Bot simulation error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /seed/status - Get simulation status
app.get("/status", async (c) => {
  try {
    const status = BotSimulationService.getStatus();

    return c.json({
      isRunning: status.isRunning,
      botsActive: status.botsActive,
      totalActions: status.totalActions,
      startTime: status.startTime,
      duration: status.duration,
      intensity: status.intensity,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /seed/stop - Stop bot simulation
app.post("/stop", async (c) => {
  try {
    const stopped = BotSimulationService.stopSimulation();

    if (stopped) {
      return c.json({
        success: true,
        message: "Bot simulation stopped successfully",
      });
    } else {
      return c.json({
        success: false,
        message: "No active simulation to stop",
      }, 400);
    }
  } catch (error) {
    console.error("Stop simulation error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;