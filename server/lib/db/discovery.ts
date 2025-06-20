import { supabaseAdmin } from '../supabaseAdminClient';
import { v4 as uuidv4 } from 'uuid';

// Type definitions
export type DiscoveryMetricInsert = {
  id?: string;
  input: string;
  input_type: string;
  methods: any;
  total_people: number;
  total_mutuals: number;
  duration_ms: number;
  created_at?: string;
  error_messages?: any;
};

export type DiscoveredPersonInsert = {
  id?: string;
  discovery_id: string;
  name: string;
  linkedin_url: string;
  title?: string;
  page_url?: string;
  company?: string;
  discovered_at?: string;
  source: string;
  created_at?: string;
};

export type DiscoveryErrorInsert = {
  id?: string;
  discovery_id: string;
  message: string;
  created_at?: string;
};

// Insert a discovery_metrics record
export async function insertDiscoveryMetric(metric: DiscoveryMetricInsert) {
  const id = metric.id || uuidv4();
  const { data, error } = await supabaseAdmin
    .from('discovery_metrics')
    .insert([{ ...metric, id }])
    .select()
    .single();
  return { data, error };
}

// Insert a discovered_people record
export async function insertDiscoveredPerson(person: DiscoveredPersonInsert) {
  const id = person.id || uuidv4();
  const { data, error } = await supabaseAdmin
    .from('discovered_people')
    .insert([{ ...person, id }])
    .select()
    .single();
  return { data, error };
}

// Insert a discovery_errors record
export async function insertDiscoveryError(errorRow: DiscoveryErrorInsert) {
  const id = errorRow.id || uuidv4();
  const { data, error } = await supabaseAdmin
    .from('discovery_errors')
    .insert([{ ...errorRow, id }])
    .select()
    .single();
  return { data, error };
}

// TODO: If you need project ID or schema, provide it here. 