import { Hono } from "hono";
import { auth } from "../config/auth";
import { TransactionService } from "../services/transactionService";
import { WebhookService } from "../services/webhookService";
import { z } from "zod";
import type { AppBindings } from "../types";

const app = new Hono<{ Variables: AppBindings }>();

// Zod schemas
const DepositInitiateSchema = z.object({
  operatorId: z.string().uuid("Invalid operator ID"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  paymentMethod: z.string().min(1, "Payment method is required"),
});

const WebhookSchema = z.object({
  provider: z.string(),
  signature: z.string(),
  body: z.string(),
});

// POST /deposits - Initiate deposit
app.post("/deposits", async (c) => {
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
    const validatedData = DepositInitiateSchema.parse(body);

    // Generate reference ID
    const referenceId = crypto.randomUUID();

    // Initiate deposit
    const result = await TransactionService.initiateDeposit({
      userId: session.user.id,
      operatorId: validatedData.operatorId,
      amount: validatedData.amount,
      paymentMethod: validatedData.paymentMethod,
      referenceId,
    });

    // Return deposit instructions based on payment method
    const instructions = getPaymentInstructions(
      validatedData.paymentMethod,
      referenceId,
      validatedData.amount
    );

    return c.json({
      depositId: result.depositId,
      referenceId,
      status: "PENDING",
      instructions,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }
    console.error("Deposit initiation error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /webhooks/:provider - Complete deposit via webhook
app.post("/webhooks/:provider", async (c) => {
  try {
    const provider = c.req.param("provider");

    // Get raw body and signature
    const rawBody = await c.req.text();
    const signature =
      c.req.header("X-Signature") || c.req.header("X-CashApp-Signature") || "";

    // Validate webhook signature
    const secret = WebhookService.getWebhookSecret(provider);
    const isValid = WebhookService.validateWebhook({
      provider,
      signature,
      body: rawBody,
      secret,
    });

    if (!isValid) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    // Parse webhook data
    const webhookData = WebhookService.parseCashAppWebhook(rawBody);
    const transactionData = WebhookService.extractTransactionData(
      provider,
      webhookData
    );

    if (!transactionData.isSuccess) {
      return c.json({ status: "ignored" }, 200); // Ignore non-success webhooks
    }

    // Complete deposit
    await TransactionService.completeDeposit({
      provider,
      transactionId: transactionData.transactionId,
      amount: transactionData.amount,
      externalId: transactionData.externalId,
    });

    return c.json({ status: "processed" }, 200);
  } catch (error) {
    console.error("Webhook processing error:", error);
    return c.json({ error: "Webhook processing failed" }, 500);
  }
});

// Helper function to get payment instructions
function getPaymentInstructions(
  paymentMethod: string,
  referenceId: string,
  amount: number
): object {
  switch (paymentMethod) {
    case "cashapp":
      return {
        method: "cashapp",
        tag: "$cashflowgaming", // Configurable
        amount: amount,
        note: `Deposit ${referenceId}`,
        instructions:
          "Send the exact amount to the CashApp tag above with the deposit reference in the note.",
      };
    case "in_store_cash":
      return {
        method: "in_store_cash",
        amount: amount,
        barcode: referenceId, // Could be used to generate barcode
        instructions:
          "Visit participating store, show this reference ID and pay the exact amount in cash.",
      };
    case "in_store_card":
      return {
        method: "in_store_card",
        amount: amount,
        barcode: referenceId,
        instructions:
          "Visit participating store, show this reference ID and pay using card.",
      };
    default:
      return {
        method: paymentMethod,
        amount: amount,
        referenceId: referenceId,
        instructions:
          "Please follow the specific instructions for this payment method.",
      };
  }
}

export default app;
