-- Create discovery_metrics table
CREATE TABLE IF NOT EXISTS discovery_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input TEXT NOT NULL,
  input_type TEXT NOT NULL,
  methods JSONB NOT NULL,
  total_people INTEGER NOT NULL DEFAULT 0,
  total_mutuals INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_messages JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT
);

-- Create discovered_people table
CREATE TABLE IF NOT EXISTS discovered_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_id UUID REFERENCES discovery_metrics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  linkedin_url TEXT,
  title TEXT,
  page_url TEXT,
  company TEXT,
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create discovery_errors table
CREATE TABLE IF NOT EXISTS discovery_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_id UUID REFERENCES discovery_metrics(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_discovery_metrics_created_at ON discovery_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_discovery_metrics_input ON discovery_metrics(input);
CREATE INDEX IF NOT EXISTS idx_discovered_people_discovery_id ON discovered_people(discovery_id);
CREATE INDEX IF NOT EXISTS idx_discovered_people_linkedin_url ON discovered_people(linkedin_url);
CREATE INDEX IF NOT EXISTS idx_discovery_errors_discovery_id ON discovery_errors(discovery_id);

-- Enable Row Level Security
ALTER TABLE discovery_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovered_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_errors ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own discovery metrics" ON discovery_metrics
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own discovery metrics" ON discovery_metrics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own discovered people" ON discovered_people
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM discovery_metrics 
      WHERE discovery_metrics.id = discovered_people.discovery_id 
      AND discovery_metrics.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert discovered people for their discoveries" ON discovered_people
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM discovery_metrics 
      WHERE discovery_metrics.id = discovered_people.discovery_id 
      AND discovery_metrics.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own discovery errors" ON discovery_errors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM discovery_metrics 
      WHERE discovery_metrics.id = discovery_errors.discovery_id 
      AND discovery_metrics.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert discovery errors for their discoveries" ON discovery_errors
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM discovery_metrics 
      WHERE discovery_metrics.id = discovery_errors.discovery_id 
      AND discovery_metrics.user_id = auth.uid()
    )
  ); 