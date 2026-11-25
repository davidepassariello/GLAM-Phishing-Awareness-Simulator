// Entry point for the Supabase Edge Function.
// The routes live in app.ts; they must be imported explicitly.
import { app } from "./app.ts"

Deno.serve(app.fetch)
