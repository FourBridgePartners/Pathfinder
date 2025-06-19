import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const linkedInClientId = process.env.LINKEDIN_CLIENT_ID!;
const linkedInClientSecret = process.env.LINKEDIN_CLIENT_SECRET!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function saveToken(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date
): Promise<void> {
  const { error } = await supabase
    .from('linkedin_tokens')
    .upsert({
      user_id: userId,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt.toISOString(),
    });

  if (error) {
    console.error(`[Supabase] Failed to save token for ${userId}:`, error.message);
    throw error;
  }

  console.log(`[Supabase] Token saved for ${userId}`);
}

export async function getToken(userId: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
} | null> {
  const { data, error } = await supabase
    .from('linkedin_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.warn(`[Supabase] No token found for ${userId}:`, error.message);
    return null;
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at),
  };
}

export async function refreshTokenIfNeeded(userId: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const token = await getToken(userId);

  if (!token) {
    throw new Error(`No token found for user ${userId}`);
  }

  if (token.expiresAt > new Date()) {
    // Still valid
    return token;
  }

  console.log(`[LinkedIn] Token expired for ${userId}. Refreshing...`);

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: token.refreshToken,
    client_id: linkedInClientId,
    client_secret: linkedInClientSecret,
  });

  try {
    const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', params);
    const { access_token, expires_in } = response.data;

    const newExpiry = new Date(Date.now() + expires_in * 1000);
    await saveToken(userId, access_token, token.refreshToken, newExpiry);

    console.log(`[LinkedIn] Token refreshed for ${userId}`);
    return {
      accessToken: access_token,
      refreshToken: token.refreshToken,
      expiresAt: newExpiry,
    };
  } catch (error) {
    console.error(`[LinkedIn] Failed to refresh token for ${userId}:`, error);
    throw error;
  }
} 