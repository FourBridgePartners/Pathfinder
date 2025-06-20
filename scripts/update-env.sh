#!/bin/bash

echo "🔧 Updating .env file with AI and search engine variables..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    exit 1
fi

# Create backup
cp .env .env.backup
echo "✅ Created backup: .env.backup"

# Add the missing variables to .env
cat >> .env << 'EOF'

# ===== AI & SEARCH ENGINE FEATURES =====

# Brave Search API - Primary search engine for homepage discovery
# Get your key at: https://api.search.brave.com/
BRAVE_API_KEY=your_brave_key_here

# Google Custom Search Engine - Fallback search engine
# Get your key at: https://developers.google.com/custom-search/v1/overview
GOOGLE_CSE_API_KEY=your_google_api_key_here
GOOGLE_CSE_ID=your_google_cse_id_here

# OpenAI API Key - Required for embeddings, GPT expansion, and LLM fallbacks
# Get your key at: https://platform.openai.com/
OPENAI_API_KEY=your_openai_key_here

# LinkedIn OAuth - Required for mutual connection discovery
# Get your keys at: https://www.linkedin.com/developers/
LINKEDIN_CLIENT_ID=your_linkedin_client_id_here
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret_here

# Supabase Anonymous Key - Required for client-side operations
SUPABASE_ANON_KEY=your_supabase_anon_key_here
EOF

echo "✅ Added AI and search engine variables to .env"
echo ""
echo "📋 NEXT STEPS:"
echo "1. Get your API keys from the URLs shown above"
echo "2. Replace 'your_*_key_here' with your actual keys"
echo "3. Test the system with: bun run scripts/test-discovery.ts 'Sequoia Capital'"
echo ""
echo "🔑 REQUIRED KEYS FOR FULL FUNCTIONALITY:"
echo "- BRAVE_API_KEY (free tier: 10,000 requests/month)"
echo "- FIRECRAWL_API_KEY (already set in your .env)"
echo "- OPENAI_API_KEY (pay per use)"
echo ""
echo "🔑 OPTIONAL KEYS FOR ENHANCED FEATURES:"
echo "- GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID (search fallback)"
echo "- LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET (mutual connections)"
echo "- SUPABASE_ANON_KEY (client-side operations)" 