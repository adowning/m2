import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { testClient } from "hono/testing";

// Mock the database
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
};

vi.mock("../../src/db/schema", () => ({
  db: mockDb,
  wallets: {
    userId: "user_id",
    operatorId: "operator_id",
    realBalance: "real_balance",
    bonusBalance: "bonus_balance",
  },
  operators: {
    id: "id",
    name: "name",
  },
}));

// Mock auth configuration
const mockAuth = {
  api: {
    signUpEmail: vi.fn(),
    signInEmail: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
  },
};

vi.mock("../../src/config/auth", () => ({
  auth: mockAuth,
}));

// Import after mocking
import { app as authRoutes } from "../../src/routes/auth";

describe("Auth Routes Integration", () => {
  let client: ReturnType<typeof testClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = testClient(authRoutes);
  });

  describe("POST /register", () => {
    it("should successfully register a new user", async () => {
      const userData = {
        email: "test@example.com",
        username: "testuser",
        password: "password123",
        operatorId: "operator-123",
      };

      const mockUser = {
        id: "user-123",
        email: userData.email,
        name: userData.username,
        role: "USER",
      };

      mockAuth.api.signUpEmail.mockResolvedValue({
        error: null,
        data: {
          user: mockUser,
          session: null,
        },
      });

      // Mock operator check
      mockDb.select.mockResolvedValue([{ id: "operator-123", name: "Test Operator" }]);

      // Mock wallet creation
      mockDb.insert.mockResolvedValue([]);

      const response = await client.register.$post({
        json: userData,
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(userData.email);
      expect(result.user.username).toBe(userData.username);
    });

    it("should create wallet when operatorId is provided", async () => {
      const userData = {
        email: "test@example.com",
        username: "testuser",
        password: "password123",
        operatorId: "operator-123",
      };

      const mockUser = {
        id: "user-456",
        email: userData.email,
        name: userData.username,
        role: "USER",
      };

      mockAuth.api.signUpEmail.mockResolvedValue({
        error: null,
        data: {
          user: mockUser,
          session: null,
        },
      });

      mockDb.select.mockResolvedValue([{ id: "operator-123", name: "Test Operator" }]);
      mockDb.insert.mockResolvedValue([]);

      await client.register.$post({
        json: userData,
      });

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          operatorId: userData.operatorId,
          realBalance: "0",
          bonusBalance: "0",
        })
      );
    });

    it("should handle auth registration error", async () => {
      const userData = {
        email: "test@example.com",
        username: "testuser",
        password: "password123",
      };

      mockAuth.api.signUpEmail.mockResolvedValue({
        error: { message: "Email already exists" },
        data: null,
      });

      const response = await client.register.$post({
        json: userData,
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toBe("Email already exists");
    });

    it("should validate invalid email format", async () => {
      const userData = {
        email: "invalid-email",
        username: "testuser",
        password: "password123",
      };

      const response = await client.register.$post({
        json: userData,
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toBe("Validation error");
    });

    it("should validate password length", async () => {
      const userData = {
        email: "test@example.com",
        username: "testuser",
        password: "123", // Too short
      };

      const response = await client.register.$post({
        json: userData,
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toBe("Validation error");
    });

    it("should handle invalid operator ID", async () => {
      const userData = {
        email: "test@example.com",
        username: "testuser",
        password: "password123",
        operatorId: "invalid-operator",
      };

      mockAuth.api.signUpEmail.mockResolvedValue({
        error: null,
        data: {
          user: { id: "user-123", email: userData.email, name: userData.username },
          session: null,
        },
      });

      mockDb.select.mockResolvedValue([]); // No operator found

      const response = await client.register.$post({
        json: userData,
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toBe("Invalid operator ID");
    });
  });

  describe("POST /login", () => {
    it("should successfully login user", async () => {
      const loginData = {
        email: "test@example.com",
        password: "password123",
      };

      const mockUser = {
        id: "user-123",
        email: loginData.email,
        name: "testuser",
        role: "USER",
      };

      const mockSession = {
        id: "session-123",
        userId: mockUser.id,
      };

      mockAuth.api.signInEmail.mockResolvedValue({
        error: null,
        data: {
          user: mockUser,
          session: mockSession,
        },
      });

      const response = await client.login.$post({
        json: loginData,
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(loginData.email);
      expect(result.session).toEqual(mockSession);
    });

    it("should handle login failure", async () => {
      const loginData = {
        email: "test@example.com",
        password: "wrongpassword",
      };

      mockAuth.api.signInEmail.mockResolvedValue({
        error: { message: "Invalid credentials" },
        data: null,
      });

      const response = await client.login.$post({
        json: loginData,
      });

      expect(response.status).toBe(401);
      const result = await response.json();
      expect(result.error).toBe("Invalid credentials");
    });

    it("should validate email format", async () => {
      const loginData = {
        email: "invalid-email",
        password: "password123",
      };

      const response = await client.login.$post({
        json: loginData,
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toBe("Validation error");
    });
  });

  describe("POST /logout", () => {
    it("should successfully logout user", async () => {
      mockAuth.api.signOut.mockResolvedValue({
        error: null,
      });

      const response = await client.logout.$post();

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
    });

    it("should handle logout error", async () => {
      mockAuth.api.signOut.mockResolvedValue({
        error: { message: "Logout failed" },
      });

      const response = await client.logout.$post();

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toBe("Logout failed");
    });
  });

  describe("GET /user", () => {
    it("should return user details when authenticated", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "testuser",
        role: "USER",
      };

      const mockSession = {
        user: mockUser,
        activeOrganizationId: "operator-123",
      };

      mockAuth.api.getSession.mockResolvedValue(mockSession);

      // Mock wallet query
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                operatorId: "operator-123",
                operatorName: "Test Operator",
                realBalance: "100.50",
                bonusBalance: "25.75",
              },
            ]),
          }),
        }),
      });

      const response = await client.user.$get();

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(mockUser.email);
      expect(result.user.balances).toHaveLength(1);
      expect(result.user.balances[0].realBalance).toBe("100.50");
    });

    it("should return unauthorized when no session", async () => {
      mockAuth.api.getSession.mockResolvedValue(null);

      const response = await client.user.$get();

      expect(response.status).toBe(401);
      const result = await response.json();
      expect(result.error).toBe("Unauthorized");
    });
  });
});