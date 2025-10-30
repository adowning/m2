import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { BetService } from "../services/betService";
import { authMiddleware } from "../middleware/auth";
import type { AppBindings } from "../types";

const app = new Hono<{ Variables: AppBindings }>();

// POST /bets - Place a bet
const PlaceBetRequestSchema = z.object({
  gameId: z.string().uuid(),
  wager: z.number().positive(),
});

app.post(
  "/bets",
  authMiddleware,
  zValidator("json", PlaceBetRequestSchema),
  async (c) => {
    try {
      const user = c.get("user"); // From auth middleware
      const body = c.req.valid("json");

      // Get operator ID from session or user context
      // For now, assume it's passed or default - in real implementation, get from session
      const operatorId = c.req.header("X-Operator-ID") || "default-operator-id";

      const result = await BetService.placeBet({
        userId: user.id,
        operatorId,
        gameId: body.gameId,
        wager: body.wager,
      });

      return c.json({
        success: true,
        data: {
          outcome: result.outcome,
          balances: result.balances,
          vipUpdate: result.vipUpdate,
          wageringProgress: result.wageringProgress,
          jackpotContribution: result.jackpotContribution,
          betId: result.betLogId,
        },
      });
    } catch (error) {
      console.error("Bet placement error:", error);

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        400
      );
    }
  }
);

export { app as betsRoutes };
