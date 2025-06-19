import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { saveToken } from '../../lib/supabase/linkedinTokenStore';
import { LinkedInOAuthService } from './oauth';

interface OAuthCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

interface LinkedInProfile {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
  profilePicture?: {
    displayImage?: {
      elements?: Array<{
        identifiers?: Array<{
          identifier?: string;
        }>;
      }>;
    };
  };
}

export async function oauthCallbackHandler(
  request: FastifyRequest<{ Querystring: OAuthCallbackQuery }>,
  reply: FastifyReply
) {
  const { code, state, error, error_description } = request.query;

  // Handle OAuth errors
  if (error) {
    console.error('[OAuthCallback] OAuth error:', error, error_description);
    return reply.status(400).send({
      error: 'OAuth authorization failed',
      details: error_description || error
    });
  }

  // Validate required parameters
  if (!code) {
    console.error('[OAuthCallback] Missing authorization code');
    return reply.status(400).send({
      error: 'Missing authorization code'
    });
  }

  try {
    console.log('[OAuthCallback] Processing OAuth callback with code:', code.substring(0, 10) + '...');

    // Initialize OAuth service
    const oauthService = new LinkedInOAuthService({
      clientId: process.env.LINKEDIN_CLIENT_ID || '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
      redirectUri: process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3000/api/linkedin/oauth/callback',
      scopes: ['r_liteprofile', 'r_emailaddress', 'w_member_social', 'r_organization_social']
    });

    // Exchange code for token
    console.log('[OAuthCallback] Exchanging code for token...');
    const tokenData = await oauthService.exchangeCodeForToken(code);

    // Get user profile from LinkedIn
    console.log('[OAuthCallback] Fetching user profile...');
    const userProfile = await oauthService.getUserProfile(tokenData.access_token);

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Store token in Supabase
    console.log('[OAuthCallback] Storing token in Supabase for user:', userProfile.id);
    await saveToken(
      userProfile.id,
      tokenData.access_token,
      tokenData.refresh_token || '',
      expiresAt
    );

    // Log success
    console.log('[OAuthCallback] OAuth flow completed successfully for user:', userProfile.id);

    // Return success response
    return reply.send({
      success: true,
      message: 'LinkedIn OAuth successful',
      user: {
        id: userProfile.id,
        firstName: userProfile.firstName,
        lastName: userProfile.lastName
      },
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    console.error('[OAuthCallback] Error processing OAuth callback:', error);
    
    return reply.status(500).send({
      error: 'OAuth callback processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Fastify plugin to register OAuth callback route
export async function oauthCallbackPlugin(fastify: FastifyInstance) {
  fastify.get('/api/linkedin/oauth/callback', oauthCallbackHandler);
} 