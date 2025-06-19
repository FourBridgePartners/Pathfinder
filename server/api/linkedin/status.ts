import { FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin } from '../../lib/supabaseAdminClient';

export default async function statusRoute(fastify: any) {
  fastify.get('/api/linkedin/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get user_id from JWT/session (assume request.user.sub or request.user.id)
      // Adjust this logic to match your auth setup
      const user = (request as any).user;
      const user_id = user?.id || user?.sub;
      if (!user_id) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      // Query linkedin_tokens table
      const { data, error } = await supabaseAdmin
        .from('linkedin_tokens')
        .select('access_token, linked_profile_name, last_synced')
        .eq('user_id', user_id)
        .maybeSingle();

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      if (!data || !data.access_token) {
        return reply.send({ connected: false });
      }

      return reply.send({
        connected: true,
        profileName: data.linked_profile_name || null,
        lastSynced: data.last_synced || null
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
} 