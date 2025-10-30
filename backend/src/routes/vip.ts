import { Hono } from "hono";
import { auth } from "../config/auth";
import { VIPService } from "../services/vipService";
import { z } from "zod";

const app = new Hono();

// Zod schemas
const AddXPSchema = z.object({
  xpAmount: z.number().nonnegative(),
  multiplier: z.number().positive().default(1),
});

// GET /vip/user - Get user's VIP status
app.get("/vip/user", async (c) => {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Get VIP status
    const vipStatus = await VIPService.getVipStatus({
      userId: session.user.id,
    });

    return c.json(vipStatus);
  } catch (error) {
    console.error("VIP status retrieval error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /vip/add-xp - Add XP to user (internal endpoint)
app.post("/vip/add-xp", async (c) => {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Parse and validate request body
    const body = await c.req.json();
    const validatedData = AddXPSchema.parse(body);

    // Add XP to user
    const result = await VIPService.addXpToUser({
      userId: session.user.id,
      xpAmount: validatedData.xpAmount,
      multiplier: validatedData.multiplier,
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error }, 400);
    }
    console.error("XP addition error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
