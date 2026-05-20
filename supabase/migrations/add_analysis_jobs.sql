CREATE TABLE analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  producto TEXT NOT NULL,
  pais TEXT NOT NULL,
  costo_estimado NUMERIC,
  imagen_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  -- status values: pending | scraping | analyzing | done | error
  step_message TEXT,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own jobs"
  ON analysis_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs"
  ON analysis_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Solo el service role puede hacer UPDATE (lo hace Inngest desde el server)
CREATE POLICY "Service role can update jobs"
  ON analysis_jobs FOR UPDATE
  USING (true);
