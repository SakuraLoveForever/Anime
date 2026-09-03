-- Run this SQL in your Supabase project's SQL Editor (https://app.supabase.com)

-- === For existing installations: add covers column ===
-- ALTER TABLE anime_items ADD COLUMN IF NOT EXISTS covers jsonb DEFAULT '[]'::jsonb;

-- User settings (API keys, preferences)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key text DEFAULT '',
  api_provider text DEFAULT 'deepseek',
  api_url text DEFAULT 'https://api.deepseek.com',
  api_model text DEFAULT 'deepseek-v4-flash',
  theme text DEFAULT 'anime',
  search_history jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add the model field for existing Supabase projects created before model selection was added.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS api_model text DEFAULT 'deepseek-v4-flash';

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Anime items
CREATE TABLE IF NOT EXISTS anime_items (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  title text DEFAULT '',
  category text DEFAULT 'japanese_anime',
  status text DEFAULT 'towatch',
  episodes integer DEFAULT 0,
  current_ep integer DEFAULT 0,
  total_episodes integer DEFAULT 0,
  cover text DEFAULT '',
  url text DEFAULT '',
  synopsis text DEFAULT '',
  score real,
  genres jsonb DEFAULT '[]'::jsonb,
  covers jsonb DEFAULT '[]'::jsonb,
  year integer,
  source_url text DEFAULT '',
  folder_id text,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE anime_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own anime" ON anime_items
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Folders
CREATE TABLE IF NOT EXISTS folders (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text DEFAULT '',
  icon text DEFAULT '📁',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own folders" ON folders
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Sources
CREATE TABLE IF NOT EXISTS sources (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text DEFAULT '',
  url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sources" ON sources
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
