# Graph Module

This module handles graph construction, path finding, and relationship management in the Neo4j database.

## Components

### PathFinder (`queryPaths.ts`)

The `PathFinder` class discovers and scores connection paths between FourBridge contacts and target nodes (people or firms).

#### Key Features
- Uses Neo4j's shortestPath algorithm with fallback to alternative paths
- Scores paths based on multiple factors:
  - Path length (shorter paths score higher)
  - Connection types (direct connections score higher)
  - Connection strength (from relationship properties)
  - Mutual ties (shared firms, connections)
- Limits paths to maximum 4 hops
- Returns top 3 highest-scoring paths

#### Example Usage
```typescript
const pathFinder = new PathFinder(neo4jService);
const paths = await pathFinder.findPaths('target_123', { debug: true });
```

#### Example Return Shape
```typescript
[
  {
    path: [
      { id: 'person_1', type: 'Person', name: 'John Doe' },
      { type: 'CONNECTED_TO', strength: 0.8 },
      { id: 'person_2', type: 'Person', name: 'Target Person' }
    ],
    score: 0.85,
    metadata: {
      pathLength: 2,
      connectionTypes: ['CONNECTED_TO'],
      mutualTies: ['Acme Corp']
    }
  }
]
```

### Testing and Debugging

#### Unit Tests
Run the test suite:
```bash
npm test
```

Key test cases:
- Empty results when no paths exist
- Direct connections
- Mixed path types (Person → Firm → Person)
- Path ranking by score
- Maximum hop limit
- Fallback to alternative paths

#### Debugging
Enable debug mode to see detailed logs:
```typescript
const paths = await pathFinder.findPaths('target_123', { debug: true });
```

Debug output includes:
- Number of paths found
- Path details
- Scoring factors
- Fallback behavior

### Scoring Weights

The scoring system uses configurable weights for different factors:

```typescript
interface ScoringWeights {
  maxHops: number;           // Maximum path length (default: 4)
  minScore: number;          // Minimum score threshold (default: 0.1)
  pathLengthWeight: number;  // Weight for path length (default: 0.4)
  connectionTypeWeight: number;  // Weight for connection types (default: 0.3)
  connectionStrengthWeight: number;  // Weight for connection strength (default: 0.2)
  mutualTiesWeight: number;  // Weight for mutual ties (default: 0.1)
}
```

Adjust weights to prioritize different factors:
```typescript
const pathFinder = new PathFinder(neo4jService, {
  weights: {
    pathLengthWeight: 0.5,
    connectionTypeWeight: 0.3,
    connectionStrengthWeight: 0.1,
    mutualTiesWeight: 0.1
  }
});
``` 