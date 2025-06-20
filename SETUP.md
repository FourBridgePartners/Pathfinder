# LP Discovery System Setup Guide

## Environment Variables Required

Create a `.env` file in the root directory with the following variables:

```bash
# Brave Search API Key - Primary search engine for homepage discovery
# Get your key at: https://api.search.brave.com/
BRAVE_API_KEY=your_brave_key_here

# Google Custom Search Engine - Fallback search engine
# Get your key at: https://developers.google.com/custom-search/v1/overview
GOOGLE_CSE_API_KEY=your_google_api_key_here
GOOGLE_CSE_ID=your_google_cse_id_here

# Firecrawl API Key - Required for web crawling
# Get your key at: https://firecrawl.dev/
FIRECRAWL_API_KEY=your_firecrawl_key_here

# OpenAI API Key - Required for embeddings, GPT expansion, and LLM fallbacks
# Get your key at: https://platform.openai.com/
OPENAI_API_KEY=your_openai_key_here

# Supabase Configuration - Required for data storage
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# LinkedIn OAuth - Required for mutual connection discovery
LINKEDIN_CLIENT_ID=your_linkedin_client_id_here
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret_here

# Neo4j Configuration - Required for graph storage
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

## Testing the System

1. **Test Search Engine**: `npx tsx scripts/test-search-engine.ts`
2. **Test Generic Discovery**: `npx tsx scripts/test-generic-discovery.ts`
3. **Test Full Pipeline**: `npx tsx scripts/test-real-discovery.ts`

## Architecture Overview

The system now uses a robust, multi-stage discovery pipeline with comprehensive fallbacks:

### **Primary Flow:**
1. **Input Resolution**: User query → Alias resolution → GPT expansion
2. **Homepage Discovery**: Brave Search API → Google CSE fallback
3. **Team Page Discovery**: Crawl homepage → Find team page link → LLM suggestions fallback
4. **Member Extraction**: Crawl team page → Extract names + LinkedIn URLs → LinkedIn resolution fallback
5. **Path Discovery**: Find mutual connections → Build connection graph

### **Fallback Mechanisms:**
- **Search Engine Fallback**: Brave → Google CSE
- **Team Page Fallback**: Link detection → LLM path suggestions
- **LinkedIn Resolution**: Missing URLs → Puppeteer profile search
- **Contact Extraction**: Team page → Homepage fallback

This architecture works for any company name without hardcoded assumptions and gracefully handles failures at each stage! 