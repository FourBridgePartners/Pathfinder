import { supabaseAdmin } from '../../lib/supabaseAdminClient';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { data, error } = await supabaseAdmin
      .from('discovery_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
} 