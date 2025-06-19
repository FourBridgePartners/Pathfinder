#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { Command } from 'commander';
import { discoverMutualConnections } from '../server/lib/linkedin/ConnectionDiscoveryManager';
import { PuppeteerConnectionFetcher } from '../server/lib/linkedin/PuppeteerConnectionFetcher';
import { GraphConstructor } from '../graph/construct_graph';
import { 
  getFourBridgeMembers, 
  getFourBridgeMembersForDisplay, 
  getRequiredEnvVars,
  hasFourBridgeMembers 
} from '../server/lib/linkedin/memberHelper';

dotenv.config();

// Default configuration
const DEFAULT_CONFIG = {
  headless: 'true',
  timeout: '30000'
};

interface CommandOptions {
  debug?: boolean;
  puppeteer?: boolean;
  headless?: string;
  timeout?: string;
}

const program = new Command();

program
  .name('fallback-crawler')
  .description('LinkedIn Puppeteer fallback crawler for mutual connection discovery')
  .version('1.0.0');

// API-based commands group
const apiCommands = program
  .addHelpText('before', '\n🔗 API-BASED COMMANDS\n')
  .addHelpText('after', '\nThese commands use the LinkedIn API with Puppeteer fallback when needed.\n');

apiCommands
  .command('discover')
  .description('Discover mutual connections using API + Puppeteer fallback')
  .argument('<profile-url>', 'LinkedIn profile URL to analyze')
  .option('-d, --debug', 'Enable debug logging')
  .option('--no-puppeteer', 'Disable Puppeteer fallback')
  .option('--headless <boolean>', 'Run browser in headless mode', DEFAULT_CONFIG.headless)
  .option('--timeout <number>', 'Browser timeout in milliseconds', DEFAULT_CONFIG.timeout)
  .action(async (profileUrl: string, options: CommandOptions) => {
    console.log('🔍 LinkedIn Mutual Connection Discovery');
    console.log(`Target: ${profileUrl}`);
    console.log(`Debug: ${options.debug}`);
    console.log(`Puppeteer fallback: ${options.puppeteer !== false}`);
    console.log(`Headless: ${options.headless}`);
    console.log(`Timeout: ${options.timeout}ms\n`);

    try {
      const discoveryOptions = {
        enablePuppeteerFallback: options.puppeteer !== false,
        puppeteerConfig: {
          headless: options.headless === 'true',
          timeout: parseInt(options.timeout || DEFAULT_CONFIG.timeout)
        }
      };

      const result = await discoverMutualConnections(profileUrl, discoveryOptions);

      console.log('📊 Discovery Results:');
      console.log(`Source: ${result.source}`);
      console.log(`Total mutuals: ${result.summary.totalMutuals}`);
      console.log(`API mutuals: ${result.summary.apiMutuals}`);
      console.log(`Puppeteer mutuals: ${result.summary.puppeteerMutuals}`);
      console.log(`Members attempted: ${result.summary.membersAttempted.join(', ')}`);
      console.log(`Errors: ${result.errors.length}`);

      if (result.errors.length > 0) {
        console.log('\n❌ Errors:');
        result.errors.forEach(error => console.log(`  - ${error}`));
      }

      if (result.mutuals.length > 0) {
        console.log('\n👥 Mutual Connections:');
        result.mutuals.forEach((mutual, index) => {
          console.log(`  ${index + 1}. ${mutual.name}`);
          console.log(`     Profile: ${mutual.profileUrl}`);
          console.log(`     Title: ${mutual.title || 'N/A'}`);
          console.log(`     Discovered by: ${mutual.discoveredBy}`);
          console.log(`     Via: ${mutual.via}`);
          console.log('');
        });
      } else {
        console.log('\n❌ No mutual connections found');
      }

    } catch (error) {
      console.error('❌ Discovery failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

apiCommands
  .command('add-to-graph')
  .description('Discover mutual connections and add them to Neo4j graph')
  .argument('<profile-url>', 'LinkedIn profile URL to analyze')
  .option('-d, --debug', 'Enable debug logging')
  .option('--no-puppeteer', 'Disable Puppeteer fallback')
  .action(async (profileUrl: string, options: CommandOptions) => {
    console.log('🔄 Adding Mutual Connections to Graph');
    console.log(`Target: ${profileUrl}`);
    console.log(`Debug: ${options.debug}`);
    console.log(`Puppeteer fallback: ${options.puppeteer !== false}\n`);

    try {
      // Discover mutual connections
      const discoveryOptions = {
        enablePuppeteerFallback: options.puppeteer !== false
      };

      const result = await discoverMutualConnections(profileUrl, discoveryOptions);

      if (result.mutuals.length === 0) {
        console.log('❌ No mutual connections found to add to graph');
        return;
      }

      // Add to graph
      const graphConstructor = new GraphConstructor();
      
      // Since the discovery manager currently only returns Puppeteer mutuals,
      // we'll treat all as Puppeteer mutuals for now
      const puppeteerMutuals = result.mutuals;

      if (puppeteerMutuals.length > 0) {
        console.log(`🤖 Adding ${puppeteerMutuals.length} Puppeteer mutuals to graph...`);
        await graphConstructor.addPuppeteerMutualConnectionsToGraph(profileUrl, puppeteerMutuals, { debug: options.debug });
      }

      console.log('✅ Successfully added mutual connections to graph');
      console.log(`Total added: ${result.mutuals.length}`);
      console.log(`API: 0`);
      console.log(`Puppeteer: ${puppeteerMutuals.length}`);

    } catch (error) {
      console.error('❌ Failed to add to graph:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Puppeteer-only commands group
const puppeteerCommands = program
  .addHelpText('before', '\n🤖 PUPPETEER-ONLY COMMANDS\n')
  .addHelpText('after', '\nThese commands use only Puppeteer for discovery (skip API).\n');

puppeteerCommands
  .command('puppeteer-only')
  .description('Run only Puppeteer discovery (skip API)')
  .argument('<profile-url>', 'LinkedIn profile URL to analyze')
  .option('-d, --debug', 'Enable debug logging')
  .option('--headless <boolean>', 'Run browser in headless mode', DEFAULT_CONFIG.headless)
  .option('--timeout <number>', 'Browser timeout in milliseconds', DEFAULT_CONFIG.timeout)
  .action(async (profileUrl: string, options: CommandOptions) => {
    console.log('🤖 Puppeteer-Only Mutual Connection Discovery');
    console.log(`Target: ${profileUrl}`);
    console.log(`Debug: ${options.debug}`);
    console.log(`Headless: ${options.headless}`);
    console.log(`Timeout: ${options.timeout}ms\n`);

    const fetcher = new PuppeteerConnectionFetcher({
      headless: options.headless === 'true',
      timeout: parseInt(options.timeout || DEFAULT_CONFIG.timeout)
    });

    try {
      // Get FourBridge members using helper
      const members = getFourBridgeMembers();

      if (members.length === 0) {
        console.error('❌ No FourBridge member credentials found in environment variables');
        console.log('Please set:');
        getRequiredEnvVars().forEach(envVar => console.log(`  ${envVar}`));
        process.exit(1);
      }

      console.log(`Found ${members.length} FourBridge members: ${members.map(m => m.name).join(', ')}\n`);

      const allMutuals = [];
      const successfulMembers = [];

      for (const member of members) {
        try {
          console.log(`🔍 Trying with ${member.name}...`);
          const memberMutuals = await fetcher.fetchMutualConnections(profileUrl, member);
          
          if (memberMutuals.length > 0) {
            console.log(`✅ ${member.name} found ${memberMutuals.length} mutuals`);
            allMutuals.push(...memberMutuals);
            successfulMembers.push(member.name);
          } else {
            console.log(`❌ ${member.name} found no mutuals`);
          }

          // Rate limiting between attempts
          if (members.indexOf(member) < members.length - 1) {
            console.log('⏳ Waiting 2 seconds before next attempt...');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

        } catch (error) {
          console.error(`❌ ${member.name} failed:`, error instanceof Error ? error.message : error);
        }
      }

      // Remove duplicates
      const uniqueMutuals = allMutuals.filter((mutual, index, self) => 
        index === self.findIndex(m => m.profileUrl === mutual.profileUrl)
      );

      console.log('\n📊 Results:');
      console.log(`Successful members: ${successfulMembers.join(', ')}`);
      console.log(`Total unique mutuals: ${uniqueMutuals.length}`);

      if (uniqueMutuals.length > 0) {
        console.log('\n👥 Mutual Connections:');
        uniqueMutuals.forEach((mutual, index) => {
          console.log(`  ${index + 1}. ${mutual.name}`);
          console.log(`     Profile: ${mutual.profileUrl}`);
          console.log(`     Title: ${mutual.title || 'N/A'}`);
          console.log(`     Discovered by: ${mutual.discoveredBy}`);
          console.log('');
        });
      }

    } catch (error) {
      console.error('❌ Puppeteer discovery failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      await fetcher.close();
    }
  });

// Utility commands group
const utilityCommands = program
  .addHelpText('before', '\n🔧 UTILITY COMMANDS\n')
  .addHelpText('after', '\nThese commands help with setup and testing.\n');

utilityCommands
  .command('test-credentials')
  .description('Test FourBridge member credentials')
  .action(async () => {
    console.log('🔐 Testing FourBridge Member Credentials\n');

    if (!hasFourBridgeMembers()) {
      console.log('❌ No credentials found');
      console.log('\nRequired environment variables:');
      getRequiredEnvVars().forEach(envVar => console.log(`  ${envVar}`));
      return;
    }

    const members = getFourBridgeMembersForDisplay();
    console.log('✅ Found credentials:');
    members.forEach(member => {
      console.log(`  ${member.name}: ${member.username}`);
    });

    console.log('\nTo test login, run:');
    console.log('  npm run fallback-crawler puppeteer-only <profile-url>');
  });

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 