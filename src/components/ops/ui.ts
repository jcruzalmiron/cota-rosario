const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-water focus-visible:ring-offset-2 focus-visible:ring-offset-ground";

export const BUTTON_PRIMARY = `inline-flex min-h-11 items-center justify-center rounded-md bg-ink px-3.5 text-[0.8125rem] font-medium text-ground transition-colors hover:bg-white active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-9 ${FOCUS}`;

export const BUTTON_PLAIN = `inline-flex min-h-11 items-center justify-center rounded-md border border-rule px-3.5 text-[0.8125rem] text-ink-soft transition-colors hover:border-ink-faint hover:text-ink active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-9 ${FOCUS}`;

export const FIELD = `w-full rounded-md border border-rule bg-panel px-3 py-2.5 text-base text-ink placeholder:text-ink-faint transition-colors hover:border-ink-faint focus:border-water lg:py-2 lg:text-sm ${FOCUS}`;

export function chipClass(active: boolean): string {
  return `inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[0.8125rem] transition-colors active:translate-y-px lg:min-h-8 ${FOCUS} ${
    active ? "border-ink bg-ink text-ground" : "border-rule text-ink-soft hover:border-ink-faint hover:text-ink"
  }`;
}
