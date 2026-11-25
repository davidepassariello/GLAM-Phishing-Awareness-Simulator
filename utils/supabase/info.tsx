// Public client configuration. Do not put server-side API keys here.
// Set the variables in .env.local (see .env.example).
const url = import.meta.env.VITE_SUPABASE_URL ?? ""
export const projectId = (() => {
  try {
    return new URL(url).hostname.split(".")[0]
  } catch {
    return ""
  }
})()
export const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""
