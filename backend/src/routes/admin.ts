import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { AdminService } from '../services/adminService';
import { operatorOnly, authMiddleware } from '../middleware/auth';

const app = new Hono();

// GET /admin/transactions - Get transactions (deposits/withdrawals/bets) filtered by playerId
const GetTransactionsQuerySchema = z.object({
  playerId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

app.get(
  '/admin/transactions',
  authMiddleware,
  operatorOnly,
  zValidator('query', GetTransactionsQuerySchema),
  async (c) => {
    try {
      const user = c.get('user');
      const query = c.req.valid('query');

      // Get operator ID from session's activeOrganizationId
      const session = c.get('session');
      const operatorId = (session as any).activeOrganizationId;
      if (!operatorId) {
        return c.json({ error: 'Operator ID not found in session' }, 400);
      }

      const transactions = await AdminService.getTransactions({
        operatorId,
        ...query,
      });

      return c.json({
        success: true,
        data: transactions,
      });
    } catch (error) {
      console.error('Get transactions error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ success: false, error: errorMessage }, 500);
    }
  }
);

// GET /admin/games/:id/performance - Get game performance (wagers/wins/RTP per player)
app.get(
  '/admin/games/:id/performance',
  authMiddleware,
  operatorOnly,
  async (c) => {
    try {
      const user = c.get('user');
      const gameId = c.req.param('id');

      // Validate gameId
      const gameIdSchema = z.string().uuid();
      gameIdSchema.parse(gameId);

      // Get operator ID from session's activeOrganizationId
      const session = c.get('session');
      const operatorId = (session as any).activeOrganizationId;
      if (!operatorId) {
        return c.json({ error: 'Operator ID not found in session' }, 400);
      }

      const performance = await AdminService.getGamePerformance(operatorId, gameId);

      return c.json({
        success: true,
        data: performance,
      });
    } catch (error) {
      console.error('Get game performance error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ success: false, error: errorMessage }, 500);
    }
  }
);

// GET /admin/rtp - Get RTP data with game/player filtering
const GetRTPQuerySchema = z.object({
  gameId: z.string().uuid().optional(),
  playerId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

app.get(
  '/admin/rtp',
  authMiddleware,
  operatorOnly,
  zValidator('query', GetRTPQuerySchema),
  async (c) => {
    try {
      const user = c.get('user');
      const query = c.req.valid('query');

      // Get operator ID from session's activeOrganizationId
      const session = c.get('session');
      const operatorId = (session as any).activeOrganizationId;
      if (!operatorId) {
        return c.json({ error: 'Operator ID not found in session' }, 400);
      }

      const rtpData = await AdminService.getRTP({
        operatorId,
        ...query,
      });

      return c.json({
        success: true,
        data: rtpData,
      });
    } catch (error) {
      console.error('Get RTP error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ success: false, error: errorMessage }, 500);
    }
  }
);

// GET /admin/financials - Get financial overview (balances/GGR/affiliate payouts)
app.get(
  '/admin/financials',
  authMiddleware,
  operatorOnly,
  async (c) => {
    try {
      const user = c.get('user');

      // Get operator ID from session's activeOrganizationId
      const session = c.get('session');
      const operatorId = (session as any).activeOrganizationId;
      if (!operatorId) {
        return c.json({ error: 'Operator ID not found in session' }, 400);
      }

      const financials = await AdminService.getFinancials(operatorId);

      return c.json({
        success: true,
        data: financials,
      });
    } catch (error) {
      console.error('Get financials error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ success: false, error: errorMessage }, 500);
    }
  }
);

export { app as adminRoutes };