import { Hono } from "hono";
import { auth } from "../config/auth";
import { TransactionService } from "../services/transactionService";
import { z } from "zod";

const app = new Hono();

// Zod schemas
const WithdrawalRequestSchema = z.object({
  operatorId: z.string().uuid("Invalid operator ID"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  payoutMethod: z.string().min(1, "Payout method is required"),
});

const AdminActionSchema = z.object({
  action: z.enum(["approve", "reject"], { errorMap: () => ({ message: "Action must be approve or reject" }) }),
  note: z.string().optional(),
});

// POST /withdrawals - Request withdrawal
app.post("/withdrawals", async (c) => {
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
    const validatedData = WithdrawalRequestSchema.parse(body);

    // Request withdrawal
    const result = await TransactionService.requestWithdrawal({
      userId: session.user.id,
      operatorId: validatedData.operatorId,
      amount: validatedData.amount,
      payoutMethod: validatedData.payoutMethod,
    });

    return c.json({
      withdrawalId: result.withdrawalId,
      status: "PENDING",
      message: "Withdrawal request submitted and is pending admin approval.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Withdrawal request error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PUT /admin/withdrawals/:id - Admin approve/reject withdrawal
app.put("/admin/withdrawals/:id", async (c) => {
  try {
    // Authenticate admin (placeholder - add admin role check)
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check if user is admin (placeholder)
    if (session.user.role !== "ADMIN") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const withdrawalId = c.req.param("id");

    // Parse and validate request body
    const body = await c.req.json();
    const validatedData = AdminActionSchema.parse(body);

    // Process withdrawal
    await TransactionService.processWithdrawal({
      withdrawalId,
      action: validatedData.action,
      note: validatedData.note,
      adminId: session.user.id,
    });

    const status = validatedData.action === "approve" ? "COMPLETED" : "REJECTED";

    return c.json({
      withdrawalId,
      status,
      message: `Withdrawal ${validatedData.action}d successfully.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Admin withdrawal processing error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /admin/withdrawals - List pending withdrawals (admin only)
app.get("/admin/withdrawals", async (c) => {
  try {
    // Authenticate admin
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session || session.user.role !== "ADMIN") {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Placeholder - implement withdrawal listing from database
    // This would typically query the withdrawals table with status = 'PENDING'

    return c.json({
      withdrawals: [], // Placeholder
      message: "List pending withdrawals endpoint - implement database query",
    });
  } catch (error) {
    console.error("List withdrawals error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;