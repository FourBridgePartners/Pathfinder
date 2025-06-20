import OpenAI from 'openai';

export interface TeamPageSuggestion {
  path: string;
  confidence: number;
  reasoning: string;
}

/**
 * Uses GPT to suggest likely team page paths for a given homepage URL.
 * 
 * @param homepageUrl - The homepage URL to analyze
 * @param companyName - The company name (optional, for context)
 * @returns Promise resolving to array of suggested team page paths
 */
export async function suggestTeamPagePaths(
  homepageUrl: string,
  companyName?: string
): Promise<TeamPageSuggestion[]> {
  console.log(`[LLMExpander] Suggesting team page paths for: ${homepageUrl}`);

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[LLMExpander] OPENAI_API_KEY not found. Skipping LLM suggestions.');
    return [];
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const prompt = `Given this company homepage URL: ${homepageUrl}${companyName ? ` (Company: ${companyName})` : ''}

Please suggest the most likely team page paths that this company might use. Consider common patterns like:
- /team
- /about/team
- /leadership
- /about/leadership
- /people
- /our-team
- /about-us/team
- /company/team
- /about/our-team

Return your response as a JSON array of objects with this structure:
[
  {
    "path": "/team",
    "confidence": 0.9,
    "reasoning": "Most common team page path"
  }
]

Only include paths with confidence > 0.5. Order by confidence descending.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a web development expert who understands common URL patterns for company team pages. Respond only with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      console.warn('[LLMExpander] No response from GPT');
      return [];
    }

    // Parse the JSON response
    const suggestions = JSON.parse(response) as TeamPageSuggestion[];
    
    console.log(`[LLMExpander] Suggested ${suggestions.length} team page paths`);
    suggestions.forEach(s => {
      console.log(`[LLMExpander] - ${s.path} (confidence: ${s.confidence})`);
    });

    return suggestions;

  } catch (error: any) {
    console.error(`[LLMExpander] Error suggesting team page paths: ${error.message}`);
    return [];
  }
}

/**
 * Uses GPT to disambiguate between multiple LinkedIn profiles for the same name.
 * 
 * @param name - The person's name
 * @param profiles - Array of potential LinkedIn profiles with titles/companies
 * @param targetCompany - The company we're looking for
 * @returns Promise resolving to the most likely profile index
 */
export async function disambiguateLinkedInProfiles(
  name: string,
  profiles: Array<{ title?: string; company?: string; url: string }>,
  targetCompany: string
): Promise<number | null> {
  console.log(`[LLMExpander] Disambiguating ${profiles.length} profiles for "${name}" at "${targetCompany}"`);

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[LLMExpander] OPENAI_API_KEY not found. Skipping disambiguation.');
    return 0; // Return first profile as fallback
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const profilesText = profiles.map((p, i) => 
      `${i + 1}. Title: ${p.title || 'Unknown'}, Company: ${p.company || 'Unknown'}`
    ).join('\n');

    const prompt = `Given this person: ${name}
Target company: ${targetCompany}

Available LinkedIn profiles:
${profilesText}

Which profile (1-${profiles.length}) is most likely to be the correct person? Consider:
- Company name similarity
- Job title relevance
- Industry alignment

Respond with only the number (1-${profiles.length}) or "none" if none seem correct.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert at matching people to their correct LinkedIn profiles. Respond with only a number or 'none'."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 10
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response || response === 'none') {
      console.log(`[LLMExpander] No suitable profile found for "${name}"`);
      return null;
    }

    const profileIndex = parseInt(response) - 1;
    if (profileIndex >= 0 && profileIndex < profiles.length) {
      console.log(`[LLMExpander] Selected profile ${profileIndex + 1} for "${name}"`);
      return profileIndex;
    }

    console.warn(`[LLMExpander] Invalid profile index: ${response}`);
    return null;

  } catch (error: any) {
    console.error(`[LLMExpander] Error disambiguating profiles: ${error.message}`);
    return 0; // Return first profile as fallback
  }
}

/**
 * Uses GPT to guess a likely job title for a person based on their name and company.
 * 
 * @param name - The person's name
 * @param company - The company they work for
 * @returns Promise resolving to a suggested job title or null
 */
export async function enrichContactTitle(
  name: string,
  company?: string
): Promise<string | null> {
  console.log(`[LLMExpander] Enriching title for: "${name}"${company ? ` at ${company}` : ''}`);

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[LLMExpander] OPENAI_API_KEY not found. Skipping title enrichment.');
    return null;
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const prompt = `Given this person: ${name}${company ? ` at ${company}` : ''}

Please suggest a likely job title for this person. Consider:
- Common roles in investment firms, venture capital, or private equity
- Seniority level based on context
- Industry-specific titles

Respond with only the job title (e.g., "Managing Director", "Partner", "Principal") or "unknown" if you can't make a reasonable guess.

Keep it concise and professional.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert at identifying job titles in the investment and business world. Respond with only the title or 'unknown'."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 20
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response || response.toLowerCase() === 'unknown') {
      console.log(`[LLMExpander] Could not enrich title for "${name}"`);
      return null;
    }

    console.log(`[LLMExpander] Enriched title for "${name}": ${response}`);
    return response;

  } catch (error: any) {
    console.error(`[LLMExpander] Error enriching title: ${error.message}`);
    return null;
  }
} 