const TEAM_PAGE_KEYWORDS = ['team', 'about', 'leadership', 'people', 'who-we-are', 'our-firm', 'principals'];

/**
 * Finds the most likely team page URL from a list of links.
 *
 * @param links - An array of URL strings.
 * @param baseUrl - The base URL of the website to resolve relative links.
 * @returns The absolute URL of the most likely team page, or null if not found.
 */
export function findTeamPageUrl(links: string[], baseUrl: string): string | null {
  let bestMatch: { url: string; score: number } | null = null;

  for (const link of links) {
    const url = new URL(link, baseUrl).href;
    const lowercasedUrl = url.toLowerCase();
    let score = 0;

    // Prioritize links with keywords in the path
    for (const keyword of TEAM_PAGE_KEYWORDS) {
      if (lowercasedUrl.includes(`/${keyword}`)) {
        score += 10;
        break; // Found a strong keyword, no need to check others for this link
      }
    }

    // Small bonus for being on the same domain
    if (url.startsWith(baseUrl)) {
      score += 1;
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { url, score };
    }
  }

  if (bestMatch) {
    console.log(`[PageParser] Found likely team page: ${bestMatch.url} (Score: ${bestMatch.score})`);
    return bestMatch.url;
  }

  console.log('[PageParser] No likely team page found from links.');
  return null;
} 