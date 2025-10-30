#!/usr/bin/env bun
import { BotSimulationService } from '../src/services/botSimulationService';
import { BotService } from '../src/services/botService';

async function main() {
  try {
    // Check if bots exist
    const botCount = BotService.getBotCount();
    if (botCount === 0) {
      console.error('❌ No bots found. Please run "bun run seed:bots <count>" first to create bots.');
      process.exit(1);
    }

    const duration = parseInt(process.argv[2]) || 300; // Default 5 minutes
    const intensity = (process.argv[3] as 'low' | 'medium' | 'high') || 'medium';

    console.log(`🚀 Starting bot simulation for ${duration} seconds at ${intensity} intensity...`);
    console.log(`🤖 Using ${botCount} bots for simulation`);

    BotSimulationService.startSimulation(duration, intensity);

    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('\n🛑 Received interrupt signal, stopping simulation...');
      BotSimulationService.stopSimulation();
      process.exit(0);
    });

    // Monitor simulation status
    const monitorInterval = setInterval(() => {
      const status = BotSimulationService.getStatus();
      if (!status.isRunning) {
        clearInterval(monitorInterval);
        console.log('\n✅ Bot simulation completed');
        console.log(`📊 Total actions performed: ${status.totalActions}`);
        process.exit(0);
      } else {
        console.log(`⏰ Simulation running... Actions: ${status.totalActions}, Bots active: ${status.botsActive}`);
      }
    }, 10000); // Log every 10 seconds

  } catch (error) {
    console.error('❌ Bot simulation failed:', error);
    process.exit(1);
  }
}

main();