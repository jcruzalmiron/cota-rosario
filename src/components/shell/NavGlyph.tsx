import type { NavIcon } from "@/lib/navigation";

const PATHS: Record<NavIcon, string> = {
  map: "M4 6.5 9 4l6 2.5L20 4v13.5L15 20l-6-2.5L4 20Z M9 4v13.5 M15 6.5V20",
  zone: "M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  report: "M12 3.5 21 19.5H3Z M12 9.5v4.5 M12 17h.01",
  more: "M5 7h14 M5 12h14 M5 17h14",
  summary: "M4.5 4.5h6v6h-6Z M13.5 4.5h6v6h-6Z M4.5 13.5h6v6h-6Z M13.5 13.5h6v6h-6Z",
  river: "M3 9c3 0 3-2 6-2s3 2 6 2 3-2 6-2 M3 15c3 0 3-2 6-2s3 2 6 2 3-2 6-2",
  rain: "M7 15a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.5 1.5A3.5 3.5 0 0 1 17.5 15 M9 18l-1 2 M13 18l-1 2 M17 18l-1 2",
  forecast: "M4 19.5h16 M6 15.5l3.5-4 3 2.5 5.5-7 M15 7h3v3",
  reports: "M5 4.5h14v11H9l-4 4Z M9 9h6 M9 12h4",
  claims: "M5.5 4.5h13v15h-13Z M8.5 9.5l1.4 1.4 2.6-2.8 M14.5 9.5h1 M8.5 15h7",
  demand: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M3.5 19.5c0-3 2.4-5 5.5-5s5.5 2 5.5 5 M15.5 5.3a3 3 0 0 1 0 5.4 M17.5 14.9c1.9.7 3 2.4 3 4.6",
  simulator: "M4 7h10 M18 7h2 M4 17h4 M12 17h8 M16 5v4 M10 15v4",
};

interface NavGlyphProps {
  icon: NavIcon;
  className?: string;
}

export function NavGlyph({ icon, className = "size-5" }: NavGlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[icon]} />
    </svg>
  );
}
