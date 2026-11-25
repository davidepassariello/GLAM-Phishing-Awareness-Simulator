create extension if not exists pgcrypto;

create table if not exists public.conversazioni (
  id uuid primary key default gen_random_uuid(),
  id_sessione text not null,
  numero_tentativo integer not null check (numero_tentativo >= 1),
  id_email text not null check (id_email in ('email_1', 'email_2', 'email_3', 'email_4', 'email_5')),
  testo_utente text not null,
  testo_risposta_ia text not null default '',
  modello text not null,
  versione_prompt text not null,
  timestamp timestamptz not null default now(),
  stato text not null check (stato in ('in_corso', 'completata', 'fallback', 'stop'))
);

create index if not exists conversazioni_tentativo_email_idx
  on public.conversazioni (id_sessione, numero_tentativo, id_email, timestamp);
create index if not exists conversazioni_tentativo_idx
  on public.conversazioni (id_sessione, numero_tentativo, timestamp);
create index if not exists conversazioni_sessione_idx
  on public.conversazioni (id_sessione, timestamp);

create table if not exists public.interazioni_utente (
  id uuid primary key,
  id_sessione text not null,
  numero_tentativo integer not null check (numero_tentativo >= 1),
  id_email text null check (id_email is null or id_email in ('email_1', 'email_2', 'email_3', 'email_4', 'email_5')),
  tipo_azione text not null check (
    tipo_azione in (
      'inizio_sessione', 'apri_email', 'verifica_link', 'click_link',
      'rispondi', 'segnala', 'archivia', 'ignora', 'termina', 'esci',
      'credenziali_inserite', 'errore_tecnico', 'stop_attivato'
    )
  ),
  esito text not null check (esito in ('corretto', 'errato', 'neutro')),
  timestamp timestamptz not null
);

create index if not exists interazioni_sessione_tentativo_idx
  on public.interazioni_utente (id_sessione, numero_tentativo, timestamp);

alter table public.conversazioni enable row level security;
alter table public.conversazioni force row level security;
alter table public.interazioni_utente enable row level security;
alter table public.interazioni_utente force row level security;

revoke all on public.conversazioni from anon, authenticated;
revoke all on public.interazioni_utente from anon, authenticated;

create or replace function public.prenota_conversazione(
  p_id_sessione text,
  p_numero_tentativo integer,
  p_id_email text,
  p_testo_utente text,
  p_modello text,
  p_versione_prompt text
)
returns table (id uuid, numero_risposta integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email_count integer;
  v_session_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id_sessione, 0));

  select count(*) into v_session_count
  from public.conversazioni
  where id_sessione = p_id_sessione;

  if v_session_count >= 20 then
    raise exception 'limit_session_total';
  end if;

  select count(*) into v_email_count
  from public.conversazioni
  where id_sessione = p_id_sessione
    and id_email = p_id_email;

  if v_email_count >= 4 then
    raise exception 'limit_email_total';
  end if;

  insert into public.conversazioni (
    id_sessione,
    numero_tentativo,
    id_email,
    testo_utente,
    testo_risposta_ia,
    modello,
    versione_prompt,
    stato
  ) values (
    p_id_sessione,
    p_numero_tentativo,
    p_id_email,
    p_testo_utente,
    '',
    p_modello,
    p_versione_prompt,
    'in_corso'
  )
  returning conversazioni.id into v_id;

  return query select v_id, v_email_count + 1;
end;
$$;

create or replace function public.inserisci_interazioni(
  p_id_sessione text,
  p_numero_tentativo integer,
  p_eventi jsonb
)
returns table (inseriti integer, conflitti integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ricevuti integer;
  v_inseriti integer;
begin
  select jsonb_array_length(p_eventi) into v_ricevuti;

  with righe as (
    select *
    from jsonb_to_recordset(p_eventi) as x(
      id uuid,
      id_email text,
      tipo_azione text,
      esito text,
      "timestamp" timestamptz
    )
  ),
  aggiunte as (
    insert into public.interazioni_utente (
      id,
      id_sessione,
      numero_tentativo,
      id_email,
      tipo_azione,
      esito,
      timestamp
    )
    select
      id,
      p_id_sessione,
      p_numero_tentativo,
      id_email,
      tipo_azione,
      esito,
      "timestamp"
    from righe
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_inseriti from aggiunte;

  return query select v_inseriti, v_ricevuti - v_inseriti;
end;
$$;

revoke all on function public.prenota_conversazione(text, integer, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.inserisci_interazioni(text, integer, jsonb)
  from public, anon, authenticated;

grant execute on function public.prenota_conversazione(text, integer, text, text, text, text)
  to service_role;
grant execute on function public.inserisci_interazioni(text, integer, jsonb)
  to service_role;
