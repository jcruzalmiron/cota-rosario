import { GradeTimeline, timelineSentence } from "@/components/GradeTimeline";
import { GRADE_FILL } from "@/components/status";
import type { ZoneAssessment } from "@/lib/risk";
import { GRADE_LABEL, type ContributionSource } from "@/lib/zoneAlert";

const CHIP: Record<Exclude<ContributionSource, "lluvia">, string> = {
  sensibilidad: "zona sensible",
  rio: "Paraná alto",
  reportes: "reportes",
};

/** Las zonas oficiales ordenadas por grado, con qué las sube y cómo siguen en 48 h. */
export function ZoneOutlook({ zones }: { zones: ZoneAssessment[] }) {
  const graded = zones.filter((zone) => zone.grade !== null);
  if (!graded.length) {
    return <p className="text-sm leading-relaxed text-ink-soft">No tenemos un pronóstico de lluvia vigente ni reportes de vecinos, así que no podemos decir cómo va a estar cada zona. Siguen siendo áreas donde se puede juntar agua.</p>;
  }
  // Las zonas con el mismo grado, los mismos motivos y la misma evolución se muestran juntas.
  const groups = new Map<string, ZoneAssessment[]>();
  for (const zone of graded) {
    const key = [zone.grade, zone.contributions.filter((item) => item.points > 0).map((item) => `${item.source}${item.points}`).join(","), zone.timeline.map((step) => step.grade).join("")].join("|");
    groups.set(key, [...(groups.get(key) ?? []), zone]);
  }
  const ordered = [...groups.values()].sort((a, b) => b[0].grade! - a[0].grade! || a[0].zone.localeCompare(b[0].zone));
  return (
    <ul className="flex flex-col divide-y divide-rule-soft">
      {ordered.map((group) => {
        const zone = group[0];
        const extras = zone.contributions.filter((item) => item.source !== "lluvia" && item.points > 0);
        const sentence = timelineSentence(zone.timeline);
        return (
          <li key={zone.zone} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="size-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: GRADE_FILL[zone.grade!] }} aria-hidden="true" />
              <span className="readout text-sm text-ink">
                {group.length === 1 ? "Zona" : "Zonas"} {group.map((entry) => entry.zone).join(" · ")}
              </span>
              <span className="text-sm text-ink-soft">{zone.grade === 0 ? "Tranquila" : GRADE_LABEL[zone.grade!]}</span>
              <span className="ml-auto flex flex-wrap justify-end gap-1">
                {extras.map((item) => (
                  <span key={item.source} className="rounded-full border border-rule px-1.5 py-px text-[0.625rem] leading-tight text-ink-soft" title={item.text}>
                    +{item.points} {CHIP[item.source as keyof typeof CHIP]}
                  </span>
                ))}
              </span>
            </div>
            <GradeTimeline steps={zone.timeline} compact />
            {sentence ? <p className="text-[0.6875rem] leading-snug text-ink-faint">{sentence}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
