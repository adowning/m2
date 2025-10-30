import { beforeAll, beforeEach, afterAll, afterEach } from "bun:test";
import { db } from "../src/db/schema";
import { sql } from "drizzle-orm";

// Mock external services
export const mockRNGService = {
  generateOutcome: vi.fn(),
};

export const mockWalletService = {
  getWalletBalances: vi.fn(),
  debitFromWallet: vi.fn(),
  creditToWallet: vi.fn(),
};

export const mockVIPService = {
  awardXP: vi.fn(),
};

export const mockVIPRewardService = {
  applyCashback: vi.fn(),
  applyLevelUpRewards: vi.fn(),
};

export const mockJackpotService = {
  calculateContributions: vi.fn(),
  contributeToJackpot: vi.fn(),
  getJackpotValue: vi.fn(),
  awardJackpot: vi.fn(),
};

export const mockWebSocketService = {
  broadcastToUser: vi.fn(),
  broadcastToAllAdmins: vi.fn(),
};

// Setup test database
beforeAll(async () => {
  // Create test database schema if needed
  // This might involve running migrations or setting up in-memory DB
});

afterAll(async () => {
  // Clean up test database
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
});

// Reset mocks and data before each test
beforeEach(() => {
  vi.clearAllMocks();

  // Reset mock implementations to defaults
  mockRNGService.generateOutcome.mockResolvedValue({
    winAmount: 0,
    multiplier: 0,
    isJackpotWin: false,
    outcome: "loss",
  });

  mockWalletService.getWalletBalances.mockResolvedValue({
    realBalance: 100,
    bonusBalance: 50,
  });

  mockWalletService.debitFromWallet.mockResolvedValue({
    realBalance: 90,
    bonusBalance: 50,
  });

  mockWalletService.creditToWallet.mockResolvedValue({
    realBalance: 110,
    bonusBalance: 50,
  });

  mockVIPService.awardXP.mockResolvedValue({
    newXP: 10,
  });

  mockVIPRewardService.applyCashback.mockResolvedValue({
    cashbackAmount: 0,
  });

  mockJackpotService.calculateContributions.mockResolvedValue([]);
});

afterEach(() => {
  // Additional cleanup if needed
});

// Mock the database transaction
vi.mock("../src/db/schema", () => ({
  db: {
    transaction: vi.fn((callback) => callback({
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    })),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  },
}));

// Mock external services
vi.mock("../src/services/rngService", () => ({
  RNGService: mockRNGService,
}));

vi.mock("../src/services/walletService", () => ({
  WalletService: mockWalletService,
}));

vi.mock("../src/services/vipService", () => ({
  VIPService: mockVIPService,
}));

vi.mock("../src/services/vipRewardService", () => ({
  VIPRewardService: mockVIPRewardService,
}));

vi.mock("../src/services/jackpotService", () => ({
  JackpotService: mockJackpotService,
}));

vi.mock("../src/services/websocketService", () => ({
  WebSocketService: mockWebSocketService,
}));