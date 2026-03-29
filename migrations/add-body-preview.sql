-- Add bodyPreview column to email_cache
ALTER TABLE email_cache ADD COLUMN IF NOT EXISTS body_preview text;

-- Add index for faster text searches
CREATE INDEX IF NOT EXISTS idx_email_cache_body_preview ON email_cache USING gin (to_tsvector('english', coalesce(body_preview, '')));
