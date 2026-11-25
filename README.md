# GLAM Phishing Awareness Simulator

Research prototype for a master's thesis in Digital Humanities: phishing awareness in the GLAM sector using gamified Scenario-Based Learning. The project simulates an email client, logs decisions, and optionally generates character dialogue using the Anthropic API.

## Contents

- `src/`, `public/`: React + TypeScript frontend, assets and local scoring logic
- `supabase/functions/server/`: Supabase Edge Function (Deno + Hono)
- `supabase/migrations/`: PostgreSQL tables, indexes and RPC functions
- `docs/ARCHITECTURE.md`: data flow and limitations
- `package.json`, `pnpm-lock.yaml`: frontend dependencies


## Requirements

- Node.js version compatible with Vite 8 (Node >=20.19 or >=22.12).
- npm (with package-lock.json for reproducible dependency installation).
- A **new, independent** Supabase project for testing; do not use the thesis pilot's production project.
- Supabase CLI for deploying the SQL migration and Edge Function.
- Optional: Anthropic API key and supported model ID for AI-generated dialogue. Without these, the conversational feature is unavailable, while the email simulation and event logging can still operate.

## 1. Prepare the frontend

```bash
npm ci
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, replace `cp` with `Copy-Item .env.example .env.local`. Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` with values from the **test** Supabase project. Never add service-role or Anthropic keys to `VITE_` variables. The terminal prints the local address for the frontend.


## 2. Configure a new Supabase project

1. Create a fresh Supabase project. The original pilot database is not needed and must not be modified.
2. Open its **SQL Editor** and execute the SQL in `supabase/migrations/20260112000100_glam_dialogue.sql`. This creates the two tables and the `prenota_conversazione` / `inserisci_interazioni` RPC functions. Execute only on the empty test project. Alternatively, use the Supabase CLI migrations workflow.
3. Install the Supabase CLI following the official guide. From the project directory, run `supabase login`, then `supabase link --project-ref YOUR_NEW_PROJECT_REF`.
4. **Optional — Enable AI-generated dialogue:** To use the conversational feature, obtain your own valid Anthropic API key. In the Supabase Dashboard, open **Edge Functions → Secrets** and configure `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` with a supported model identifier. API credentials are not provided in this repository. Anthropic API usage may incur costs. Without these settings, the AI dialogue feature will not work, but the email simulation and event logging can still be used. Never store private API keys in the repository.
5. Deploy with `supabase functions deploy make-server-014813ea`. The Edge Function uses `supabase/functions/server/index.tsx` as entrypoint, which imports the Hono app in `app.ts`.
6. Copy your test project's URL and public `anon` key into `.env.local`. Run the frontend.

Paths, relative to the Edge Function URL:
- `GET /health` → service check
- `POST /eventi` → user event batches
- `POST /dialogo` → AI chat requests

**Authentication configuration:** The Supabase Edge Function is configured with `verify_jwt = false` to support anonymous participation in the research simulation. This setting is defined in `supabase/config.toml`.

## 3. Build

```bash
npm run build
```

Vite produces static output in `dist/` (gitignored).

## Reproducibility notes

- The migration contains only schema and stored procedures; it does not include the pilot's participant records.
- Real dialogue requires a **separate valid Anthropic key**, a working model ID, and API usage permissions. Outputs may vary between runs even with the same inputs.
- Local UI, scoring, historical screenshots and server-side responses are distinct concerns. Reproduction is not a guarantee of identical LLM output.
- This is a cleaned export of a Figma Make research prototype. It has not yet been validated end to end on a fresh Supabase account; complete the smoke test before claiming turnkey reproducibility.
- This repository must not contain participant logs, `.env.local`, Anthropic keys, service-role keys, or private credentials.

## References

- [Supabase Edge Functions deployment](https://supabase.com/docs/guides/functions/deploy)
- [Supabase database migrations](https://supabase.com/docs/guides/local-development/database-migrations)
- [Supabase secrets](https://supabase.com/docs/guides/functions/secrets)

## Academic context

Developed for an academic prototype addressing cybersecurity awareness for Galleries, Libraries, Archives and Museums.
