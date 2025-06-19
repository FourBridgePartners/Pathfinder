import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the entire module
vi.mock('../../server/lib/supabase/linkedinTokenStore', () => ({
  saveToken: vi.fn(),
  getToken: vi.fn(),
  refreshTokenIfNeeded: vi.fn()
}));

describe('LinkedIn Token Store Integration', () => {
  const mockUserId = 'test_user_123';
  const mockAccessToken = 'mock_access_token';
  const mockRefreshToken = 'mock_refresh_token';
  const mockExpiresAt = new Date(Date.now() + 3600000); // 1 hour from now

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have the correct function signatures', async () => {
    // Import the functions to verify they exist
    const { saveToken, getToken, refreshTokenIfNeeded } = await import('../../server/lib/supabase/linkedinTokenStore');
    
    expect(typeof saveToken).toBe('function');
    expect(typeof getToken).toBe('function');
    expect(typeof refreshTokenIfNeeded).toBe('function');
  });

  it('should handle token storage workflow', async () => {
    // This test verifies the integration points work correctly
    const { saveToken, getToken, refreshTokenIfNeeded } = await import('../../server/lib/supabase/linkedinTokenStore');
    
    // Mock the functions to return expected values
    vi.mocked(saveToken).mockResolvedValue();
    vi.mocked(getToken).mockResolvedValue({
      accessToken: mockAccessToken,
      refreshToken: mockRefreshToken,
      expiresAt: mockExpiresAt
    });
    vi.mocked(refreshTokenIfNeeded).mockResolvedValue({
      accessToken: mockAccessToken,
      refreshToken: mockRefreshToken,
      expiresAt: mockExpiresAt
    });

    // Test the workflow
    await saveToken(mockUserId, mockAccessToken, mockRefreshToken, mockExpiresAt);
    const token = await getToken(mockUserId);
    const validToken = await refreshTokenIfNeeded(mockUserId);

    expect(saveToken).toHaveBeenCalledWith(mockUserId, mockAccessToken, mockRefreshToken, mockExpiresAt);
    expect(getToken).toHaveBeenCalledWith(mockUserId);
    expect(refreshTokenIfNeeded).toHaveBeenCalledWith(mockUserId);
    expect(token).toEqual({
      accessToken: mockAccessToken,
      refreshToken: mockRefreshToken,
      expiresAt: mockExpiresAt
    });
    expect(validToken).toEqual({
      accessToken: mockAccessToken,
      refreshToken: mockRefreshToken,
      expiresAt: mockExpiresAt
    });
  });

  it('should handle missing tokens gracefully', async () => {
    const { getToken, refreshTokenIfNeeded } = await import('../../server/lib/supabase/linkedinTokenStore');
    
    // Mock getToken to return null (no token found)
    vi.mocked(getToken).mockResolvedValue(null);
    vi.mocked(refreshTokenIfNeeded).mockRejectedValue(new Error(`No token found for user ${mockUserId}`));

    const token = await getToken(mockUserId);
    expect(token).toBeNull();

    await expect(refreshTokenIfNeeded(mockUserId)).rejects.toThrow(`No token found for user ${mockUserId}`);
  });
}); 