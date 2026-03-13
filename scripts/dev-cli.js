#!/usr/bin/env node

/**
 * Development CLI tool for Smart Wallets application
 * Usage: node scripts/dev-cli.js [command]
 */

const commands = {
  'health': checkHealth,
  'db': checkDatabase,
  'secrets': generateSecrets,
  'reset': resetApp,
  'deploy': deployCheck,
  'help': showHelp
};

async function checkHealth() {
  try {
    console.log('🔍 Checking application health...');
    const response = await fetch('http://localhost:3001/api/health');
    const data = await response.json();
    console.log('✅ App Status:', data.status);
    console.log('⏱️  Uptime:', Math.round(data.uptime), 'seconds');
  } catch (error) {
    console.log('❌ App not running or unreachable');
    console.log('💡 Try: npm run dev');
  }
}

async function checkDatabase() {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('🔍 Testing database connection...');
    await client.connect();
    await client.query('SELECT 1 as test');
    console.log('✅ Database connected successfully');
    
    const userCount = await client.query('SELECT COUNT(*)::int AS count FROM "User"');
    const walletCount = await client.query('SELECT COUNT(*)::int AS count FROM "Wallet"');
    
    console.log(`👥 Users: ${userCount.rows[0]?.count ?? 0}`);
    console.log(`💳 Wallets: ${walletCount.rows[0]?.count ?? 0}`);
  } catch (error) {
    console.log('❌ Database connection failed:', error.message);
  } finally {
    await client.end().catch(() => {});
  }
}

function generateSecrets() {
  const crypto = require('crypto');
  
  console.log('🔐 Generated secrets for .env:');
  console.log('USER_JWT_SECRET=' + crypto.randomBytes(32).toString('hex'));
  console.log('ADMIN_JWT_SECRET=' + crypto.randomBytes(32).toString('hex'));
  console.log('ENCRYPTION_KEY=' + crypto.randomBytes(32).toString('hex'));
  console.log('CRON_SECRET=' + crypto.randomBytes(16).toString('hex'));
}

async function resetApp() {
  console.log('🔄 Resetting application state...');
  
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  
  try {
    await execAsync('npx prisma generate');
    console.log('✅ Prisma client regenerated');
    
    console.log('💡 To complete reset: npm run dev');
  } catch (error) {
    console.log('❌ Reset failed:', error.message);
  }
}

async function deployCheck() {
  console.log('🚀 Checking deployment readiness...');
  
  const checks = [
    checkEnvVars,
    checkBuild,
    checkTests
  ];
  
  for (const check of checks) {
    await check();
  }
}

function checkEnvVars() {
  console.log('📋 Checking environment variables...');
  const required = ['DATABASE_URL', 'USER_JWT_SECRET', 'ADMIN_JWT_SECRET'];
  
  for (const env of required) {
    if (process.env[env]) {
      console.log(`✅ ${env} - Set`);
    } else {
      console.log(`❌ ${env} - Missing`);
    }
  }
}

async function checkBuild() {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  
  try {
    console.log('🏗️  Testing production build...');
    await execAsync('npm run build');
    console.log('✅ Build successful');
  } catch (error) {
    console.log('❌ Build failed');
  }
}

async function checkTests() {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  
  try {
    console.log('🧪 Running tests...');
    await execAsync('npm test -- --passWithNoTests');
    console.log('✅ Tests passed');
  } catch (error) {
    console.log('❌ Some tests failed');
  }
}

function showHelp() {
  console.log(`
🛠️  Smart Wallets Development CLI

Available commands:
  health    - Check application health
  db        - Test database connection
  secrets   - Generate new secrets
  reset     - Reset application state
  deploy    - Check deployment readiness
  help      - Show this help

Usage: node scripts/dev-cli.js [command]
  `);
}

// Main execution
const command = process.argv[2] || 'help';
const handler = commands[command];

if (handler) {
  handler().catch(console.error);
} else {
  console.log(`❌ Unknown command: ${command}`);
  showHelp();
}