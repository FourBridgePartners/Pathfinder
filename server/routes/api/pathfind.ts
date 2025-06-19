import { Router, RequestHandler } from 'express';
import { PathFinder } from '../../query/pathfinder';
import { Neo4jService } from '@/services/neo4j';
import { PathResult } from '@/types/path';

interface PathRequestBody {
  sourceId: string;
  targetId: string;
}

const router = Router();

// Initialize PathFinder with Neo4jService singleton
const neo4jService = Neo4jService.getInstance();
const pathFinder = new PathFinder(neo4jService);

/**
 * POST /api/pathfind
 * Find connection paths between two nodes
 */
const pathfindHandler: RequestHandler = async (req, res) => {
  try {
    const { sourceId, targetId } = req.body as PathRequestBody;

    // Validate required parameters
    if (!sourceId || !targetId) {
      res.status(400).json({
        error: 'Missing required parameters',
        details: 'Both sourceId and targetId are required'
      });
      return;
    }

    // Find paths
    const paths = await pathFinder.findPaths(sourceId, targetId);

    // Return top 3 paths
    const topPaths: PathResult[] = paths.slice(0, 3);

    res.json({
      success: true,
      paths: topPaths
    });

  } catch (error) {
    console.error('Pathfinding error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

router.post('/', pathfindHandler);

export default router; 