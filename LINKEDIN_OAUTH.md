# LinkedIn OAuth Integration

This document describes the LinkedIn OAuth integration for the LP Discovery System, which allows users to connect their LinkedIn accounts to find mutual connections and warm introductions.

## Overview

The LinkedIn OAuth integration consists of:

1. **OAuth Flow**: Complete authorization code flow with LinkedIn
2. **Token Management**: Secure storage and refresh of access tokens in Supabase
3. **Connection Sync**: Background worker to fetch and store LinkedIn connections in Neo4j
4. **Pathfinding Enhancement**: Integration with existing pathfinding to leverage mutual connections

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Fastify API    │    │   LinkedIn API  │
│   (Next.js)     │◄──►│   Server         │◄──►│                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Supabase      │    │   Background     │    │   Neo4j Graph   │
│   Token Store   │    │   Worker         │    │   Database      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Setup

### 1. LinkedIn OAuth App Configuration

1. Go to [LinkedIn Developer Console](https://www.linkedin.com/developers/)
2. Create a new app
3. Configure OAuth 2.0 settings:
   - **Redirect URLs**: `http://localhost:3000/api/linkedin/oauth/callback` (development)
   - **Scopes**: 
     - `r_liteprofile` (Basic profile)
     - `r_emailaddress` (Email address)
     - `w_member_social` (Post updates)
     - `r_organization_social` (Organization posts)

### 2. Environment Variables

Add these to your `.env` file:

```bash
# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/oauth/callback

# Supabase (for token storage)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Neo4j (for graph storage)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Server
PORT=3001
HOST=0.0.0.0
FRONTEND_URL=http://localhost:3000
```

### 3. Database Setup

Run the Supabase migration to create the `linkedin_tokens` table:

```sql
-- This is handled by the linkedinTokenStore.ts module
-- The table will be created automatically when the service starts
```

## Usage

### 1. Start the Server

```bash
npm run dev:server
```

### 2. Connect LinkedIn Account

1. Visit `/connect-linkedin` in your browser
2. Click "Connect LinkedIn Account"
3. Authorize the application on LinkedIn
4. You'll be redirected back with a success message

### 3. Sync Connections

```bash
# Sync all users
npm run sync:linkedin

# Or run the demo
npm run demo:linkedin
```

### 4. Run Tests

```bash
npm run test:linkedin
```

## API Endpoints

### OAuth Callback

- **URL**: `GET /api/linkedin/oauth/callback`
- **Purpose**: Handles OAuth callback from LinkedIn
- **Parameters**: 
  - `code` (required): Authorization code from LinkedIn
  - `state` (optional): State parameter for security
  - `error` (optional): OAuth error if authorization failed

### Health Check

- **URL**: `GET /health`
- **Purpose**: Server health check
- **Response**: `{ status: 'ok', timestamp: '...' }`

## Data Flow

### 1. OAuth Flow

1. User visits `/connect-linkedin`
2. Frontend generates authorization URL with state parameter
3. User is redirected to LinkedIn for authorization
4. LinkedIn redirects back to `/api/linkedin/oauth/callback` with code
5. Server exchanges code for access token
6. Server fetches user profile from LinkedIn
7. Token and profile are stored in Supabase

### 2. Connection Sync

1. Background worker fetches all stored tokens from Supabase
2. For each token, refresh if expired
3. Fetch LinkedIn connections using LinkedIn API
4. Create/update person nodes in Neo4j
5. Create `CONNECTED_TO` relationships between users and connections
6. Handle rate limiting and errors gracefully

### 3. Pathfinding Integration

The existing pathfinding system automatically leverages the new `CONNECTED_TO` relationships:

- **Direct connections**: Score boost for direct LinkedIn connections
- **Mutual connections**: Enhanced scoring for shared connections
- **Path discovery**: Find paths through LinkedIn network

## File Structure

```
server/
├── api/linkedin/
│   ├── oauth.ts                 # OAuth service
│   └── oauthCallback.ts         # OAuth callback handler
├── lib/supabase/
│   └── linkedinTokenStore.ts    # Token storage
└── server.ts                    # Fastify server

worker/
└── linkedin/
    └── syncLinkedInConnectionsForAllUsers.ts  # Connection sync worker

ui/
└── pages/
    └── connect-linkedin.tsx     # OAuth UI

tests/
└── linkedin/
    └── oauth.test.ts           # OAuth tests

scripts/
└── demo-linkedin-oauth.ts      # Demo script
```

## Security Considerations

1. **State Parameter**: Used to prevent CSRF attacks
2. **Token Storage**: Tokens stored securely in Supabase with encryption
3. **Token Refresh**: Automatic refresh before expiration
4. **Rate Limiting**: Built-in delays to respect LinkedIn API limits
5. **Error Handling**: Graceful handling of API errors and network issues

## Rate Limits

LinkedIn API has the following rate limits:
- **Profile API**: 100 requests per day per user
- **Connections API**: 100 requests per day per user
- **Organization API**: 100 requests per day per user

The sync worker includes built-in rate limiting (1 second between requests) to stay within these limits.

## Troubleshooting

### Common Issues

1. **"Invalid redirect URI"**: Ensure the redirect URI in LinkedIn app matches exactly
2. **"Invalid client"**: Check that client ID and secret are correct
3. **"Token expired"**: Tokens are automatically refreshed, but manual refresh may be needed
4. **"Rate limit exceeded"**: Wait and retry, or check sync frequency

### Debug Mode

Enable debug logging by setting:

```bash
DEBUG=linkedin:*
```

### Manual Token Refresh

```typescript
import { refreshTokenIfNeeded } from './server/lib/supabase/linkedinTokenStore';

const validToken = await refreshTokenIfNeeded(userId);
```

## Future Enhancements

1. **Webhook Support**: Real-time connection updates
2. **Analytics**: Track connection growth and engagement
3. **Bulk Operations**: Batch processing for large networks
4. **Connection Strength**: Analyze interaction patterns
5. **Recommendations**: Suggest optimal introduction paths 