import { describe, it, expect, vi, beforeEach } from "bun:test";
import { testClient } from "hono/testing";
import { TransactionService } from "../../src/services/transactionService";
import WebhookService from "../../src/services/webhookService";

// Mock dependencies
vi.mock("../../src/services/transactionService");
vi.mock("../../src/services/webhookService");

const mockAuth = {
  api: {
    getSession: vi.fn(),
  },
};

vi.mock("../../src/config/auth", () => ({
  auth: mockAuth,
}));

// Import after mocking
import depositsRoutes from "../../src/routes/deposits";

describe("Deposits Routes Integration", () => {
  let client: ReturnType<typeof testClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = testClient(depositsRoutes);
  });

  describe("POST /deposits", () => {
    it("should successfully initiate a deposit", async () => {
      const depositData = {
        operatorId: "operator-123",
        amount: 100,
        paymentMethod: "cashapp",
      };

      const mockSession = {
        user: { id: "user-123" },
      };

      mockAuth.api.getSession.mockResolvedValue(mockSession);

      const mockInitiateResult = { depositId: "deposit-456" };
      TransactionService.initiateDeposit = vi.fn().mockResolvedValue(mockInitiateResult);

      // Mock crypto.randomUUID
      global.crypto = {
        randomUUID: vi.fn().mockReturnValue("reference-789"),
      };

      const response = await client.deposits.$post({
        json: depositData,
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.depositId).toBe("deposit-456");
      expect(result.referenceId).toBe("reference-789");
      expect(result.status).toBe("PENDING");
      expect(result.instructions.method).toBe("cashapp");
      expect(TransactionService.initiateDeposit).toHaveBeenCalledWith({
        userId: "user-123",
        operatorId: "operator-123",
        amount: 100,
        paymentMethod: "cashapp",
        referenceId: "reference-789",
      });
    });

    it("should return correct instructions for different payment methods", async () => {
      const testCases = [
        {
          paymentMethod: "cashapp",
          expectedMethod: "cashapp",
          expectedTag: "$cashflowgaming",
        },
        {
          paymentMethod: "in_store_cash",
          expectedMethod: "in_store_cash",
          expectedBarcode: "reference-123",
        },
        {
          paymentMethod: "in_store_card",
          expectedMethod: "in_store_card",
          expectedBarcode: "reference-123",
        },
        {
          paymentMethod: "unknown_method",
          expectedMethod: "unknown_method",
          expectedReferenceId: "reference-123",
        },
      ];

      for (const testCase of testCases) {
        const depositData = {
          operatorId: "operator-123",
          amount: 50,
          paymentMethod: testCase.paymentMethod,
        };

        mockAuth.api.getSession.mockResolvedValue({
          user: { id: "user-123" },
        });

        TransactionService.initiateDeposit = vi.fn().mockResolvedValue({ depositId: "deposit-123" });

        global.crypto = {
          randomUUID: vi.fn().mockReturnValue("reference-123"),
        };

        const response = await client.deposits.$post({
          json: depositData,
        });

        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.instructions.method).toBe(testCase.expectedMethod);
      }
    });

    it("should handle unauthorized access", async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const response = await client.deposits.$post({
        json: {
          operatorId: "operator-123",
          amount: 100,
          paymentMethod: "cashapp",
        },
      });

      expect(response.status).toBe(401);
      const result = await response.json();
      expect(result.error).toBe("Unauthorized");
    });

    it("should validate input data", async () => {
      mockAuth.api.getSession.mockResolvedValue({
        user: { id: "user-123" },
      });

      const invalidData = {
        operatorId: "invalid-uuid",
        amount: -50, // Invalid negative amount
        paymentMethod: "", // Invalid empty payment method
      };

      const response = await client.deposits.$post({
        json: invalidData,
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toBe("Validation error");
    });
  });

  describe("POST /webhooks/:provider", () => {
    it("should successfully process valid webhook", async () => {
      const provider = "cashapp";
      const rawBody = '{"transaction":{"id":"txn-123","amount":100,"status":"success"}}';
      const signature = "valid-signature";

      WebhookService.getWebhookSecret = vi.fn().mockReturnValue("secret-key");
      WebhookService.validateWebhook = vi.fn().mockReturnValue(true);
      WebhookService.parseCashAppWebhook = vi.fn().mockReturnValue({
        transaction: { id: "txn-123", amount: 100, status: "success" },
      });
      WebhookService.extractTransactionData = vi.fn().mockReturnValue({
        isSuccess: true,
        transactionId: "ref-123",
        amount: 100,
        externalId: "ext-456",
      });

      TransactionService.completeDeposit = vi.fn().mockResolvedValue(undefined);

      const response = await client.webhooks[":provider"].$post({
        param: { provider },
        body: rawBody,
        headers: {
          "X-Signature": signature,
        },
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.status).toBe("processed");
      expect(WebhookService.validateWebhook).toHaveBeenCalledWith({
        provider,
        signature,
        body: rawBody,
        secret: "secret-key",
      });
      expect(TransactionService.completeDeposit).toHaveBeenCalledWith({
        provider,
        transactionId: "ref-123",
        amount: 100,
        externalId: "ext-456",
      });
    });

    it("should reject webhook with invalid signature", async () => {
      const provider = "cashapp";
      const rawBody = '{"transaction":{"id":"txn-123","amount":100}}';
      const signature = "invalid-signature";

      WebhookService.validateWebhook = vi.fn().mockReturnValue(false);

      const response = await client.webhooks[":provider"].$post({
        param: { provider },
        body: rawBody,
        headers: {
          "X-Signature": signature,
        },
      });

      expect(response.status).toBe(401);
      const result = await response.json();
      expect(result.error).toBe("Invalid signature");
    });

    it("should ignore non-success webhooks", async () => {
      const provider = "cashapp";
      const rawBody = '{"transaction":{"id":"txn-123","amount":100,"status":"failed"}}';

      WebhookService.getWebhookSecret = vi.fn().mockReturnValue("secret-key");
      WebhookService.validateWebhook = vi.fn().mockReturnValue(true);
      WebhookService.parseCashAppWebhook = vi.fn().mockReturnValue({
        transaction: { id: "txn-123", amount: 100, status: "failed" },
      });
      WebhookService.extractTransactionData = vi.fn().mockReturnValue({
        isSuccess: false,
        transactionId: "ref-123",
        amount: 100,
        externalId: "ext-456",
      });

      const response = await client.webhooks[":provider"].$post({
        param: { provider },
        body: rawBody,
        headers: {
          "X-Signature": "valid-signature",
        },
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.status).toBe("ignored");
      expect(TransactionService.completeDeposit).not.toHaveBeenCalled();
    });

    it("should handle webhook processing errors", async () => {
      const provider = "cashapp";

      WebhookService.getWebhookSecret = vi.fn().mockReturnValue("secret-key");
      WebhookService.validateWebhook = vi.fn().mockReturnValue(true);
      WebhookService.parseCashAppWebhook = vi.fn().mockImplementation(() => {
        throw new Error("Parsing failed");
      });

      const response = await client.webhooks[":provider"].$post({
        param: { provider },
        body: '{"invalid": "json"}',
        headers: {
          "X-Signature": "valid-signature",
        },
      });

      expect(response.status).toBe(500);
      const result = await response.json();
      expect(result.error).toBe("Webhook processing failed");
    });
  });
});