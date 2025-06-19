import { MutualConnectionFetcher } from './getMutualConnections';
import { PuppeteerConnectionFetcher, MutualConnection } from './PuppeteerConnectionFetcher';
import { getFourBridgeMembers, type FourBridgeMember } from './memberHelper';

export interface DiscoveryResult {
  mutuals: MutualConnection[];
  source: 'api' | 'puppeteer' | 'mixed';
  errors: string[];
  summary: {
    totalMutuals: number;
    apiMutuals: number;
    puppeteerMutuals: number;
    membersAttempted: string[];
  };
}

export interface DiscoveryOptions {
  maxRetries?: number;
  delayBetweenAttempts?: number;
  enablePuppeteerFallback?: boolean;
  puppeteerConfig?: {
    headless?: boolean;
    timeout?: number;
  };
}

export class ConnectionDiscoveryManager {
  private puppeteerFetcher: PuppeteerConnectionFetcher | null = null;
  private options: DiscoveryOptions;

  constructor(options: DiscoveryOptions = {}) {
    this.options = {
      maxRetries: 3,
      delayBetweenAttempts: 2000,
      enablePuppeteerFallback: true,
      puppeteerConfig: {
        headless: true,
        timeout: 30000
      },
      ...options
    };
  }

  /**
   * Get FourBridge members from environment variables
   */
  private getFourBridgeMembers(): FourBridgeMember[] {
    const members = getFourBridgeMembers();
    
    if (members.length === 0) {
      console.warn('[ConnectionDiscoveryManager] No FourBridge member credentials found in environment variables');
    }

    return members;
  }

  /**
   * Try to fetch mutual connections using the API
   */
  private async tryApiDiscovery(targetProfileUrl: string): Promise<MutualConnection[]> {
    try {
      console.log('[ConnectionDiscoveryManager] Attempting API-based discovery...');
      
      // For now, we'll return an empty array since the API method needs to be implemented
      // TODO: Implement actual API call using MutualConnectionFetcher
      console.log('[ConnectionDiscoveryManager] API discovery not yet implemented, returning empty array');
      return [];
      
    } catch (error) {
      console.error('[ConnectionDiscoveryManager] API discovery failed:', error);
      return [];
    }
  }

  /**
   * Try to fetch mutual connections using Puppeteer
   */
  private async tryPuppeteerDiscovery(
    targetProfileUrl: string, 
    members: FourBridgeMember[]
  ): Promise<MutualConnection[]> {
    if (!this.options.enablePuppeteerFallback) {
      console.log('[ConnectionDiscoveryManager] Puppeteer fallback disabled');
      return [];
    }

    if (members.length === 0) {
      console.log('[ConnectionDiscoveryManager] No FourBridge members available for Puppeteer fallback');
      return [];
    }

    try {
      console.log('[ConnectionDiscoveryManager] Attempting Puppeteer-based discovery...');
      
      // Initialize Puppeteer fetcher if not already done
      if (!this.puppeteerFetcher) {
        this.puppeteerFetcher = new PuppeteerConnectionFetcher(this.options.puppeteerConfig);
      }

      const allMutuals: MutualConnection[] = [];
      const successfulMembers: string[] = [];

      // Try each member until we get results
      for (const member of members) {
        try {
          console.log(`[ConnectionDiscoveryManager] Trying Puppeteer discovery with ${member.name}...`);
          
          const memberMutuals = await this.puppeteerFetcher.fetchMutualConnections(targetProfileUrl, member);
          
          if (memberMutuals.length > 0) {
            console.log(`[ConnectionDiscoveryManager] ${member.name} found ${memberMutuals.length} mutuals`);
            allMutuals.push(...memberMutuals);
            successfulMembers.push(member.name);
            
            // If we got good results, we can stop trying other members
            if (memberMutuals.length >= 10) {
              break;
            }
          }

          // Rate limiting between attempts
          await this.delay(this.options.delayBetweenAttempts!);

        } catch (error) {
          console.error(`[ConnectionDiscoveryManager] Puppeteer discovery failed for ${member.name}:`, error);
          continue;
        }
      }

      // Remove duplicates based on profile URL
      const uniqueMutuals = this.removeDuplicateMutuals(allMutuals);
      
      console.log(`[ConnectionDiscoveryManager] Puppeteer discovery completed: ${uniqueMutuals.length} unique mutuals from ${successfulMembers.length} members`);
      
      return uniqueMutuals;

    } catch (error) {
      console.error('[ConnectionDiscoveryManager] Puppeteer discovery failed:', error);
      return [];
    }
  }

  /**
   * Remove duplicate mutual connections based on profile URL
   */
  private removeDuplicateMutuals(mutuals: MutualConnection[]): MutualConnection[] {
    const seen = new Set<string>();
    const unique: MutualConnection[] = [];

    for (const mutual of mutuals) {
      const key = mutual.profileUrl.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(mutual);
      }
    }

    return unique;
  }

  /**
   * Main discovery method that tries API first, then falls back to Puppeteer
   */
  async discoverMutualConnections(targetProfileUrl: string): Promise<DiscoveryResult> {
    const errors: string[] = [];
    const membersAttempted: string[] = [];
    let apiMutuals: MutualConnection[] = [];
    let puppeteerMutuals: MutualConnection[] = [];

    console.log(`[ConnectionDiscoveryManager] Starting mutual connection discovery for: ${targetProfileUrl}`);

    // Step 1: Try API-based discovery
    try {
      apiMutuals = await this.tryApiDiscovery(targetProfileUrl);
    } catch (error) {
      const errorMsg = `API discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }

    // Step 2: If API failed or returned no results, try Puppeteer fallback
    if (apiMutuals.length === 0 && this.options.enablePuppeteerFallback) {
      try {
        const members = this.getFourBridgeMembers();
        membersAttempted.push(...members.map(m => m.name));
        
        puppeteerMutuals = await this.tryPuppeteerDiscovery(targetProfileUrl, members);
      } catch (error) {
        const errorMsg = `Puppeteer discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    // Step 3: Combine results
    const allMutuals = [...apiMutuals, ...puppeteerMutuals];
    const uniqueMutuals = this.removeDuplicateMutuals(allMutuals);

    // Determine source
    let source: 'api' | 'puppeteer' | 'mixed' = 'api';
    if (apiMutuals.length > 0 && puppeteerMutuals.length > 0) {
      source = 'mixed';
    } else if (puppeteerMutuals.length > 0) {
      source = 'puppeteer';
    }

    const result: DiscoveryResult = {
      mutuals: uniqueMutuals,
      source,
      errors,
      summary: {
        totalMutuals: uniqueMutuals.length,
        apiMutuals: apiMutuals.length,
        puppeteerMutuals: puppeteerMutuals.length,
        membersAttempted
      }
    };

    console.log(`[ConnectionDiscoveryManager] Discovery completed:`, {
      totalMutuals: result.summary.totalMutuals,
      source: result.source,
      errors: result.errors.length
    });

    return result;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.puppeteerFetcher) {
      await this.puppeteerFetcher.close();
      this.puppeteerFetcher = null;
    }
  }

  /**
   * Delay function for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance for easy use
export const connectionDiscoveryManager = new ConnectionDiscoveryManager();

// Export for direct usage
export async function discoverMutualConnections(targetProfileUrl: string, options?: DiscoveryOptions): Promise<DiscoveryResult> {
  const manager = new ConnectionDiscoveryManager(options);
  try {
    return await manager.discoverMutualConnections(targetProfileUrl);
  } finally {
    await manager.cleanup();
  }
} 