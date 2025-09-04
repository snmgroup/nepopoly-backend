-- Supabase schema for Nepali Monopoly (use in Supabase SQL editor)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE game_status AS ENUM ('lobby','active','finished');
CREATE TYPE player_status AS ENUM ('active','left','kicked','bankrupt');
CREATE TYPE trade_status AS ENUM ('pending','accepted','rejected','cancelled','expired');

CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid,
  status game_status DEFAULT 'lobby',
  settings jsonb DEFAULT '{}'::jsonb,
  current_turn uuid,
  turn_expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid,
  name text,
  avatar text,
  position int DEFAULT 1,
  money int DEFAULT 10000,
  in_jail boolean DEFAULT false,
  jail_turns int DEFAULT 0,
  properties jsonb DEFAULT '[]'::jsonb,
  "order" int,
  is_connected boolean DEFAULT true,
  last_active timestamptz DEFAULT now(),
  status player_status DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties_static (
  id serial PRIMARY KEY,
  name text NOT NULL,
  tile_type text NOT NULL,
  group_name text,
  cost int,
  rent jsonb,
  meta jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS property_states (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  property_id int NOT NULL REFERENCES properties_static(id),
  owner_id uuid REFERENCES players(id),
  level int DEFAULT 0,
  mortgaged boolean DEFAULT false,
  UNIQUE (game_id, property_id)
);

CREATE TABLE IF NOT EXISTS cards (
  id bigserial PRIMARY KEY,
  deck text CHECK (deck IN ('chance','community')),
  text text,
  action jsonb,
  meta jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS game_events (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid,
  type text NOT NULL,
  data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  proposer_id uuid NOT NULL,
  responder_id uuid,
  offer jsonb NOT NULL,
  request jsonb NOT NULL,
  status trade_status DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS vote_kick (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  target_player_id uuid NOT NULL,
  voter_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(game_id, target_player_id, voter_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_state_snapshots (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_events_game ON game_events(game_id);
CREATE INDEX IF NOT EXISTS idx_trades_game ON trades(game_id);
CREATE INDEX IF NOT EXISTS idx_votes_game_target ON vote_kick(game_id, target_player_id);
CREATE INDEX IF NOT EXISTS idx_chat_game ON chat_messages(game_id);
