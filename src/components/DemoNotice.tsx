import Link from "next/link";

export function DemoNotice() {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule bg-water/10 px-4 py-2 text-xs text-ink-soft">
      <p><strong className="mr-2 text-ink">Demo para explorar y aprender</strong> Fuentes y modelos de distinta calidad; cobertura y precisión sin garantía operativa.</p>
      <Link href="/como-funciona#alcance" className="shrink-0 text-water underline underline-offset-4">Alcance y método</Link>
    </div>
  );
}
