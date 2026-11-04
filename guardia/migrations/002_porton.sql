-- 002 · O4: inventario de móviles y portones, movimientos de entrada/salida.
-- Las detecciones de cámara (futuro) entran como 'pendiente_revision' en la misma tabla.

CREATE TABLE vehicle (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  text NOT NULL REFERENCES organization(id),
  code             text NOT NULL,
  label            text NOT NULL,
  active           boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, code)
);

CREATE TABLE gate (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  text NOT NULL REFERENCES organization(id),
  code             text NOT NULL,
  name             text NOT NULL,
  UNIQUE (organization_id, code)
);

CREATE TABLE vehicle_movement (
  id               bigserial PRIMARY KEY,
  organization_id  text NOT NULL REFERENCES organization(id),
  vehicle_id       uuid NOT NULL REFERENCES vehicle(id),
  gate_id          uuid NOT NULL REFERENCES gate(id),
  direction        text NOT NULL CHECK (direction IN ('salida','entrada')),
  occurred_at      timestamptz NOT NULL,
  received_at      timestamptz NOT NULL,
  source           text NOT NULL CHECK (source IN ('qr','manual','camara')),
  operator         text NOT NULL,
  status           text NOT NULL CHECK (status IN ('confirmado','duplicado','corregido','pendiente_revision','descartado')),
  duplicate_of     bigint REFERENCES vehicle_movement(id),
  corrected_from   bigint REFERENCES vehicle_movement(id),
  dispatch_id      uuid REFERENCES dispatch(id),
  reason           text,
  source_key       text NOT NULL UNIQUE
);
CREATE INDEX vehicle_movement_vehicle ON vehicle_movement (vehicle_id, occurred_at);
CREATE INDEX vehicle_movement_org ON vehicle_movement (organization_id, occurred_at);
