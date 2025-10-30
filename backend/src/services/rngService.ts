import { z } from "zod";

const GenerateOutcomeSchema = z.object({
  gameId: z.string().uuid(),
  wager: z.number().positive(),
  rtp: z.number().min(0).max(100),
});

export type GenerateOutcome = z.infer<typeof GenerateOutcomeSchema>;

export class RNGService {
  /**
   * Generate game outcome using certified RNG simulation
   * In production, this would integrate with a certified RNG provider
   */
  static async generateOutcome(input: GenerateOutcome): Promise<{
    winAmount: number;
    multiplier: number;
    isJackpotWin: boolean;
    outcome: string; // e.g., "cherry-lemon-lemon" or symbol combination
  }> {
    const validatedInput = GenerateOutcomeSchema.parse(input);

    // Simulate RNG - in production, use certified RNG API
    const randomValue = Math.random();
    const rtpDecimal = validatedInput.rtp / 100;

    // Simple payout calculation based on RTP
    // This is a basic simulation - real implementation would use proper paytables
    let multiplier = 0;
    let outcome = "loss";

    if (randomValue < rtpDecimal) {
      // Win scenario
      const winRandom = Math.random();

      if (winRandom < 0.01) {
        // 1% chance of big win
        multiplier = Math.floor(Math.random() * 50) + 10; // 10x to 60x
        outcome = "big_win";
      } else if (winRandom < 0.1) {
        // 9% chance of medium win
        multiplier = Math.floor(Math.random() * 5) + 2; // 2x to 7x
        outcome = "medium_win";
      } else {
        // 90% chance of small win
        multiplier = Math.random() * 2; // 0x to 2x
        outcome = "small_win";
      }
    }

    const winAmount = validatedInput.wager * multiplier;
    const isJackpotWin = randomValue < 0.0001; // 0.01% chance for jackpot (simplified)

    if (isJackpotWin) {
      // In real implementation, check jackpot pools and award accordingly
      outcome = "jackpot";
      multiplier = 100; // Placeholder - real calculation based on pool
    }

    return {
      winAmount,
      multiplier,
      isJackpotWin,
      outcome,
    };
  }

  /**
   * Validate RTP and game configuration
   */
  static validateGameRTP(rtp: number): boolean {
    return rtp >= 0 && rtp <= 100;
  }

  /**
   * Generate secure random number for certified RNG
   * Placeholder - in production, use cryptographic RNG
   */
  static generateSecureRandom(): number {
    // Use crypto.getRandomValues in browser/Node.js crypto module
    // For now, use Math.random() as simulation
    return Math.random();
  }

  /**
   * Simulate slot machine reels
   * Returns an array of symbols representing the outcome
   */
  static simulateSlotReels(symbols: string[], reelCount: number = 3): string[] {
    if (symbols.length === 0) {
      throw new Error("Symbols array must not be empty");
    }

    const outcome: string[] = [];

    for (let i = 0; i < reelCount; i++) {
      const randomIndex = Math.floor(
        this.generateSecureRandom() * symbols.length
      );
      outcome.push(symbols[randomIndex]!);
    }

    return outcome;
  }

  /**
   * Calculate win based on paytable
   * Simplified implementation - real games have complex paytables
   */
  static calculateWinFromPaytable(
    outcome: string[],
    paytable: Record<string, number>
  ): number {
    const outcomeKey = outcome.join("-");
    return paytable[outcomeKey] || 0;
  }
}
