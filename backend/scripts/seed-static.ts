#!/usr/bin/env bun
import { SeedingService } from '../src/services/seedingService';

async function main() {
  try {
    console.log('🌱 Starting static database seeding...');
    await SeedingService.seedDatabase();
    console.log('✅ Static database seeding completed successfully');
  } catch (error) {
    console.error('❌ Static database seeding failed:', error);
    process.exit(1);
  }
}

main();