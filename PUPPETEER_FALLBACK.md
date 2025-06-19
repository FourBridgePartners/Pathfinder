# LinkedIn Puppeteer Fallback System

This document describes the Puppeteer fallback system for LinkedIn mutual connection discovery, which provides a robust backup when the OAuth API fails or is rate-limited.

## Overview

The Puppeteer fallback system consists of:

1. **PuppeteerConnectionFetcher**: Browser automation to scrape mutual connections from LinkedIn profile pages
2. **ConnectionDiscoveryManager**: Orchestrates API and Puppeteer fallback strategies
3. **Graph Integration**: Adds Puppeteer-discovered connections to Neo4j with proper source tracking
4. **CLI Tools**: Command-line interface for testing and debugging

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   API Discovery     │    │  Puppeteer Fallback │    │   Graph Storage     │
│   (Primary)         │    │   (Secondary)       │    │   (Neo4j)           │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
         │                           │                           │
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  ConnectionDiscovery│    │  PuppeteerConnection│    │  GraphConstructor   │
│  Manager            │    │  Fetcher            │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## Setup

### 1. Install Dependencies

The Puppeteer dependencies are already installed:

```bash
npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
```

### 2. Environment Variables

Add these to your `.env` file for FourBridge member credentials:

```bash
# FourBridge Member Credentials (for Puppeteer fallback)
LINKEDIN_JON_USERNAME=jon@fourbridge.com
LINKEDIN_JON_PASSWORD=your_password_here

LINKEDIN_CHRIS_USERNAME=chris@fourbridge.com
LINKEDIN_CHRIS_PASSWORD=your_password_here

LINKEDIN_TED_USERNAME=ted@fourbridge.com
LINKEDIN_TED_PASSWORD=your_password_here

# Other required variables (from LINKEDIN_OAUTH.md)
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/oauth/callback
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

### 3. Browser Setup

Puppeteer will automatically download Chromium. For production, you may want to use a system-installed Chrome:

```bash
# On macOS
export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# On Linux
export PUPPETEER_EXECUTABLE_PATH="/usr/bin/google-chrome"
```

## Usage

### 1. Command Line Interface

The system provides a comprehensive CLI for testing and debugging:

```bash
# Test credentials
npm run fallback-crawler test-credentials

# Discover mutual connections (API + Puppeteer fallback)
npm run fallback-crawler discover https://linkedin.com/in/target-profile

# Run only Puppeteer discovery
npm run fallback-crawler puppeteer-only https://linkedin.com/in/target-profile

# Discover and add to Neo4j graph
npm run fallback-crawler add-to-graph https://linkedin.com/in/target-profile

# With debug options
npm run fallback-crawler discover https://linkedin.com/in/target-profile --debug --headless false
```

### 2. Programmatic Usage

```typescript
import { discoverMutualConnections } from './server/lib/linkedin/ConnectionDiscoveryManager';
import { GraphConstructor } from './graph/construct_graph';

// Discover mutual connections
const result = await discoverMutualConnections('https://linkedin.com/in/target-profile', {
  enablePuppeteerFallback: true,
  puppeteerConfig: {
    headless: true,
    timeout: 30000
  }
});

console.log(`Found ${result.mutuals.length} mutual connections`);
console.log(`Source: ${result.source}`);

// Add to graph
if (result.mutuals.length > 0) {
  const graphConstructor = new GraphConstructor();
  await graphConstructor.addPuppeteerMutualConnectionsToGraph(
    'https://linkedin.com/in/target-profile',
    result.mutuals,
    { debug: true }
  );
}
```

### 3. Direct Puppeteer Usage

```typescript
import { PuppeteerConnectionFetcher } from './server/lib/linkedin/PuppeteerConnectionFetcher';

const fetcher = new PuppeteerConnectionFetcher({
  headless: true,
  timeout: 30000
});

const member = {
  name: 'Jon',
  username: 'jon@fourbridge.com',
  password: 'password123'
};

const mutuals = await fetcher.fetchMutualConnections(
  'https://linkedin.com/in/target-profile',
  member
);

await fetcher.close();
```

## Features

### 1. Anti-Detection

- **Stealth Plugin**: Uses `puppeteer-extra-plugin-stealth` to avoid bot detection
- **Realistic User Agent**: Mimics real browser behavior
- **Rate Limiting**: Built-in delays between requests
- **Random Delays**: Varies timing to appear more human-like

### 2. Robust Error Handling

- **Login Failures**: Graceful handling of invalid credentials
- **Network Errors**: Retry logic for temporary failures
- **Rate Limiting**: Automatic backoff when LinkedIn limits requests
- **Page Structure Changes**: Multiple CSS selectors for resilience

### 3. Data Extraction

- **Mutual Connections**: Extracts name, profile URL, and title
- **Scrolling**: Automatically scrolls to load more connections
- **Deduplication**: Removes duplicate connections across members
- **Validation**: Ensures data quality before storage

### 4. Graph Integration

- **Source Tracking**: Marks connections as `source: 'puppeteer'`
- **Relationship Weighting**: Slightly lower weight (0.7) for Puppeteer connections
- **Metadata**: Stores discovery method and member information
- **Consistency**: Uses same relationship types as API connections

## Configuration Options

### PuppeteerConnectionFetcher

```typescript
interface PuppeteerConfig {
  headless?: boolean;        // Run browser in headless mode
  timeout?: number;          // Page timeout in milliseconds
  userAgent?: string;        // Custom user agent string
  viewport?: {               // Browser viewport size
    width: number;
    height: number;
  };
}
```

### ConnectionDiscoveryManager

```typescript
interface DiscoveryOptions {
  maxRetries?: number;                    // Maximum retry attempts
  delayBetweenAttempts?: number;          // Delay between member attempts
  enablePuppeteerFallback?: boolean;      // Enable/disable Puppeteer
  puppeteerConfig?: PuppeteerConfig;      // Puppeteer configuration
}
```

## Security Considerations

### 1. Credential Management

- **Environment Variables**: Store credentials securely in `.env`
- **No Hardcoding**: Never commit credentials to version control
- **Rotation**: Regularly rotate LinkedIn passwords
- **Access Control**: Limit credential access to authorized users

### 2. Rate Limiting

- **Respectful Scraping**: Built-in delays to avoid overwhelming LinkedIn
- **User Agent**: Realistic browser identification
- **Session Management**: Proper login/logout handling
- **Error Handling**: Graceful handling of rate limit responses

### 3. Data Privacy

- **Minimal Data**: Only extract necessary connection information
- **No Personal Data**: Avoid scraping sensitive personal information
- **Compliance**: Follow LinkedIn's terms of service
- **Audit Trail**: Log all scraping activities for compliance

## Troubleshooting

### Common Issues

1. **"No FourBridge member credentials found"**
   - Check that all required environment variables are set
   - Verify credential format and validity

2. **"Login failed"**
   - Verify LinkedIn credentials are correct
   - Check if LinkedIn requires 2FA or additional verification
   - Ensure account is not locked or suspended

3. **"No mutual connections found"**
   - Verify the target profile URL is valid
   - Check if the FourBridge member has access to the target
   - LinkedIn may have changed page structure

4. **"Browser launch failed"**
   - Check system has sufficient memory
   - Verify Chrome/Chromium is installed
   - Try running in non-headless mode for debugging

### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
# CLI debug mode
npm run fallback-crawler discover https://linkedin.com/in/target-profile --debug

# Programmatic debug mode
const result = await discoverMutualConnections(url, {
  enablePuppeteerFallback: true,
  puppeteerConfig: {
    headless: false,  // Show browser window
    timeout: 60000    // Longer timeout
  }
});
```

### Testing Credentials

Test your FourBridge member credentials:

```bash
npm run fallback-crawler test-credentials
```

This will verify that all required environment variables are set correctly.

## Performance

### Optimization Tips

1. **Headless Mode**: Use `headless: true` for production
2. **Concurrent Processing**: Process multiple profiles in parallel
3. **Caching**: Cache results to avoid repeated scraping
4. **Resource Management**: Close browser instances promptly

### Monitoring

Monitor scraping performance and success rates:

```typescript
const result = await discoverMutualConnections(url);
console.log(`Success rate: ${result.summary.totalMutuals > 0 ? '100%' : '0%'}`);
console.log(`Average time: ${result.summary.processingTime}ms`);
```

## Future Enhancements

1. **Webhook Integration**: Real-time connection updates
2. **Advanced Anti-Detection**: More sophisticated bot avoidance
3. **Proxy Support**: Rotate IP addresses for large-scale scraping
4. **Machine Learning**: Predict connection strength and relevance
5. **Analytics Dashboard**: Monitor scraping performance and success rates

## Legal and Ethical Considerations

1. **Terms of Service**: Ensure compliance with LinkedIn's ToS
2. **Rate Limiting**: Respect LinkedIn's rate limits and guidelines
3. **Data Usage**: Only use data for legitimate business purposes
4. **User Consent**: Ensure proper consent for data collection
5. **Privacy Laws**: Comply with relevant privacy regulations (GDPR, CCPA)

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review the test suite in `tests/linkedin/puppeteer_fetcher.test.ts`
3. Use the CLI debug mode for detailed logging
4. Check browser console for JavaScript errors
5. Verify LinkedIn page structure hasn't changed 