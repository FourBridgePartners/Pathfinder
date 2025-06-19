-- Create linkedin_tokens table for storing LinkedIn OAuth tokens
CREATE TABLE IF NOT EXISTS linkedin_tokens (
  user_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on expires_at for efficient token expiration queries
CREATE INDEX IF NOT EXISTS idx_linkedin_tokens_expires_at ON linkedin_tokens(expires_at);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at on row updates
CREATE TRIGGER update_linkedin_tokens_updated_at 
  BEFORE UPDATE ON linkedin_tokens 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS (Row Level Security) policies
ALTER TABLE linkedin_tokens ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to only see their own tokens
CREATE POLICY "Users can view own tokens" ON linkedin_tokens
  FOR SELECT USING (auth.uid()::text = user_id);

-- Policy to allow users to insert their own tokens
CREATE POLICY "Users can insert own tokens" ON linkedin_tokens
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Policy to allow users to update their own tokens
CREATE POLICY "Users can update own tokens" ON linkedin_tokens
  FOR UPDATE USING (auth.uid()::text = user_id);

-- Policy to allow users to delete their own tokens
CREATE POLICY "Users can delete own tokens" ON linkedin_tokens
  FOR DELETE USING (auth.uid()::text = user_id);

-- Grant necessary permissions
GRANT ALL ON linkedin_tokens TO authenticated;
GRANT ALL ON linkedin_tokens TO service_role; 