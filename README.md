# GLAM Phishing Awareness Simulator

Research prototype developed for a master's thesis in Digital Humanities, focusing on cybersecurity awareness in the GLAM sector (Galleries, Libraries, Archives and Museums) through gamified Scenario-Based Learning.

The application simulates an email client, allows users to identify and manage phishing attempts, records their decisions, and supports optional AI-generated conversations with simulated characters through the Anthropic API.

## Contents

- `src/`, `public/`: React and TypeScript frontend, assets and local scoring logic.
- `supabase/functions/server/`: Supabase Edge Function developed with Deno, Hono and TypeScript.
- `supabase/migrations/`: PostgreSQL tables, indexes and RPC functions.
- `docs/ARCHITECTURE.md`: system architecture, data flow and limitations.
- `package.json`, `package-lock.json`: frontend dependencies and reproducible installation.

## Requirements

- Node.js compatible with Vite 8 (Node.js >=20.19 or >=22.12).
- npm.
- A free Supabase account and a new, independent project.
- Supabase CLI, which can be executed through `npx`.
- Optional: a valid Anthropic API key and supported model identifier for AI-generated dialogue.

## 1. Download and install

Clone the repository or download it as a ZIP file and extract it.

Open a terminal in the project's root directory and install the dependencies:

```bash
npm ci
```

Create a `.env.local` file from the provided `.env.example` template.

On Windows Command Prompt:

```cmd
copy .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

On macOS or Linux:

```bash
cp .env.example .env.local
```

The environment variables will be configured after creating the Supabase project.

## 2. Configure Supabase

1. Sign in to [Supabase](https://supabase.com/) and create a new project. The original thesis database is not required.
2. Open **SQL Editor** in the new project.
3. Execute the SQL script located at:

   `supabase/migrations/20260112000100_glam_dialogue.sql`

   This creates the PostgreSQL tables `interazioni_utente` and `conversazioni`, along with indexes and RPC functions such as `inserisci_interazioni` and `prenota_conversazione`.

4. From the local project directory, authenticate with Supabase:

   ```bash
   npx supabase login
   ```

5. Link the local project to your new Supabase project:

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

   Replace `YOUR_PROJECT_REF` with the Project ID available in the Supabase Dashboard.

6. Deploy the Edge Function:

   ```bash
   npx supabase functions deploy make-server-014813ea
   ```

The Edge Function uses `supabase/functions/server/index.tsx` as its entrypoint and imports the Hono application defined in `app.ts`.

**Authentication configuration:** The Edge Function uses `verify_jwt = false` to support anonymous participation in the research simulation, as specified in `supabase/config.toml`. Public deployments require appropriate safeguards against unauthorized use.

## 3. Configure the frontend

Open `.env.local` and insert the URL and publishable key of your new Supabase project:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
```

Both values are available in the Supabase Dashboard.

Never insert private Anthropic API keys, Supabase secret keys or service-role credentials into frontend environment variables.

The `.env.local` file is excluded from Git version control.

## 4. Run the simulator

Start the frontend development server:

```bash
npm run dev
```

Open the local URL displayed in the terminal, typically:

`http://localhost:8443/`

The simulator can now be used to navigate the simulated email client and perform actions.

When correctly configured, these events are transmitted to the Supabase Edge Function and stored in the PostgreSQL database.

To verify event logging, open **Supabase Dashboard → Table Editor → interazioni_utente** and check whether new records appear after interacting with the simulator.

## 5. Optional: enable AI-generated dialogue

The simulator integrates the Anthropic API to generate contextual responses from simulated characters.

**API credentials are not included in this repository.**

To enable this feature:

1. Obtain your own valid Anthropic API key.
2. Open **Supabase Dashboard → Edge Functions → Secrets**.
3. Configure the following environment variables:
   - `ANTHROPIC_API_KEY`: your personal Anthropic API key.
   - `ANTHROPIC_MODEL`: a supported model identifier compatible with the application.
4. Ensure your Anthropic account has the necessary API permissions and credits.

Anthropic API usage may incur costs.

Without these credentials, the email simulation, local scoring and event logging remain available, but live AI-generated dialogue cannot be used.

## 6. Backend endpoints

The Supabase Edge Function exposes the following HTTP endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Check service availability |
| POST | `/eventi` | Receive and record user events |
| POST | `/dialogo` | Manage AI-generated conversations |

These paths are relative to the deployed Edge Function URL.

## 7. Build

To compile the frontend for distribution:

```bash
npm run build
```

Vite generates the compiled files in the `dist/` directory, which is excluded from Git version control.

## Reproducibility and limitations

The project has been exported from Figma Make and configured for independent execution.

The following components have been successfully verified in a separate testing environment:

- Frontend dependency installation using `npm ci`.
- Local React application execution using Vite.
- Production build using `npm run build`.
- PostgreSQL schema creation in a new Supabase project.
- Supabase Edge Function deployment and `/health` endpoint response.
- HTTP communication between the frontend and backend.
- User event persistence in the `interazioni_utente` table.

The complete AI conversation flow has not been independently tested in the new environment, since it requires a valid personal Anthropic API key.

Generated dialogue may vary between executions because of the probabilistic nature of language models and possible changes to the external service.

The repository contains source code and database structure, but does not include participant records from the thesis pilot study, private credentials or the original Supabase database.

## References

- [Supabase Edge Functions deployment](https://supabase.com/docs/guides/functions/deploy)
- [Supabase database migrations](https://supabase.com/docs/guides/local-development/database-migrations)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)

## Academic context

Developed as part of a master's thesis in Digital Humanities on cybersecurity awareness in the GLAM sector, using a gamified Scenario-Based Learning approach to simulate phishing-related decision-making.
