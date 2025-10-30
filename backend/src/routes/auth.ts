import { Hono } from "hono";
import { auth } from "../config/auth";
import { db } from "../db/db";
import { wallets, operators } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppBindings } from "../types";

const app = new Hono<{ Variables: AppBindings }>();

const RegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  operatorId: z.string().uuid().optional(), // Optional operator association
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Register endpoint
app.post("/register", async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = RegisterSchema.parse(body);

    // Create user through Better-Auth
    const result = await auth.api.signUpEmail({
      body: {
        email: validatedData.email,
        password: validatedData.password,
        name: validatedData.username,
      },
    });

    if (result.error) {
      return c.json({ error: result.error.message }, 400);
    }

    // If operatorId provided, create wallet for the user with that operator
    if (validatedData.operatorId) {
      // Check if operator exists
      const operator = await db
        .select()
        .from(operators)
        .where(eq(operators.id, validatedData.operatorId))
        .limit(1);
      if (operator.length === 0) {
        return c.json({ error: "Invalid operator ID" }, 400);
      }

      // Create wallet with default balances
      await db.insert(wallets).values({
        userId: result.data.user.id,
        operatorId: validatedData.operatorId,
        realBalance: "0",
        bonusBalance: "0",
      });
    }

    return c.json({
      user: {
        id: result.data.user.id,
        email: result.data.user.email,
        username: result.data.user.name,
        role: result.data.user.role || "USER",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Login endpoint
app.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = LoginSchema.parse(body);

    const result = await auth.api.signInEmail({
      body: {
        email: validatedData.email,
        password: validatedData.password,
      },
    });

    if (result.error) {
      return c.json({ error: result.error.message }, 401);
    }

    return c.json({
      user: {
        id: result.data.user.id,
        email: result.data.user.email,
        username: result.data.user.name,
        role: result.data.user.role || "USER",
      },
      session: result.data.session,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Logout endpoint
app.post("/logout", async (c) => {
  try {
    const result = await auth.api.signOut({
      headers: c.req.raw.headers,
    });

    if (result.error) {
      return c.json({ error: result.error.message }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Get user details endpoint
app.get("/user", async (c) => {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Get user balances per operator
    const userWallets = await db
      .select({
        operatorId: wallets.operatorId,
        operatorName: operators.name,
        realBalance: wallets.realBalance,
        bonusBalance: wallets.bonusBalance,
      })
      .from(wallets)
      .innerJoin(operators, eq(wallets.operatorId, operators.id))
      .where(eq(wallets.userId, session.user.id));

    // Get user VIP level (placeholder - need to implement VIP logic)
    const vipLevel = 1; // TODO: Calculate based on experience

    return c.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        username: session.user.name,
        role: session.user.role || "USER",
        vipLevel,
        balances: userWallets,
      },
    });
  } catch (error) {
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
