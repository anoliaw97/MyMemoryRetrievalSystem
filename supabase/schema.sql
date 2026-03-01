-- ─────────────────────────────────────────────────────────────────────────────
-- MyMemory – Supabase schema
-- Run this in the Supabase SQL editor to set up the database.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Table: memories ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       TEXT,                          -- future auth: Supabase Auth user id

  -- Lifecycle
  memory_type   TEXT NOT NULL CHECK (memory_type IN ('image', 'text', 'link')),
  status        TEXT NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'ready', 'failed')),

  -- Raw input
  raw_text      TEXT,                          -- for type='text'
  source_url    TEXT,                          -- for type='link'
  image_url     TEXT,                          -- Supabase Storage path (private bucket)
  user_notes    TEXT,                          -- user-supplied context/hint

  -- Groq-extracted fields (populated after processing)
  title         TEXT,
  extracted_text TEXT,
  summary_bullets JSONB,                       -- string[]
  tags          TEXT[],
  category      TEXT,
  confidence    REAL,                          -- 0.0 – 1.0
  language      TEXT,                          -- ISO-639-1 code, e.g. 'en'
  entities      JSONB,                         -- { people:[], orgs:[], places:[], products:[] }

  -- Error handling
  error_message TEXT,

  -- Timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_memories_updated_at ON memories;
CREATE TRIGGER trg_memories_updated_at
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_status     ON memories (status);
CREATE INDEX IF NOT EXISTS idx_memories_user_id    ON memories (user_id);
CREATE INDEX IF NOT EXISTS idx_memories_memory_type ON memories (memory_type);

-- Full-text search index on extracted content
CREATE INDEX IF NOT EXISTS idx_memories_fts ON memories
  USING gin(to_tsvector('english',
    coalesce(title, '') || ' ' ||
    coalesce(extracted_text, '') || ' ' ||
    coalesce(raw_text, '')
  ));

-- ─── Row-Level Security (enable when auth is integrated) ─────────────────────
-- Uncomment and adapt once you add Supabase Auth.

-- ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Users can manage their own memories"
--   ON memories FOR ALL
--   USING (auth.uid()::text = user_id)
--   WITH CHECK (auth.uid()::text = user_id);

-- ─── Storage bucket: memory-images ───────────────────────────────────────────
-- Run in the Supabase SQL editor (or use the dashboard Storage UI):
--
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('memory-images', 'memory-images', false)
-- ON CONFLICT (id) DO NOTHING;
--
-- Storage policies (service-role key bypasses RLS, so the admin client
-- can always read/write; restrict browser access below):
--
-- CREATE POLICY "Authenticated users can upload images"
--   ON storage.objects FOR INSERT
--   TO authenticated
--   WITH CHECK (bucket_id = 'memory-images');
--
-- CREATE POLICY "Authenticated users can read their images via signed URL"
--   ON storage.objects FOR SELECT
--   TO authenticated
--   USING (bucket_id = 'memory-images');

-- ─────────────────────────────────────────────────────────────────────────────
-- Pinecone index setup (reminder – not SQL, do this in the Pinecone console)
-- ─────────────────────────────────────────────────────────────────────────────
-- Index name   : value of PINECONE_INDEX_NAME env var
-- Dimension    : 1536  (text-embedding-3-small output)
-- Metric       : cosine
-- ─────────────────────────────────────────────────────────────────────────────
