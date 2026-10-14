import Link from "next/link";

export function DemoNotice() {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule bg-water/10 px-4 py-2 text-xs text-ink-soft">
      <p><strong className="mr-2 text-ink">Río, lluvia y territorio</strong> Información hídrica de Rosario en un mismo lugar.</p>
      <Link href="/como-funciona#fuentes" className="shrink-0 text-water underline underline-offset-4">Fuentes y metodología</Link>
    </div>
  );
}
