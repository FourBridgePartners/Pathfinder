import axios from 'axios';
import { LinkedInOAuthService } from '../../api/linkedin/oauth';
import { fetchFromFirecrawl } from '../../../ingestion/firecrawl_webfetch';

interface LinkedInConnection {
  id: string;
  firstName: string;
  lastName: string;
  headline?: string;
  profilePicture?: string;
  publicProfileUrl?: string;
}

interface MutualConnection {
  id: string;
  name: string;
  headline?: string;
  profileUrl?: string;
  mutualCount: number;
  viaFourBridgeMembers: string[];
}

interface ConnectionCache {
  linkedinUserId: string;
  connections: LinkedInConnection[];
  lastFetched: Date;
  expiresAt: Date;
}

interface GetMutualConnectionsOptions {
  debug?: boolean;
  useCache?: boolean;
  cacheTTL?: number; // in minutes
}

export class MutualConnectionFetcher {
  private oauthService: LinkedInOAuthService;
  private fourBridgeMembers: Map<string, string>; // linkedin_user_id -> name
  private connectionCache: Map<string, ConnectionCache>;

  constructor(oauthService: LinkedInOAuthService) {
    this.oauthService = oauthService;
    this.connectionCache = new Map();
    
    // Initialize FourBridge team members
    this.fourBridgeMembers = new Map([
      // TODO: Replace with actual LinkedIn user IDs and names
      ['chris_linkedin_id', 'Chris'],
      ['jon_linkedin_id', 'Jon'],
      ['ted_linkedin_id', 'Ted']
    ]);
  }

  /**
   * Get LinkedIn user ID from profile URL using Firecrawl
   */
  async getLinkedInUserId(profileUrl: string, debug: boolean = false): Promise<string | null> {
    try {
      if (debug) console.log(`[MutualConnectionFetcher] Getting LinkedIn ID for: ${profileUrl}`);

      // Extract username from LinkedIn URL
      const match = profileUrl.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/);
      if (!match) {
        throw new Error('Invalid LinkedIn profile URL');
      }

      const username = match[1];
      
      // Use Firecrawl to get profile data
      const result = await fetchFromFirecrawl({
        entityName: profileUrl,
        debug
      });

      if (result.contacts.length === 0) {
        if (debug) console.log('[MutualConnectionFetcher] No profile data found');
        return null;
      }

      // Extract LinkedIn ID from the profile data
      // Note: LinkedIn doesn't expose user IDs publicly, so we'll use the username as an identifier
      // In a real implementation, you might need to use LinkedIn's API to get the actual ID
      return username;
    } catch (error) {
      console.error('[MutualConnectionFetcher] Error getting LinkedIn ID:', error);
      return null;
    }
  }

  /**
   * Fetch connections for a LinkedIn user
   */
  async getConnections(linkedinUserId: string, accessToken: string, debug: boolean = false): Promise<LinkedInConnection[]> {
    try {
      if (debug) console.log(`[MutualConnectionFetcher] Fetching connections for: ${linkedinUserId}`);

      // LinkedIn API endpoint for connections
      const response = await axios.get('https://api.linkedin.com/v2/connections', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        },
        params: {
          count: 1000, // Maximum allowed
          start: 0
        }
      });

      const connections: LinkedInConnection[] = response.data.elements.map((element: any) => ({
        id: element.id,
        firstName: element.firstName?.localized?.en_US || '',
        lastName: element.lastName?.localized?.en_US || '',
        headline: element.headline?.localized?.en_US,
        profilePicture: element.profilePicture?.displayImage?.elements?.[0]?.identifiers?.[0]?.identifier,
        publicProfileUrl: element.publicProfileUrl
      }));

      if (debug) console.log(`[MutualConnectionFetcher] Found ${connections.length} connections`);

      return connections;
    } catch (error) {
      console.error('[MutualConnectionFetcher] Error fetching connections:', error);
      throw new Error('Failed to fetch LinkedIn connections');
    }
  }

  /**
   * Get cached connections or fetch from LinkedIn
   */
  async getCachedConnections(linkedinUserId: string, accessToken: string, options: GetMutualConnectionsOptions = {}): Promise<LinkedInConnection[]> {
    const { debug = false, useCache = true, cacheTTL = 60 } = options;

    if (useCache) {
      const cached = this.connectionCache.get(linkedinUserId);
      if (cached && new Date() < cached.expiresAt) {
        if (debug) console.log(`[MutualConnectionFetcher] Using cached connections for: ${linkedinUserId}`);
        return cached.connections;
      }
    }

    // Fetch fresh connections
    const connections = await this.getConnections(linkedinUserId, accessToken, debug);

    // Cache the results
    const expiresAt = new Date(Date.now() + cacheTTL * 60 * 1000);
    this.connectionCache.set(linkedinUserId, {
      linkedinUserId,
      connections,
      lastFetched: new Date(),
      expiresAt
    });

    if (debug) console.log(`[MutualConnectionFetcher] Cached connections for: ${linkedinUserId}, expires: ${expiresAt}`);

    return connections;
  }

  /**
   * Find mutual connections between target and FourBridge team members
   */
  async findMutualConnections(
    targetProfileUrl: string,
    options: GetMutualConnectionsOptions = {}
  ): Promise<MutualConnection[]> {
    const { debug = false } = options;

    try {
      if (debug) console.log(`[MutualConnectionFetcher] Finding mutual connections for: ${targetProfileUrl}`);

      // Get target's LinkedIn ID
      const targetLinkedInId = await this.getLinkedInUserId(targetProfileUrl, debug);
      if (!targetLinkedInId) {
        throw new Error('Could not get LinkedIn ID for target profile');
      }

      // Get target's access token (this would need to be provided or stored)
      const targetAccessToken = await this.oauthService.getValidAccessToken(targetLinkedInId);
      if (!targetAccessToken) {
        throw new Error('No valid access token for target user');
      }

      // Get target's connections
      const targetConnections = await this.getCachedConnections(targetLinkedInId, targetAccessToken, options);
      const targetConnectionIds = new Set(targetConnections.map(c => c.id));

      if (debug) console.log(`[MutualConnectionFetcher] Target has ${targetConnections.length} connections`);

      // Get FourBridge team connections and find mutuals
      const mutuals = new Map<string, MutualConnection>();

      for (const [fourBridgeLinkedInId, fourBridgeName] of this.fourBridgeMembers) {
        try {
          // Get FourBridge member's access token
          const fourBridgeAccessToken = await this.oauthService.getValidAccessToken(fourBridgeLinkedInId);
          if (!fourBridgeAccessToken) {
            if (debug) console.log(`[MutualConnectionFetcher] No access token for ${fourBridgeName}`);
            continue;
          }

          // Get FourBridge member's connections
          const fourBridgeConnections = await this.getCachedConnections(fourBridgeLinkedInId, fourBridgeAccessToken, options);

          if (debug) console.log(`[MutualConnectionFetcher] ${fourBridgeName} has ${fourBridgeConnections.length} connections`);

          // Find mutual connections
          for (const connection of fourBridgeConnections) {
            if (targetConnectionIds.has(connection.id)) {
              const existing = mutuals.get(connection.id);
              if (existing) {
                existing.mutualCount++;
                existing.viaFourBridgeMembers.push(fourBridgeName);
              } else {
                mutuals.set(connection.id, {
                  id: connection.id,
                  name: `${connection.firstName} ${connection.lastName}`,
                  headline: connection.headline,
                  profileUrl: connection.publicProfileUrl,
                  mutualCount: 1,
                  viaFourBridgeMembers: [fourBridgeName]
                });
              }
            }
          }
        } catch (error) {
          console.error(`[MutualConnectionFetcher] Error processing ${fourBridgeName}:`, error);
        }
      }

      const mutualConnections = Array.from(mutuals.values());
      
      // Sort by mutual count (highest first)
      mutualConnections.sort((a, b) => b.mutualCount - a.mutualCount);

      if (debug) {
        console.log(`[MutualConnectionFetcher] Found ${mutualConnections.length} mutual connections`);
        console.log('[MutualConnectionFetcher] Top mutuals:', mutualConnections.slice(0, 5));
      }

      return mutualConnections;
    } catch (error) {
      console.error('[MutualConnectionFetcher] Error finding mutual connections:', error);
      throw error;
    }
  }

  /**
   * Clear connection cache for a specific user or all users
   */
  clearCache(linkedinUserId?: string): void {
    if (linkedinUserId) {
      this.connectionCache.delete(linkedinUserId);
    } else {
      this.connectionCache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { totalCached: number; expiredEntries: number } {
    const now = new Date();
    let expiredEntries = 0;

    for (const cache of this.connectionCache.values()) {
      if (now >= cache.expiresAt) {
        expiredEntries++;
      }
    }

    return {
      totalCached: this.connectionCache.size,
      expiredEntries
    };
  }
} 