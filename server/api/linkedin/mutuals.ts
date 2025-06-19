import { FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin } from '../../lib/supabaseAdminClient';
import { Neo4jService } from '../../services/neo4j';

export default async function mutualsRoute(fastify: any) {
  fastify.get('/api/linkedin/mutuals', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get user_id from JWT/session (assume request.user.sub or request.user.id)
      const user = (request as any).user;
      const user_id = user?.id || user?.sub;
      if (!user_id) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      // Get user's LinkedIn profile name from linkedin_tokens
      const { data: tokenData, error: tokenError } = await supabaseAdmin
        .from('linkedin_tokens')
        .select('linked_profile_name')
        .eq('user_id', user_id)
        .maybeSingle();
      if (tokenError) {
        return reply.status(500).send({ error: tokenError.message });
      }
      const profileName = tokenData?.linked_profile_name;
      if (!profileName) {
        return reply.send([]); // No LinkedIn connection
      }

      // Query Neo4j for 5 most recent mutuals discovered by this user
      const neo4j = Neo4jService.getInstance();
      const session = neo4j.session();
      // Find mutuals where FourBridge member is the source
      const cypher = `
        MATCH (fb:Person {name: $profileName})- [r:CONNECTED_VIA_MUTUAL] -> (mutual:Person)
        RETURN mutual.name AS name, mutual.headline AS title, mutual.linkedinUrl AS profileUrl, r.via AS discoveredBy, r.source AS via, r.createdAt AS createdAt
        ORDER BY r.createdAt DESC
        LIMIT 5
      `;
      const result = await session.run(cypher, { profileName });
      await session.close();
      const mutuals = result.records.map(rec => ({
        name: rec.get('name'),
        title: rec.get('title'),
        profileUrl: rec.get('profileUrl'),
        discoveredBy: rec.get('discoveredBy'),
        via: rec.get('via'),
      }));
      return reply.send(mutuals);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
} 