#!/usr/bin/env bun
import { BotService } from '../src/services/botService';

async function main() {
  try {
    const count = parseInt(process.argv[2]) || 100;
    console.log(`🤖 Starting bot creation for ${count} bots...`);
    await BotService.createBots(count);
    console.log(`✅ Bot creation completed successfully. Created ${BotService.getBotCount()} bots`);
  } catch (error) {
    console.error('❌ Bot creation failed:', error);
    process.exit(1);
  }
}

main();