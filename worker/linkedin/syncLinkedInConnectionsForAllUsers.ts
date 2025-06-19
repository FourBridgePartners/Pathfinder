import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { Neo4jService } from '../../services/neo4j';
import { refreshTokenIfNeeded } from '../../server/lib/supabase/linkedinTokenStore';
import dotenv from 'dotenv';

dotenv.config();

interface LinkedInConnection {
  id: string;
  firstName: string;
  lastName: string;
  headline?: string;
  profilePicture?: string;
  publicProfileUrl?: string;
}

interface LinkedInConnectionsResponse {
  elements: Array<{
    id: string;
    firstName?: {
      localized?: {
        en_US?: string;
      };
    };
    lastName?: {
      localized?: {
        en_US?: string;
      };
    };
    headline?: {
      localized?: {
        en_US?: string;
      };
    };
    profilePicture?: {
      displayImage?: {
        elements?: Array<{
          identifiers?: Array<{
            identifier?: string;
          }>;
        }>;
      };
    };
    publicProfileUrl?: string;
  }>;
  paging?: {
    count: number;
    start: number;
    total: number;
  };
}

interface StoredToken {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export class LinkedInConnectionSyncWorker {
  private supabase: any;
  private neo4j: Neo4jService;
  private rateLimitDelay = 1000; // 1 second between requests

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    this.neo4j = Neo4jService.getInstance();
  }

  /**
   * Get all stored LinkedIn tokens from Supabase
   */
  private async getAllTokens(): Promise<StoredToken[]> {
    const { data, error } = await this.supabase
      .from('linkedin_tokens')
      .select('*');

    if (error) {
      console.error('[LinkedInSync] Error fetching tokens:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Fetch LinkedIn connections for a user
   */
  private async fetchLinkedInConnections(accessToken: string): Promise<LinkedInConnection[]> {
    try {
      const response = await axios.get<LinkedInConnectionsResponse>(
        'https://api.linkedin.com/v2/connections',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0'
          },
          params: {
            count: 1000, // Maximum allowed
            start: 0
          }
        }
      );

      return response.data.elements.map(element => ({
        id: element.id,
        firstName: element.firstName?.localized?.en_US || '',
        lastName: element.lastName?.localized?.en_US || '',
        headline: element.headline?.localized?.en_US,
        profilePicture: element.profilePicture?.displayImage?.elements?.[0]?.identifiers?.[0]?.identifier,
        publicProfileUrl: element.publicProfileUrl
      }));
    } catch (error) {
      console.error('[LinkedInSync] Error fetching connections:', error);
      throw error;
    }
  }

  /**
   * Create or update connection node in Neo4j
   */
  private async createConnectionNode(connection: LinkedInConnection): Promise<string> {
    const nodeId = `linkedin_${connection.id}`;
    
    await this.neo4j.createOrUpdateNode({
      labels: ['Person'],
      properties: {
        id: nodeId,
        name: `${connection.firstName} ${connection.lastName}`.trim(),
        firstName: connection.firstName,
        lastName: connection.lastName,
        headline: connection.headline || null,
        linkedinUrl: connection.publicProfileUrl || null,
        linkedinId: connection.id,
        source: 'LinkedIn',
        type: 'Person',
        lastUpdated: new Date().toISOString()
      }
    });

    return nodeId;
  }

  /**
   * Create CONNECTED_TO relationship in Neo4j
   */
  private async createConnectedToRelationship(
    fromUserId: string,
    toConnectionId: string,
    connection: LinkedInConnection
  ): Promise<void> {
    const relationshipId = `${fromUserId}_${toConnectionId}_CONNECTED_TO`;
    
    await this.neo4j.createOrUpdateRelationship({
      fromNode: fromUserId,
      toNode: toConnectionId,
      type: 'CONNECTED_TO',
      properties: {
        id: relationshipId,
        source: 'LinkedIn',
        connectionType: 'direct',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    });
  }

  /**
   * Process connections for a single user
   */
  private async processUserConnections(userId: string, accessToken: string): Promise<{
    processed: number;
    errors: number;
  }> {
    let processed = 0;
    let errors = 0;

    try {
      console.log(`[LinkedInSync] Processing connections for user: ${userId}`);

      // Fetch connections from LinkedIn
      const connections = await this.fetchLinkedInConnections(accessToken);
      console.log(`[LinkedInSync] Found ${connections.length} connections for user ${userId}`);

      // Process each connection
      for (const connection of connections) {
        try {
          // Create connection node
          const connectionNodeId = await this.createConnectionNode(connection);

          // Create CONNECTED_TO relationship
          await this.createConnectedToRelationship(userId, connectionNodeId, connection);

          processed++;
          
          // Rate limiting
          await this.delay(this.rateLimitDelay);

        } catch (error) {
          console.error(`[LinkedInSync] Error processing connection ${connection.id}:`, error);
          errors++;
        }
      }

      console.log(`[LinkedInSync] Completed processing for user ${userId}: ${processed} processed, ${errors} errors`);

    } catch (error) {
      console.error(`[LinkedInSync] Error processing user ${userId}:`, error);
      errors++;
    }

    return { processed, errors };
  }

  /**
   * Delay function for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Main sync function for all users
   */
  async syncAllUsers(): Promise<{
    totalUsers: number;
    totalProcessed: number;
    totalErrors: number;
    results: Array<{
      userId: string;
      processed: number;
      errors: number;
    }>;
  }> {
    console.log('[LinkedInSync] Starting LinkedIn connections sync for all users...');

    const tokens = await this.getAllTokens();
    console.log(`[LinkedInSync] Found ${tokens.length} users with LinkedIn tokens`);

    const results = [];
    let totalProcessed = 0;
    let totalErrors = 0;

    for (const token of tokens) {
      try {
        // Refresh token if needed
        const validToken = await refreshTokenIfNeeded(token.user_id);
        
        // Process connections for this user
        const result = await this.processUserConnections(token.user_id, validToken.accessToken);
        
        results.push({
          userId: token.user_id,
          processed: result.processed,
          errors: result.errors
        });

        totalProcessed += result.processed;
        totalErrors += result.errors;

        // Rate limiting between users
        await this.delay(this.rateLimitDelay * 2);

      } catch (error) {
        console.error(`[LinkedInSync] Error processing user ${token.user_id}:`, error);
        results.push({
          userId: token.user_id,
          processed: 0,
          errors: 1
        });
        totalErrors++;
      }
    }

    const summary = {
      totalUsers: tokens.length,
      totalProcessed,
      totalErrors,
      results
    };

    console.log('[LinkedInSync] Sync completed:', summary);
    return summary;
  }

  /**
   * Sync connections for a specific user
   */
  async syncUser(userId: string): Promise<{
    processed: number;
    errors: number;
  }> {
    console.log(`[LinkedInSync] Starting sync for user: ${userId}`);

    try {
      const validToken = await refreshTokenIfNeeded(userId);
      return await this.processUserConnections(userId, validToken.accessToken);
    } catch (error) {
      console.error(`[LinkedInSync] Error syncing user ${userId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const linkedInSyncWorker = new LinkedInConnectionSyncWorker();

// Export for direct usage
export async function syncLinkedInConnectionsForAllUsers() {
  return await linkedInSyncWorker.syncAllUsers();
}

export async function syncLinkedInConnectionsForUser(userId: string) {
  return await linkedInSyncWorker.syncUser(userId);
} 