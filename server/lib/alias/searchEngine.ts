/**
 * Uses Google Custom Search Engine to find the most likely official homepage.
 * 
 * @param query - The name of the firm to search for.
 * @returns A promise that resolves to the official homepage URL, or null if not found.
 */
export async function getHomepageFromGoogle(query: string): Promise<string | null> {
  console.log(`[SearchEngine] Google CSE fallback for: "${query}"`);

  if (!process.env.GOOGLE_CSE_API_KEY || !process.env.GOOGLE_CSE_ID) {
    console.warn('[SearchEngine] GOOGLE_CSE_API_KEY or GOOGLE_CSE_ID not found. Skipping Google fallback.');
    return null;
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_CSE_API_KEY}&cx=${process.env.GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&num=5`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[SearchEngine] Google CSE request failed: ${response.statusText}`);
      return null;
    }

    const result = await response.json();
    const homepage = result?.items?.find((item: any) =>
      item.link?.includes('.com') &&
      !item.link.includes('linkedin') &&
      !item.link.includes('crunchbase') &&
      !item.link.includes('wikipedia')
    )?.link;

    console.log(`[SearchEngine] Google CSE result: ${homepage}`);
    return homepage || null;
  } catch (err) {
    console.error(`[SearchEngine] Google CSE exception: ${err}`);
    return null;
  }
}

/**
 * Uses a real search engine API (e.g., Brave, Google, Bing) to find the most
 * likely official homepage for a given entity name.
 *
 * @param query - The name of the firm to search for.
 * @returns A promise that resolves to the official homepage URL, or null if not found.
 */
export async function getHomepageForEntity(query: string): Promise<string | null> {
  console.log(`[SearchEngine] Getting homepage for entity: "${query}"`);

  // Primary: Try Brave Search
  if (process.env.BRAVE_API_KEY) {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    const headers = {
      'X-Subscription-Token': process.env.BRAVE_API_KEY,
      'Accept': 'application/json'
    };

    try {
      const response = await fetch(url, { headers });
      if (response.ok) {
        const result = await response.json();
        const homepage = result?.web?.results?.find((r: any) =>
          r.url?.includes('.com') &&
          !r.url.includes('linkedin') &&
          !r.url.includes('crunchbase')
        )?.url;

        if (homepage) {
          console.log(`[SearchEngine] Brave found homepage: ${homepage}`);
          return homepage;
        }
      } else {
        console.warn(`[SearchEngine] Brave API request failed: ${response.statusText}`);
      }
    } catch (err) {
      console.warn(`[SearchEngine] Brave API exception: ${err}`);
    }
  } else {
    console.warn('[SearchEngine] BRAVE_API_KEY not found. Skipping Brave search.');
  }

  // Fallback: Try Google CSE
  console.log(`[Fallback] Google CSE triggered for "${query}"`);
  const googleResult = await getHomepageFromGoogle(query);
  if (googleResult) {
    console.log(`[Fallback] Google CSE found homepage: ${googleResult}`);
    return googleResult;
  }

  console.log(`[SearchEngine] No homepage found for "${query}" via any search engine`);
  return null;
} 