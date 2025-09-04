Nepali Monopoly — Node.js Game Server (TypeScript)
=================================================
This repository is a starter backend implementing an authoritative game server for Nepali Monopoly:
- Express + Socket.IO server for realtime gameplay
- TypeScript
- Redis for shared in-memory state, locks, and timers
- Supabase (Postgres) admin SQL for tables + persistence
- Core features: game state, turn management, reconnect, vote-kick, trade flow, snapshots, events log

IMPORTANT: Replace placeholder environment variables in .env before running.

Quick start (development):
1. Install dependencies:
   npm install
2. Build TypeScript:
   npm run build
3. Start dev server (ts-node):
   npm run dev
4. Or start production:
   npm run start

Environment variables (create .env file):
  PORT=3000
  REDIS_URL=redis://localhost:6379
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_ANON_KEY=your_anon_key
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
  SUPABASE_SCHEMA_PUBLIC_ONLY=true   # optional

What is included:
- src/index.ts            : server bootstrap (Express + Socket.IO)
- src/auth.ts             : JWT verification using Supabase public key
- src/supabaseClient.ts   : Supabase client helper (uses service role key)
- src/gameManager.ts      : Core game logic (in-memory + Redis persistence hooks)
- src/types.ts            : Shared TypeScript types / interfaces
- migrations/supabase_schema.sql : SQL to create necessary tables in Supabase
- scripts/seed_properties.sql : sample seed data for board & cards
- docker-compose.yml      : example to run Redis + Postgres locally (optional)

