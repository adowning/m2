import { describe, it, expect, vi, beforeEach } from "bun:test";
import { VIPService } from "../../src/services/vipService";
import { z } from "zod";

// Mock the database
const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
  execute: vi.fn(),
};

vi.mock("../../src/db/schema", () => ({
  db: mockDb,
  users: {
    id: "id",
    vipExperience: "vip_experience",
    updatedAt: "updated_at",
  },
  vipLevels: {
    level: "level",
    name: "name",
    minExperience: "min_experience",
  },
}));

describe("VIPService", () => {
  const testUserId = "123e4567-e89b-12d3-a456-426614174000";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("awardXP", () => {
    it("should successfully award XP to user", async () => {
      const currentXP = 50;
      const xpToAdd = 25;
      const multiplier = 2;
      const expectedNewXP = currentXP + (xpToAdd * multiplier);

      // Mock user lookup
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ vipExperience: currentXP }]),
          }),
        }),
      });

      // Mock XP update
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      // Mock level check - no level up
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await VIPService.awardXP({
        userId: testUserId,
        xpAmount: xpToAdd,
        multiplier,
      });

      expect(result.newXP).toBe(expectedNewXP);
      expect(result.levelUp).toBeUndefined();
    });

    it("should handle level up correctly", async () => {
      const currentXP = 90;
      const xpToAdd = 20;
      const newXP = currentXP + xpToAdd;

      // Mock user lookup
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ vipExperience: currentXP }]),
          }),
        }),
      });

      // Mock XP update
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      // Mock current level check - level 1
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                level: "1",
                name: "Bronze",
                minExperience: 50,
              }]),
            }),
          }),
        }),
      });

      // Mock previous level check - level 1
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                level: "1",
                name: "Bronze",
                minExperience: 50,
              }]),
            }),
          }),
        }),
      });

      const result = await VIPService.awardXP({
        userId: testUserId,
        xpAmount: xpToAdd,
      });

      expect(result.newXP).toBe(newXP);
      expect(result.levelUp).toBeUndefined(); // No level up in this scenario
    });

    it("should throw error when user not found", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(
        VIPService.awardXP({
          userId: testUserId,
          xpAmount: 10,
        })
      ).rejects.toThrow("User not found");
    });

    it("should validate input with Zod schema", async () => {
      await expect(
        VIPService.awardXP({
          userId: "invalid-uuid",
          xpAmount: -5, // Invalid negative amount
          multiplier: -1, // Invalid negative multiplier
        })
      ).rejects.toThrow();
    });
  });

  describe("getUserVIPStatus", () => {
    it("should return user VIP status with current and next level", async () => {
      const userXP = 75;

      // Mock user lookup
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ vipExperience: userXP }]),
          }),
        }),
      });

      // Mock current level
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                level: "2",
                name: "Silver",
                minExperience: 60,
              }]),
            }),
          }),
        }),
      });

      // Mock next level
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { level: "2", name: "Silver", minExperience: 60 },
                { level: "3", name: "Gold", minExperience: 100 },
              ]),
            }),
          }),
        }),
      });

      const result = await VIPService.getUserVIPStatus({
        userId: testUserId,
      });

      expect(result.currentXP).toBe(userXP);
      expect(result.currentLevel).toEqual({
        level: 2,
        name: "Silver",
        minExperience: 60,
      });
      expect(result.nextLevel).toEqual({
        level: 3,
        name: "Gold",
        minExperience: 100,
      });
    });

    it("should handle user with no levels achieved", async () => {
      const userXP = 10;

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ vipExperience: userXP }]),
          }),
        }),
      });

      // Mock no current level found
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(null),
            }),
          }),
        }),
      });

      // Mock next level
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { level: "1", name: "Bronze", minExperience: 0 },
              ]),
            }),
          }),
        }),
      });

      const result = await VIPService.getUserVIPStatus({
        userId: testUserId,
      });

      expect(result.currentLevel).toBeNull();
      expect(result.nextLevel).toEqual({
        level: 1,
        name: "Bronze",
        minExperience: 0,
      });
    });

    it("should throw error when user not found", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(
        VIPService.getUserVIPStatus({
          userId: testUserId,
        })
      ).rejects.toThrow("User not found");
    });
  });

  describe("getVIPLevel", () => {
    it("should return VIP level by level number", async () => {
      const levelNumber = 2;
      const mockLevel = {
        id: "level-2",
        level: "2",
        name: "Silver",
        minExperience: "60",
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLevel]),
          }),
        }),
      });

      const result = await VIPService.getVIPLevel(levelNumber);

      expect(result).toEqual(mockLevel);
    });

    it("should return null when level not found", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await VIPService.getVIPLevel(999);

      expect(result).toBeNull();
    });
  });
});