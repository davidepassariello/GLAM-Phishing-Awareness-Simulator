# Architecture and research scope

- Frontend: Vite, React, TypeScript. The UI and local scoring logic are in `src/App.tsx`.
- Backend: one Supabase Edge Function, implemented in TypeScript with Deno + Hono (`supabase/functions/server/app.ts`).
- HTTP: `POST /eventi`, `POST /dialogo`, `GET /health` under `/functions/v1/make-server-014813ea`.
- PostgreSQL: schema and RPCs in `supabase/migrations/20260112000100_glam_dialogue.sql`.
- Anthropic Messages API: invoked by the Edge Function only; API key must be a Supabase secret.

## Data paths

1. The UI batches user actions and POSTs them to `/eventi`. The backend invokes `inserisci_interazioni` via Supabase RPC. Event UUIDs allow duplicate submissions to be ignored.
2. The UI POSTs chat messages to `/dialogo`. The backend invokes `prenota_conversazione`, retrieves completed history from PostgreSQL, calls Anthropic, updates the conversation record, and returns the answer (or a fallback).
3. The database tables `interazioni_utente` and `conversazioni` contain research events and exchanges. Do **not** commit actual participant records.

## Important limitations

- This archive preserves the exported research prototype; a fresh deployment with a **separate Supabase project** and a valid Anthropic API key is required for full reproduction.
- Edge Function request auth, CORS policy, request limits and RLS should be security-reviewed before any public production deployment. The example is for research demonstration, not a production-secured public service.
- Database migration is schema only, not participant data.
- For exact reconstruction of the historical deployment, platform-specific settings and the model version from the original Supabase environment may also be needed.
