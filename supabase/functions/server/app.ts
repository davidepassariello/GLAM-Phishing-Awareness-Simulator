import { createClient } from "jsr:@supabase/supabase-js@2.49.8"
import { Hono } from "npm:hono"
import { cors } from "npm:hono/cors"
import { logger } from "npm:hono/logger"
import { EMAIL_PROMPTS, FALLBACK_REPLY, PROMPT_VERSION } from "./prompts.ts"
import { maskText, stripUrls } from "./privacy.ts"

export const app = new Hono()

const prefix = "/make-server-014813ea"
const emailIds = new Set([
  "email_1",
  "email_2",
  "email_3",
  "email_4",
  "email_5",
])
const actionTypes = new Set([
  "inizio_sessione",
  "apri_email",
  "verifica_link",
  "click_link",
  "rispondi",
  "segnala",
  "archivia",
  "ignora",
  "termina",
  "esci",
  "credenziali_inserite",
  "errore_tecnico",
  "stop_attivato",
])
const outcomes = new Set(["corretto", "errato", "neutro"])

app.use("*", logger(console.log))
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
)

function db() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  )
}

function validSession(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 6 &&
    value.length <= 100 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  )
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    !Number.isNaN(Date.parse(value))
  )
}

function makeServerEvent(
  emailId: string,
  action: "stop_attivato" | "errore_tecnico",
  timestamp: string,
  detail: string,
) {
  return {
    id: crypto.randomUUID(),
    id_email: emailId,
    tipo_azione: action,
    esito: "neutro" as const,
    timestamp,
    dettaglio: detail,
    origine: "server" as const,
  }
}

async function insertEvents(
  sessionId: string,
  attempt: number,
  events: Array<Record<string, unknown>>,
) {
  const { data, error } = await db().rpc("inserisci_interazioni", {
    p_id_sessione: sessionId,
    p_numero_tentativo: attempt,
    p_eventi: events.map((event) => ({
      id: event.id,
      id_email: event.id_email,
      tipo_azione: event.tipo_azione,
      esito: event.esito,
      timestamp: event.timestamp,
    })),
  })
  if (error) throw new Error(`database_event_error:${error.message}`)
  return data?.[0] ?? { inseriti: 0, conflitti: 0 }
}

async function insertTechnicalEvent(
  sessionId: string,
  attempt: number,
  emailId: string,
  timestamp: string,
  detail: string,
) {
  const event = makeServerEvent(emailId, "errore_tecnico", timestamp, detail)
  try {
    await insertEvents(sessionId, attempt, [event])
    return event
  } catch (error) {
    console.error("technical_event_insert_failed", String(error))
    return undefined
  }
}

app.get(`${prefix}/health`, (c) => c.json({ status: "ok" }))

app.post(`${prefix}/eventi`, async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "invalid_json" }, 400)
  }

  const sessionId = body.id_sessione
  const attempt = body.numero_tentativo
  const events = body.eventi
  if (
    !validSession(sessionId) ||
    !Number.isInteger(attempt) ||
    Number(attempt) < 1 ||
    !Array.isArray(events) ||
    events.length < 1 ||
    events.length > 100
  ) {
    return c.json({ error: "invalid_event_batch" }, 400)
  }

  for (const event of events) {
    if (
      typeof event !== "object" ||
      event === null ||
      typeof event.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        event.id,
      ) ||
      (event.id_email !== null && !emailIds.has(event.id_email)) ||
      !actionTypes.has(event.tipo_azione) ||
      !outcomes.has(event.esito) ||
      !validTimestamp(event.timestamp) ||
      event.origine === "server"
    ) {
      return c.json({ error: "invalid_event" }, 400)
    }
  }

  try {
    return c.json(await insertEvents(sessionId, Number(attempt), events))
  } catch (error) {
    console.error("event_insert_failed", String(error))
    return c.json({ error: "event_insert_failed" }, 500)
  }
})

app.post(`${prefix}/dialogo`, async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "invalid_json" }, 400)
  }

  const sessionId = body.id_sessione
  const attempt = body.numero_tentativo
  const emailId = body.id_email
  const userText = body.testo_utente
  const replyTimestamp = body.timestamp_rispondi
  if (
    !validSession(sessionId) ||
    !Number.isInteger(attempt) ||
    Number(attempt) < 1 ||
    typeof emailId !== "string" ||
    !emailIds.has(emailId) ||
    typeof userText !== "string" ||
    userText.trim().length === 0 ||
    !validTimestamp(replyTimestamp)
  ) {
    return c.json({ error: "invalid_dialogue_request" }, 400)
  }
  if (userText.length > 500) {
    return c.json({ error: "text_too_long", max_length: 500 }, 413)
  }

  const model = Deno.env.get("ANTHROPIC_MODEL")
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!model || !apiKey) {
    const code = model ? "missing_anthropic_api_key" : "missing_anthropic_model"
    const event = await insertTechnicalEvent(
      sessionId,
      Number(attempt),
      emailId,
      replyTimestamp,
      code,
    )
    return c.json({ error: code, evento_server: event }, 500)
  }

  // Chiamate separate, predisposte per il mascheramento B2.
  const textForModel = maskText(userText)
  const textForStorage = maskText(userText)
  const client = db()
  const { data: reservations, error: reservationError } = await client.rpc(
    "prenota_conversazione",
    {
      p_id_sessione: sessionId,
      p_numero_tentativo: Number(attempt),
      p_id_email: emailId,
      p_testo_utente: textForStorage,
      p_modello: model,
      p_versione_prompt: PROMPT_VERSION,
    },
  )

  if (reservationError || !reservations?.[0]) {
    const reason = reservationError?.message ?? "reservation_failed"
    const limit = reason.match(/limit_[a-z_]+/)?.[0]
    if (limit) return c.json({ error: limit }, 429)
    console.error("conversation_reservation_failed", reason)
    return c.json({ error: "conversation_reservation_failed" }, 500)
  }

  const reservation = reservations[0] as {
    id: string
    numero_risposta: number
  }

  try {
    const { data: history, error: historyError } = await client
      .from("conversazioni")
      .select("testo_utente,testo_risposta_ia,timestamp")
      .eq("id_sessione", sessionId)
      .eq("numero_tentativo", Number(attempt))
      .eq("id_email", emailId)
      .in("stato", ["completata", "fallback"])
      .neq("id", reservation.id)
      .order("timestamp", { ascending: true })
    if (historyError) throw new Error(`history_error:${historyError.message}`)

    const messages: Array<{
      role: "user" | "assistant"
      content: string
    }> = []
    for (const row of history ?? []) {
      messages.push({ role: "user", content: row.testo_utente })
      messages.push({ role: "assistant", content: row.testo_risposta_ia })
    }
    messages.push({ role: "user", content: textForModel })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    let response: Response
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          system: EMAIL_PROMPTS[emailId],
          messages,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
    if (!response.ok) throw new Error(`anthropic_http_${response.status}`)

    const result = await response.json()
    const rawReply = Array.isArray(result.content)
      ? result.content
          .filter((block: { type?: string }) => block.type === "text")
          .map((block: { text?: string }) => block.text ?? "")
          .join("\n")
      : ""
    const safeReply = stripUrls(maskText(rawReply))
    if (!safeReply) throw new Error("empty_model_reply")

    if (safeReply === "[STOP]") {
      const { error: updateError } = await client
        .from("conversazioni")
        .update({ testo_risposta_ia: "[STOP]", stato: "stop" })
        .eq("id", reservation.id)
      if (updateError) {
        throw new Error(`conversation_update_error:${updateError.message}`)
      }
      const event = makeServerEvent(
        emailId,
        "stop_attivato",
        replyTimestamp,
        "arresto_richiesto",
      )
      await insertEvents(sessionId, Number(attempt), [event])
      return c.json({
        stop: true,
        numero_risposta: reservation.numero_risposta,
        limite_raggiunto: reservation.numero_risposta >= 4,
        evento_server: event,
      })
    }

    const { error: updateError } = await client
      .from("conversazioni")
      .update({ testo_risposta_ia: safeReply, stato: "completata" })
      .eq("id", reservation.id)
    if (updateError) {
      throw new Error(`conversation_update_error:${updateError.message}`)
    }
    return c.json({
      testo: safeReply,
      numero_risposta: reservation.numero_risposta,
      limite_raggiunto: reservation.numero_risposta >= 4,
      fallback: false,
    })
  } catch (error) {
    console.error(
      "dialogue_fallback",
      error instanceof Error ? error.message : "unknown_error",
    )
    await client
      .from("conversazioni")
      .update({ testo_risposta_ia: FALLBACK_REPLY, stato: "fallback" })
      .eq("id", reservation.id)
    const event = await insertTechnicalEvent(
      sessionId,
      Number(attempt),
      emailId,
      replyTimestamp,
      "fallback_dialogo",
    )
    return c.json({
      testo: FALLBACK_REPLY,
      numero_risposta: reservation.numero_risposta,
      limite_raggiunto: reservation.numero_risposta >= 4,
      fallback: true,
      evento_server: event,
    })
  }
})
