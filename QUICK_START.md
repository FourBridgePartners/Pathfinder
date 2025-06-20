# LP Discovery System - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### 1. Create Environment File
Create a `.env` file in the root directory:

```bash
# Required for basic functionality
BRAVE_API_KEY=your_brave_key_here
FIRECRAWL_API_KEY=your_firecrawl_key_here

# Optional for enhanced features
OPENAI_API_KEY=your_openai_key_here
GOOGLE_CSE_API_KEY=your_google_api_key_here
GOOGLE_CSE_ID=your_google_cse_id_here
```

### 2. Get API Keys (Free Tiers Available)

#### Brave Search API (Required)
- Go to: https://api.search.brave.com/
- Sign up for free account
- Get your API key
- Free tier: 10,000 requests/month

#### Firecrawl API (Required)
- Go to: https://firecrawl.dev/
- Sign up for free account
- Get your API key
- Free tier: 1,000 requests/month

#### OpenAI API (Optional)
- Go to: https://platform.openai.com/
- Sign up and add billing
- Get your API key
- Pay per use

### 3. Test the System

```bash
# Test with basic API keys
bun run scripts/test-discovery.ts "Sequoia Capital"

# Test current status
bun run scripts/test-current-status.ts

# Test with specific firm
bun run scripts/test-discovery.ts "Andreessen Horowitz"
```

### 4. Expected Results

With API keys set up, you should see:
- ✅ Homepage discovery via search engines
- ✅ Team page crawling via Firecrawl
- ✅ People extraction from team pages
- ✅ LinkedIn URL resolution
- ✅ Mutual connection discovery (with LinkedIn OAuth)

## 🔧 Advanced Setup

### Full Environment Variables
```bash
# Search Engines
BRAVE_API_KEY=your_brave_key_here
GOOGLE_CSE_API_KEY=your_google_api_key_here
GOOGLE_CSE_ID=your_google_cse_id_here

# Web Crawling
FIRECRAWL_API_KEY=your_firecrawl_key_here

# LLM Features
OPENAI_API_KEY=your_openai_key_here

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your_linkedin_client_id_here
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret_here

# Data Storage
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Graph Storage
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

### Test Scripts Available
- `scripts/test-discovery.ts` - Full discovery pipeline
- `scripts/test-current-status.ts` - System status check
- `scripts/test-basic-discovery.ts` - Basic functionality test
- `scripts/test-with-mocks.ts` - Mock API demonstration

## 🎯 What the System Does

1. **Input Resolution**: Resolves firm names and aliases
2. **Homepage Discovery**: Finds official company websites
3. **Team Page Discovery**: Locates team/people pages
4. **Member Extraction**: Extracts team member information
5. **LinkedIn Resolution**: Finds LinkedIn profiles
6. **Mutual Connection Discovery**: Finds shared connections
7. **Graph Building**: Creates connection networks

## 🚨 Troubleshooting

### Common Issues:
- **"API key not found"**: Add missing API keys to `.env`
- **"No homepage found"**: Check search engine API keys
- **"Crawl failed"**: Check Firecrawl API key and rate limits
- **"LLM features disabled"**: Add OpenAI API key

### Rate Limits:
- Brave Search: 10,000 requests/month (free)
- Firecrawl: 1,000 requests/month (free)
- OpenAI: Pay per use

## 📊 System Architecture

```
User Input → Alias Resolution → Search Engines → Web Crawling → 
People Extraction → LinkedIn Resolution → Mutual Discovery → Graph Building
```

Each stage has fallback mechanisms for reliability! 