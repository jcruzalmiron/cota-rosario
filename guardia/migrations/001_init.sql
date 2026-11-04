-- 001 · Base del backoffice: organizaciones, usuarios, incidentes, guardia, jobs,
-- bitácora, informes y CRM. Instantes en timestamptz (UTC); la UI presenta en
-- America/Argentina/Buenos_Aires. Los datos faltantes se guardan como NULL explícito.

CREATE TABLE organization (
  id          text PRIMARY KEY,
  name        text NOT NULL
);

CREATE TABLE app_user (
  id              text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id),
  display_name    text NOT NULL,
  roles           text[] NOT NULL DEFAULT '{}',
  active          boolean NOT NULL DEFAULT true
);

-- ── O1 · Incidentes ─────────────────────────────────────────────────────────
CREATE TABLE incident (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     text NOT NULL REFERENCES organization(id),
  origin              text NOT NULL CHECK (origin IN ('llamada','radio','whatsapp','cota','manual')),
  category            text,
  priority_suggested  smallint CHECK (priority_suggested BETWEEN 1 AND 4),
  priority_confirmed  smallint CHECK (priority_confirmed BETWEEN 1 AND 4),
  description         text,
  location_text       text,
  location_precision  text CHECK (location_precision IN ('direccion','interseccion','referencia','coordenada')),
  lat                 double precision,
  lng                 double precision,
  status              text NOT NULL DEFAULT 'nuevo'
                      CHECK (status IN ('nuevo','en_revision','asignado','derivacion_pendiente','derivado','cerrado')),
  intake_complete     boolean NOT NULL DEFAULT false,
  assigned_to         text,
  duplicate_of        uuid REFERENCES incident(id),
  created_at          timestamptz NOT NULL,
  updated_at          timestamptz NOT NULL,
  version             integer NOT NULL DEFAULT 1
);
CREATE INDEX incident_org_status ON incident (organization_id, status, created_at);

-- Contacto separado para acotar acceso (no se expone en listados ni métricas).
CREATE TABLE incident_contact (
  incident_id  uuid PRIMARY KEY REFERENCES incident(id),
  caller_name  text,
  phone        text,
  anonymous    boolean NOT NULL DEFAULT false
);

CREATE TABLE incident_event (
  id           bigserial PRIMARY KEY,
  incident_id  uuid NOT NULL REFERENCES incident(id),
  kind         text NOT NULL,
  from_status  text,
  to_status    text,
  version      integer NOT NULL,
  at           timestamptz NOT NULL,
  actor        text NOT NULL,
  reason       text,
  data         jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX incident_event_incident ON incident_event (incident_id, id);

-- O2 · Excepción autorizada para avanzar con datos faltantes.
CREATE TABLE intake_exception (
  id              bigserial PRIMARY KEY,
  incident_id     uuid NOT NULL REFERENCES incident(id),
  missing_fields  text[] NOT NULL,
  reason          text NOT NULL,
  actor           text NOT NULL,
  at              timestamptz NOT NULL,
  completed_at    timestamptz
);

-- ── O2/O3 · Despacho, novedades y avisos ───────────────────────────────────
CREATE TABLE dispatch (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       text NOT NULL REFERENCES organization(id),
  incident_id           uuid NOT NULL REFERENCES incident(id),
  mobile_code           text NOT NULL,
  operator              text NOT NULL,
  dispatched_at         timestamptz NOT NULL,
  external_ref          text,                          -- referencia manual a Bravo/Brau
  idempotency_key       text NOT NULL UNIQUE,
  status                text NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','en_lugar','retornado','cancelado')),
  arrived_at            timestamptz,
  panorama_pending      boolean NOT NULL DEFAULT false,
  last_valid_update_at  timestamptz,
  update_seq            integer NOT NULL DEFAULT 0,
  UNIQUE (incident_id, mobile_code, dispatched_at)
);
CREATE INDEX dispatch_active ON dispatch (organization_id, status);

CREATE TABLE mobile_update (
  id           bigserial PRIMARY KEY,
  dispatch_id  uuid NOT NULL REFERENCES dispatch(id),
  kind         text NOT NULL CHECK (kind IN ('novedad','arribo','panorama','retorno')),
  observed_at  timestamptz NOT NULL,
  received_at  timestamptz NOT NULL,
  actor        text NOT NULL,
  channel      text NOT NULL CHECK (channel IN ('radio','app','telefono','manual')),
  body         text,
  source_key   text NOT NULL UNIQUE
);

CREATE TABLE guard_alert (
  id            bigserial PRIMARY KEY,
  dispatch_id   uuid NOT NULL REFERENCES dispatch(id),
  window_start  timestamptz NOT NULL,     -- despacho o última novedad válida que originó el reloj
  due_at        timestamptz NOT NULL,
  fired_at      timestamptz NOT NULL,
  acked_at      timestamptz,
  acked_by      text,
  resolved_at   timestamptz,
  resolution    text,
  UNIQUE (dispatch_id, window_start)
);

-- ── Cola durable ────────────────────────────────────────────────────────────
CREATE TABLE job (
  id               bigserial PRIMARY KEY,
  kind             text NOT NULL,
  payload          jsonb NOT NULL,
  idempotency_key  text NOT NULL UNIQUE,
  run_at           timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_curso','hecho','fallido','cancelado')),
  attempts         integer NOT NULL DEFAULT 0,
  max_attempts     integer NOT NULL DEFAULT 5,
  locked_until     timestamptz,
  last_error       text
);
CREATE INDEX job_ready ON job (status, run_at);

-- ── B1 · Bitácora ──────────────────────────────────────────────────────────
CREATE TABLE intervention (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  text NOT NULL REFERENCES organization(id),
  incident_id      uuid REFERENCES incident(id),
  external_ref     text,
  title            text NOT NULL,
  started_at       timestamptz,
  created_at       timestamptz NOT NULL,
  revision         integer NOT NULL DEFAULT 1
);

CREATE TABLE log_event (
  id               bigserial PRIMARY KEY,
  intervention_id  uuid NOT NULL REFERENCES intervention(id),
  at               timestamptz,           -- NULL = hora pendiente
  action           text,
  unit             text,
  place            text,
  evidence         jsonb NOT NULL,        -- {source:'texto'|'audio', ref, start?, end?, excerpt}
  status           text NOT NULL DEFAULT 'candidato' CHECK (status IN ('candidato','aceptado','rechazado')),
  author           text NOT NULL,
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL
);

-- ── B3 · Informes ──────────────────────────────────────────────────────────
CREATE TABLE report_template (
  id        bigserial PRIMARY KEY,
  kind      text NOT NULL,
  version   integer NOT NULL,
  status    text NOT NULL CHECK (status IN ('pendiente_validacion','aprobada','retirada')),
  schema    jsonb NOT NULL,
  UNIQUE (kind, version)
);

CREATE TABLE report_revision (
  id               bigserial PRIMARY KEY,
  organization_id  text NOT NULL REFERENCES organization(id),
  intervention_id  uuid REFERENCES intervention(id),
  template_id      bigint NOT NULL REFERENCES report_template(id),
  revision_no      integer NOT NULL,
  field_values     jsonb NOT NULL,
  field_sources    jsonb NOT NULL,
  status           text NOT NULL CHECK (status IN ('incompleto','listo_para_revisar','observado','aprobado','exportado')),
  author           text NOT NULL,
  approver         text,
  approved_at      timestamptz,
  rendered         text,
  checksum         text,
  created_at       timestamptz NOT NULL,
  UNIQUE (intervention_id, revision_no)
);

-- ── A1 · CRM (permisos propios; sin datos judiciales ni de denunciantes) ──
CREATE TABLE crm_company (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  text NOT NULL REFERENCES organization(id),
  name             text NOT NULL,
  notes            text,
  created_at       timestamptz NOT NULL
);

CREATE TABLE crm_contact (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES crm_company(id),
  name        text NOT NULL,
  role        text,
  phone       text,
  email       text
);

CREATE TABLE crm_interaction (
  id          bigserial PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES crm_company(id),
  at          timestamptz NOT NULL,
  actor       text NOT NULL,
  channel     text NOT NULL,
  summary     text NOT NULL
);

CREATE TABLE crm_task (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES crm_company(id),
  title       text NOT NULL,
  owner       text NOT NULL,
  due_at      timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','hecha','cancelada')),
  result      text,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL
);

CREATE TABLE crm_reminder (
  id          bigserial PRIMARY KEY,
  task_id     uuid NOT NULL REFERENCES crm_task(id),
  due_at      timestamptz NOT NULL,
  channel     text NOT NULL DEFAULT 'tablero',
  fired_at    timestamptz NOT NULL,
  UNIQUE (task_id, due_at, channel)
);

CREATE TABLE crm_event (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  text NOT NULL REFERENCES organization(id),
  name             text NOT NULL,
  starts_at        timestamptz,            -- NULL hasta confirmar fecha
  venue            text,
  table_capacity   integer NOT NULL CHECK (table_capacity >= 0),
  created_at       timestamptz NOT NULL
);

CREATE TABLE crm_reservation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES crm_event(id),
  company_id    uuid REFERENCES crm_company(id),
  holder_label  text NOT NULL,
  tables        integer NOT NULL CHECK (tables > 0),
  status        text NOT NULL CHECK (status IN ('provisoria','confirmada','cancelada','vencida')),
  expires_at    timestamptz,
  payment_ref   text,
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL
);
CREATE UNIQUE INDEX crm_reservation_payment_ref ON crm_reservation (payment_ref) WHERE payment_ref IS NOT NULL;
