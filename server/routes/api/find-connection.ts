import { Router, RequestHandler } from 'express';
import { PathFinder } from '../../query/pathfinder';
import { Neo4jService } from '@/services/neo4j';
import { PathResult } from '@/types/path';

interface ConnectionRequestBody {
  sourceId: string;
  targetId: string;
}

const router = Router();

// Initialize PathFinder with Neo4jService singleton
const neo4jService = Neo4jService.getInstance();
const pathFinder = new PathFinder(neo4jService);

/**
 * POST /api/find-connection
 * Find connection paths between two nodes with scoring
 */
const findConnectionHandler: RequestHandler = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { sourceId, targetId } = req.body as ConnectionRequestBody;

    // Validate required parameters
    if (!sourceId || !targetId) {
      res.status(400).json({
        error: 'Missing required parameters',
        details: 'Both sourceId and targetId are required'
      });
      return;
    }

    // Find paths with scoring
    const paths = await pathFinder.findPaths(sourceId, targetId);

    // Calculate request time
    const requestTime = Date.now() - startTime;

    // Log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log(`Found ${paths.length} paths in ${requestTime}ms`);
      paths.forEach((path, index) => {
        console.log(`\nPath ${index + 1}:`);
        console.log(`Confidence: ${path.confidence.toFixed(2)}`);
        console.log(`Sources: ${path.sources.join(', ')}`);
        console.log(`Action: ${path.recommendedAction}`);
      });
    }

    res.json({
      success: true,
      paths,
      requestTime
    });

  } catch (error) {
    console.error('Connection finding error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

router.post('/', findConnectionHandler);

export default router; 