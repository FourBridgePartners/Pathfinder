import { getEmbedding } from '../openai/embedding';
import { cosineSimilarity } from '../utils/vectorMath';
import { FIRM_ALIASES, findFirmAlias } from './firmAliasStore';

type AliasMatch = {
  name: string;
  score: number;
};

/**
 * Resolves a firm name input against a store of known aliases using semantic similarity.
 *
 * @param input - The ambiguous or abbreviated firm name.
 * @returns The canonical name of the best match if the similarity score is above a threshold, otherwise null.
 */
export async function resolveFirmAlias(input: string): Promise<string | null> {
  // First, try the new findFirmAlias function
  const aliasResult = await findFirmAlias(input);
  if (aliasResult) {
    console.log(`[AliasResolver] Found alias match for "${input}" -> "${aliasResult}"`);
    return aliasResult;
  }

  // Fallback to direct alias matching
  const normalizedInput = input.trim().toLowerCase();
  for (const record of FIRM_ALIASES) {
    if (record.aliases.some(alias => alias.toLowerCase() === normalizedInput)) {
      console.log(`[AliasResolver] Found direct alias match for "${input}" -> "${record.name}"`);
      return record.name;
    }
  }

  // If no direct match, proceed with semantic search (if embeddings are available).
  console.log(`[AliasResolver] No direct alias match found. Proceeding with semantic search for "${input}".`);
  const inputEmbedding = await getEmbedding(input);
  let bestMatch: AliasMatch | null = null;

  for (const record of FIRM_ALIASES) {
    // Ensure the record has a valid, non-empty embedding to compare against.
    if (!record.embedding || record.embedding.length === 0) {
      continue;
    }

    const score = cosineSimilarity(inputEmbedding, record.embedding);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { name: record.name, score };
    }
  }

  console.log(`[AliasResolver] Semantic search best match: ${bestMatch?.name} (Score: ${bestMatch?.score?.toFixed(2)})`);

  // The threshold determines how confident we need to be to return a match.
  const SIMILARITY_THRESHOLD = 0.85;
  if (bestMatch && bestMatch.score > SIMILARITY_THRESHOLD) {
    return bestMatch.name;
  }

  return null;
} 