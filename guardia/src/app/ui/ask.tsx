"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Diálogo propio para pedir un dato o una confirmación sin frenar la pantalla:
 * a diferencia de prompt()/confirm(), el tablero sigue actualizándose detrás,
 * el texto se valida antes de cerrar y funciona igual en tablet y escritorio.
 */
export interface AskField {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "select";
  options?: { value: string; label: string }[];
  initial?: string;
  required?: boolean;
  hint?: string;
  min?: number;
  max?: number;
}

export interface AskRequest {
  title: string;
  detail?: string;
  fields?: AskField[];
  confirmLabel?: string;
  /** Acción que conviene mirar dos veces (cierre, descarte, retorno). */
  danger?: boolean;
}

type Answer = Record<string, string> | null;
type Pending = { request: AskRequest; resolve: (answer: Answer) => void; id: number };

let open: ((pending: Pending) => void) | null = null;
let sequence = 0;

/** Devuelve los valores por nombre de campo, o null si se canceló. Sin campos, {} confirma. */
export function ask(request: AskRequest): Promise<Answer> {
  return new Promise((resolve) => {
    if (!open) return resolve(null);
    open({ request, resolve, id: ++sequence });
  });
}

/** Se monta una sola vez en el layout. */
export function AskHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    open = (next) =>
      setPending((current) => {
        current?.resolve(null);
        return next;
      });
    return () => {
      open = null;
    };
  }, []);

  if (!pending) return null;
  const finish = (answer: Answer) => {
    pending.resolve(answer);
    setPending(null);
  };
  return <AskDialog key={pending.id} request={pending.request} onFinish={finish} />;
}

function AskDialog({ request, onFinish }: { request: AskRequest; onFinish: (answer: Answer) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const fields = request.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.name, field.initial ?? ""])));

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const missing = fields.some((field) => field.required && !values[field.name]?.trim());

  return (
    <dialog
      ref={ref}
      className="ask"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onFinish(null);
      }}
      onClick={(event) => {
        if (event.target === ref.current) onFinish(null);
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (!missing) onFinish(Object.fromEntries(Object.entries(values).map(([name, value]) => [name, value.trim()])));
        }}
      >
        <h2 id={titleId}>{request.title}</h2>
        {request.detail ? <p className="hint">{request.detail}</p> : null}
        {fields.map((field, index) => {
          const id = `${titleId}-${field.name}`;
          const common = {
            id,
            value: values[field.name],
            autoFocus: index === 0,
            required: field.required,
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues({ ...values, [field.name]: event.target.value }),
          };
          return (
            <div className="field" key={field.name}>
              <label htmlFor={id}>
                {field.label}
                {field.required ? null : <span className="optional"> · opcional</span>}
              </label>
              {field.type === "textarea" ? (
                <textarea rows={3} {...common} />
              ) : field.type === "select" ? (
                <select {...common}>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input type={field.type === "number" ? "number" : "text"} inputMode={field.type === "number" ? "numeric" : undefined} min={field.min} max={field.max} {...common} />
              )}
              {field.hint ? <p className="hint">{field.hint}</p> : null}
            </div>
          );
        })}
        <div className="actions end">
          <button type="button" className="ghost" onClick={() => onFinish(null)} autoFocus={fields.length === 0}>
            Cancelar
          </button>
          <button type="submit" className={request.danger ? "primary" : "primary neutral"} disabled={missing}>
            {request.confirmLabel ?? "Guardar"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
