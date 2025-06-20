import Fastify from 'fastify';
import cors from '@fastify/cors';
import { oauthCallbackPlugin } from './api/linkedin/oauthCallback';
import { discoverEntityPaths } from './lib/discovery/discoverEntityPaths';

const fastify = Fastify({
  logger: true
});

// Start server
const start = async () => {
  try {
    // Register CORS
    await fastify.register(cors, {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true
    });

    // Register OAuth callback route
    await fastify.register(oauthCallbackPlugin);

    // Health check endpoint
    fastify.get('/health', async (request, reply) => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Pathways API endpoint
    fastify.get('/api/pathways', async (request, reply) => {
      const { target } = request.query as { target?: string };
      
      if (!target) {
        return reply.status(400).send({ error: 'Missing target parameter' });
      }

      try {
        console.log(`[Server] Starting discovery for target: ${target}`);
        
        // Run the full discovery pipeline
        const discovery = await discoverEntityPaths(target, {
          usePuppeteerFallback: true,
          debug: true,
          writeToGraph: true,
          logMetrics: true
        });

        console.log(`[Server] Discovery completed:`, {
          peopleDiscovered: discovery.peopleDiscovered.length,
          totalMutuals: discovery.summary.totalMutuals,
          via: discovery.summary.via,
          durationMs: discovery.summary.durationMs
        });

        // Format response for UI
        const formatted = discovery.mutuals.map((mutual, i) => ({
          rank: i + 1,
          person: mutual.person,
          mutuals: mutual.mutuals,
          via: mutual.via,
          count: mutual.mutuals.length
        }));

        return {
          success: true,
          data: formatted,
          summary: discovery.summary,
          errors: discovery.errors
        };

      } catch (error) {
        console.error('[Server] Discovery error:', error);
        return reply.status(500).send({ 
          error: 'Discovery failed', 
          details: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start(); 