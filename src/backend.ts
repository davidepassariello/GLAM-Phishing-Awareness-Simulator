import { publicAnonKey } from "../utils/supabase/info"

const baseUrl = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, "")}/functions/v1/make-server-014813ea`
  : ""

export type PersistedEvent = {
  id: string
  id_email: string | null
  tipo_azione: string
  esito: "corretto" | "errato" | "neutro"
  timestamp: string
}

export type ServerEvent = PersistedEvent & {
  dettaglio: string
  origine: "server"
}

export type DialogueResponse = {
  testo?: string
  stop?: boolean
  fallback?: boolean
  numero_risposta: number
  limite_raggiunto: boolean
  evento_server?: ServerEvent
}

export class BackendError extends Error {
  data: Record<string, unknown>

  constructor(message: string, data: Record<string, unknown>) {
    super(message)
    this.name = "BackendError"
    this.data = data
  }
}

async function callBackend<T>(
  path: string,
  body: unknown,
  timeoutMs = 17_000,
): Promise<T> {
  if (!baseUrl || !publicAnonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local")
  }
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publicAnonKey,
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new BackendError(
        typeof data.error === "string"
          ? data.error
          : `backend_${response.status}`,
        data,
      )
    }
    return data as T
  } finally {
    window.clearTimeout(timeout)
  }
}

export function sendEvents(
  sessionId: string,
  attempt: number,
  events: PersistedEvent[],
) {
  return callBackend<{ inseriti: number; conflitti: number }>("/eventi", {
    id_sessione: sessionId,
    numero_tentativo: attempt,
    eventi: events,
  })
}

export function requestReply(input: {
  sessionId: string
  attempt: number
  emailId: string
  text: string
  timestamp: string
}) {
  return callBackend<DialogueResponse>("/dialogo", {
    id_sessione: input.sessionId,
    numero_tentativo: input.attempt,
    id_email: input.emailId,
    testo_utente: input.text,
    timestamp_rispondi: input.timestamp,
  })
}
