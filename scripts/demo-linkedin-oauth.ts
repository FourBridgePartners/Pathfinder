#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { LinkedInOAuthService } from '../server/api/linkedin/oauth';
import { syncLinkedInConnectionsForAllUsers, syncLinkedInConnectionsForUser } from '../worker/linkedin/syncLinkedInConnectionsForAllUsers';

dotenv.config();

async function demoLinkedInOAuth() {
  console.log('🚀 LinkedIn OAuth Demo\n');

  // 1. Initialize OAuth Service
  console.log('1. Initializing LinkedIn OAuth Service...');
  const oauthService = new LinkedInOAuthService({
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
    redirectUri: process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3000/api/linkedin/oauth/callback',
    scopes: ['r_liteprofile', 'r_emailaddress', 'w_member_social', 'r_organization_social']
  });

  // 2. Generate Authorization URL
  console.log('2. Generating authorization URL...');
  const state = 'demo-state-' + Date.now();
  const authUrl = oauthService.generateAuthUrl(state);
  console.log(`   Authorization URL: ${authUrl}\n`);

  // 3. Simulate OAuth Flow (with mock data)
  console.log('3. Simulating OAuth flow...');
  console.log('   Note: In a real scenario, the user would:');
  console.log('   - Click the authorization URL');
  console.log('   - Authorize the application on LinkedIn');
  console.log('   - Be redirected back with an authorization code\n');

  // 4. Demo token exchange (with mock data)
  console.log('4. Token exchange simulation...');
  console.log('   Note: This would happen in the OAuth callback handler');
  console.log('   - Exchange authorization code for access token');
  console.log('   - Fetch user profile');
  console.log('   - Store token in Supabase\n');

  // 5. Demo connection sync
  console.log('5. LinkedIn connections sync demo...');
  try {
    console.log('   Starting sync for all users...');
    const syncResult = await syncLinkedInConnectionsForAllUsers();
    
    console.log('   Sync completed:');
    console.log(`   - Total users processed: ${syncResult.totalUsers}`);
    console.log(`   - Total connections processed: ${syncResult.totalProcessed}`);
    console.log(`   - Total errors: ${syncResult.totalErrors}`);
    
    if (syncResult.results.length > 0) {
      console.log('   - Per-user results:');
      syncResult.results.forEach(result => {
        console.log(`     User ${result.userId}: ${result.processed} connections, ${result.errors} errors`);
      });
    }
  } catch (error) {
    console.log('   Sync failed (expected if no tokens are stored):', error instanceof Error ? error.message : error);
  }

  console.log('\n✅ Demo completed!');
  console.log('\n📋 Next steps:');
  console.log('1. Set up LinkedIn OAuth app in LinkedIn Developer Console');
  console.log('2. Configure environment variables:');
  console.log('   - LINKEDIN_CLIENT_ID');
  console.log('   - LINKEDIN_CLIENT_SECRET');
  console.log('   - LINKEDIN_REDIRECT_URI');
  console.log('   - SUPABASE_URL');
  console.log('   - SUPABASE_SERVICE_ROLE_KEY');
  console.log('3. Run the Fastify server: npm run dev:server');
  console.log('4. Visit /connect-linkedin to start OAuth flow');
  console.log('5. Run sync worker to pull connections: npm run sync:linkedin');
}

async function demoIndividualUserSync() {
  console.log('\n🔄 Individual User Sync Demo\n');

  const testUserId = 'demo-user-123';
  
  try {
    console.log(`Syncing connections for user: ${testUserId}`);
    const result = await syncLinkedInConnectionsForUser(testUserId);
    
    console.log('Sync result:');
    console.log(`- Connections processed: ${result.processed}`);
    console.log(`- Errors: ${result.errors}`);
  } catch (error) {
    console.log('Sync failed (expected if user has no valid token):', error instanceof Error ? error.message : error);
  }
}

// Run demos
async function main() {
  await demoLinkedInOAuth();
  await demoIndividualUserSync();
}

if (require.main === module) {
  main().catch(console.error);
} 