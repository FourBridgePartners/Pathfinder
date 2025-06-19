import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { saveToken, getToken, refreshTokenIfNeeded } from '../../lib/supabase/linkedinTokenStore';

interface LinkedInOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

interface LinkedInUser {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

interface StoredToken {
  id: string;
  linkedin_user_id: string;
  fourbridge_user_id: string;
  access_token: string;
  refresh_token?: string;
  expires_at: Date;
  scopes: string[];
  created_at: Date;
  updated_at: Date;
}

export class LinkedInOAuthService {
  public config: LinkedInOAuthConfig;

  constructor(config: LinkedInOAuthConfig) {
    this.config = {
      ...config,
      scopes: config.scopes || [
        'r_liteprofile',
        'r_emailaddress',
        'w_member_social',
        'r_organization_social'
      ]
    };
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state: state || uuidv4()
    });

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    try {
      const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', {
        grant_type: 'authorization_code',
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri
      });

      return response.data;
    } catch (error) {
      console.error('[LinkedInOAuth] Error exchanging code for token:', error);
      throw new Error('Failed to exchange authorization code for token');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      });

      return response.data;
    } catch (error) {
      console.error('[LinkedInOAuth] Error refreshing token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Get LinkedIn user profile using access token
   */
  async getUserProfile(accessToken: string): Promise<LinkedInUser> {
    try {
      const response = await axios.get('https://api.linkedin.com/v2/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      return {
        id: response.data.id,
        firstName: response.data.localizedFirstName,
        lastName: response.data.localizedLastName
      };
    } catch (error) {
      console.error('[LinkedInOAuth] Error fetching user profile:', error);
      throw new Error('Failed to fetch LinkedIn user profile');
    }
  }

  /**
   * Store token in database (Supabase)
   */
  async storeToken(tokenData: Omit<StoredToken, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    try {
      await saveToken(
        tokenData.linkedin_user_id,
        tokenData.access_token,
        tokenData.refresh_token || '',
        tokenData.expires_at
      );
      
      return tokenData.linkedin_user_id;
    } catch (error) {
      console.error('[LinkedInOAuth] Failed to store token:', error);
      throw error;
    }
  }

  /**
   * Get stored token by LinkedIn user ID
   */
  async getStoredToken(linkedinUserId: string): Promise<StoredToken | null> {
    try {
      const token = await getToken(linkedinUserId);
      
      if (!token) {
        return null;
      }

      return {
        id: linkedinUserId,
        linkedin_user_id: linkedinUserId,
        fourbridge_user_id: '', // TODO: Map from LinkedIn user ID to FourBridge user ID
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        expires_at: token.expiresAt,
        scopes: this.config.scopes,
        created_at: new Date(), // TODO: Add created_at to Supabase table
        updated_at: new Date()  // TODO: Add updated_at to Supabase table
      };
    } catch (error) {
      console.error('[LinkedInOAuth] Failed to get stored token:', error);
      return null;
    }
  }

  /**
   * Update stored token (for refresh)
   */
  async updateToken(tokenId: string, updates: Partial<StoredToken>): Promise<void> {
    try {
      if (updates.access_token && updates.expires_at) {
        await saveToken(
          tokenId,
          updates.access_token,
          updates.refresh_token || '',
          updates.expires_at
        );
      }
    } catch (error) {
      console.error('[LinkedInOAuth] Failed to update token:', error);
      throw error;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(expiresAt: Date): boolean {
    return new Date() >= expiresAt;
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(linkedinUserId: string): Promise<string | null> {
    try {
      const token = await refreshTokenIfNeeded(linkedinUserId);
      return token.accessToken;
    } catch (error) {
      console.error('[LinkedInOAuth] Failed to get valid access token:', error);
      return null;
    }
  }
}

// TODO: Add Fastify plugin when Fastify is installed
// export async function linkedInOAuthPlugin(fastify: FastifyInstance) {
//   // Implementation for Fastify routes
// } 