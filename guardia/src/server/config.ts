import { DEFAULT_ALERT_RULE, type AlertRule } from "../domain/guard";

/**
 * Configuración por entorno. Los adaptadores externos arrancan deshabilitados;
 * un flag habilitado con configuración incompleta es un error visible.
 */
export interface Config {
  alertRule: AlertRule;
  adapters: Record<string, { enabled: boolean; missing: string[] }>;
}

const ADAPTERS: Record<string, string[]> = {
  // flag → variables requeridas
  TRANSCRIPCION: ["TRANSCRIPCION_URL"],
  IA_EXTRACCION: ["IA_EXTRACCION_PROVEEDOR", "IA_EXTRACCION_API_KEY"],
  BRAVO_EXPORT: ["BRAVO_CONTRATO_VERSION"],
  WHATSAPP: ["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"],
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const followUp = env.ALERTA_SEGUIMIENTO_MIN;
  const alertRule: AlertRule = {
    ...DEFAULT_ALERT_RULE,
    firstAlertMin: Number(env.ALERTA_PRIMER_AVISO_MIN ?? DEFAULT_ALERT_RULE.firstAlertMin),
    followUpMin: followUp ? Number(followUp) : DEFAULT_ALERT_RULE.followUpMin,
  };
  if (!(alertRule.firstAlertMin > 0)) throw new Error("ALERTA_PRIMER_AVISO_MIN inválido.");
  const adapters: Config["adapters"] = {};
  for (const [name, vars] of Object.entries(ADAPTERS)) {
    const enabled = env[`ADAPTER_${name}`] === "on";
    const missing = vars.filter((v) => !env[v]);
    if (enabled && missing.length) {
      throw new Error(`ADAPTER_${name}=on pero faltan: ${missing.join(", ")}`);
    }
    adapters[name] = { enabled, missing };
  }
  return { alertRule, adapters };
}
