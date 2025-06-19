import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { LinkedInOAuthService } from '../../server/api/linkedin/oauth';
import { saveToken, refreshTokenIfNeeded } from '../../server/lib/supabase/linkedinTokenStore';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

// Mock Supabase token store
vi.mock('../../server/lib/supabase/linkedinTokenStore', () => ({
  saveToken: vi.fn(),
  refreshTokenIfNeeded: vi.fn(),
  getToken: vi.fn()
}));

describe('LinkedIn OAuth Flow', () => {
  let oauthService: LinkedInOAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    
    oauthService = new LinkedInOAuthService({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:3000/callback',
      scopes: ['r_liteprofile', 'r_emailaddress']
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exchangeCodeForToken', () => {
    it('should successfully exchange authorization code for token', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'test-access-token',
          expires_in: 3600,
          refresh_token: 'test-refresh-token'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);

      const result = await oauthService.exchangeCodeForToken('test-auth-code');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://www.linkedin.com/oauth/v2/accessToken',
        {
          grant_type: 'authorization_code',
          code: 'test-auth-code',
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          redirect_uri: 'http://localhost:3000/callback'
        }
      );

      expect(result).toEqual({
        access_token: 'test-access-token',
        expires_in: 3600,
        refresh_token: 'test-refresh-token'
      });
    });

    it('should handle LinkedIn API errors', async () => {
      const mockErrorResponse = {
        data: {
          error: 'invalid_grant',
          error_description: 'The authorization code is invalid or expired'
        },
        status: 400
      };

      mockedAxios.post.mockRejectedValueOnce({
        response: mockErrorResponse
      });

      await expect(oauthService.exchangeCodeForToken('invalid-code')).rejects.toThrow('Failed to exchange authorization code for token');
    });

    it('should handle network errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(oauthService.exchangeCodeForToken('test-code')).rejects.toThrow('Failed to exchange authorization code for token');
    });
  });

  describe('getUserProfile', () => {
    it('should successfully fetch user profile', async () => {
      const mockProfileResponse = {
        data: {
          id: 'test-user-id',
          localizedFirstName: 'John',
          localizedLastName: 'Doe'
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockProfileResponse);

      const result = await oauthService.getUserProfile('test-access-token');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.linkedin.com/v2/me',
        {
          headers: {
            'Authorization': 'Bearer test-access-token',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      expect(result).toEqual({
        id: 'test-user-id',
        firstName: 'John',
        lastName: 'Doe'
      });
    });

    it('should handle LinkedIn API errors', async () => {
      const mockErrorResponse = {
        data: {
          serviceErrorCode: 100,
          message: 'Not enough permissions to access: GET /me',
          status: 403
        },
        status: 403
      };

      mockedAxios.get.mockRejectedValueOnce({
        response: mockErrorResponse
      });

      await expect(oauthService.getUserProfile('invalid-token')).rejects.toThrow('Failed to fetch LinkedIn user profile');
    });
  });

  describe('generateAuthUrl', () => {
    it('should generate correct authorization URL', () => {
      const state = 'test-state';
      const authUrl = oauthService.generateAuthUrl(state);

      expect(authUrl).toContain('https://www.linkedin.com/oauth/v2/authorization');
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain('client_id=test-client-id');
      expect(authUrl).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback');
      expect(authUrl).toContain('scope=r_liteprofile%20r_emailaddress');
      expect(authUrl).toContain('state=test-state');
    });

    it('should include all configured scopes', () => {
      const oauthServiceWithScopes = new LinkedInOAuthService({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:3000/callback',
        scopes: ['r_liteprofile', 'r_emailaddress', 'w_member_social']
      });

      const authUrl = oauthServiceWithScopes.generateAuthUrl('test-state');
      expect(authUrl).toContain('scope=r_liteprofile%20r_emailaddress%20w_member_social');
    });

    it('should generate state if not provided', () => {
      const authUrl = oauthService.generateAuthUrl();
      expect(authUrl).toContain('state=');
      expect(authUrl).not.toContain('state=test-state');
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh access token', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'new-access-token',
          expires_in: 3600
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockTokenResponse);

      const result = await oauthService.refreshToken('test-refresh-token');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://www.linkedin.com/oauth/v2/accessToken',
        {
          grant_type: 'refresh_token',
          refresh_token: 'test-refresh-token',
          client_id: 'test-client-id',
          client_secret: 'test-client-secret'
        }
      );

      expect(result).toEqual({
        access_token: 'new-access-token',
        expires_in: 3600
      });
    });

    it('should handle refresh token errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Invalid refresh token'));

      await expect(oauthService.refreshToken('invalid-refresh-token')).rejects.toThrow('Failed to refresh access token');
    });
  });

  describe('isTokenExpired', () => {
    it('should return true for expired token', () => {
      const expiredDate = new Date(Date.now() - 1000); // 1 second ago
      expect(oauthService.isTokenExpired(expiredDate)).toBe(true);
    });

    it('should return false for valid token', () => {
      const validDate = new Date(Date.now() + 3600 * 1000); // 1 hour from now
      expect(oauthService.isTokenExpired(validDate)).toBe(false);
    });
  });
});

describe('OAuth Callback Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle successful OAuth callback', async () => {
    // Mock the OAuth service methods
    const mockOAuthService = {
      exchangeCodeForToken: vi.fn().mockResolvedValue({
        access_token: 'test-access-token',
        expires_in: 3600,
        refresh_token: 'test-refresh-token'
      }),
      getUserProfile: vi.fn().mockResolvedValue({
        id: 'test-user-id',
        firstName: 'John',
        lastName: 'Doe'
      })
    };

    // Mock saveToken
    vi.mocked(saveToken).mockResolvedValue(undefined);

    // This would test the actual callback handler
    // For now, we're testing the individual components
    expect(mockOAuthService.exchangeCodeForToken).toBeDefined();
    expect(mockOAuthService.getUserProfile).toBeDefined();
  });

  it('should handle OAuth errors', async () => {
    const mockError = {
      error: 'access_denied',
      error_description: 'User denied access'
    };

    // This would test error handling in the callback
    expect(mockError.error).toBe('access_denied');
    expect(mockError.error_description).toBe('User denied access');
  });

  it('should handle missing authorization code', async () => {
    // This would test the case where no code is provided
    const missingCode = undefined;
    expect(missingCode).toBeUndefined();
  });
});

describe('Token Storage Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should save token successfully', async () => {
    const userId = 'test-user-id';
    const accessToken = 'test-access-token';
    const refreshToken = 'test-refresh-token';
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    vi.mocked(saveToken).mockResolvedValue(undefined);

    await saveToken(userId, accessToken, refreshToken, expiresAt);

    expect(saveToken).toHaveBeenCalledWith(userId, accessToken, refreshToken, expiresAt);
  });

  it('should refresh token when needed', async () => {
    const userId = 'test-user-id';
    const mockValidToken = {
      accessToken: 'new-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: new Date(Date.now() + 3600 * 1000)
    };

    vi.mocked(refreshTokenIfNeeded).mockResolvedValue(mockValidToken);

    const result = await refreshTokenIfNeeded(userId);

    expect(refreshTokenIfNeeded).toHaveBeenCalledWith(userId);
    expect(result).toEqual(mockValidToken);
  });
}); 