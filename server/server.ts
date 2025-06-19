import Fastify from 'fastify';
import cors from '@fastify/cors';
import { oauthCallbackPlugin } from './api/linkedin/oauthCallback';

const fastify = Fastify({
  logger: true
});

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

// Start server
const start = async () => {
  try {
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