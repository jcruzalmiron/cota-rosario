"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface DeckSlide {
  id: string;
  titulo: string;
  contenido: ReactNode;
  resplandor?: boolean;
}

interface DeckProps {
  slides: DeckSlide[];
}

const ACTIVE_THRESHOLD = 0.55;
const NEXT_KEYS = ["ArrowDown", "ArrowRight", "PageDown", " "];
const PREV_KEYS = ["ArrowUp", "ArrowLeft", "PageUp"];

function pad(index: number): string {
  return String(index).padStart(2, "0");
}

export function Deck({ slides }: DeckProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(0);

  const irA = useCallback(
    (index: number) => {
      const destino = Math.max(0, Math.min(slides.length - 1, index));
      const nodo = scroller.current?.children[destino] as HTMLElement | undefined;
      nodo?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    },
    [slides.length],
  );

  useEffect(() => {
    const root = scroller.current;
    if (!root) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          setActivo(Number((visible.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: ACTIVE_THRESHOLD },
    );
    for (const child of Array.from(root.children)) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  }, [slides.length]);

  useEffect(() => {
    const fromHash = () => {
      const index = slides.findIndex((slide) => `#${slide.id}` === window.location.hash);
      if (index >= 0) irA(index);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [slides, irA]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (NEXT_KEYS.includes(event.key)) {
        event.preventDefault();
        irA(activo + 1);
      } else if (PREV_KEYS.includes(event.key)) {
        event.preventDefault();
        irA(activo - 1);
      } else if (event.key === "Home") {
        irA(0);
      } else if (event.key === "End") {
        irA(slides.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activo, irA, slides.length]);

  return (
    <div className="deck relative h-full">
      <div className="absolute inset-x-0 top-0 z-20 h-px bg-rule" aria-hidden="true">
        <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${((activo + 1) / slides.length) * 100}%` }} />
      </div>

      <div ref={scroller} className="deck-scroller h-full snap-y snap-mandatory overflow-y-auto">
        {slides.map((slide, index) => (
          <section
            key={slide.id}
            id={slide.id}
            data-index={index}
            data-active={activo === index}
            aria-label={slide.titulo}
            className="deck-slide relative flex snap-start flex-col justify-center px-5 pb-24 pt-14 sm:px-10 lg:px-16"
            style={{ minHeight: "100%" }}
          >
            {slide.resplandor ? <div className="deck-glow pointer-events-none absolute inset-0" aria-hidden="true" /> : null}
            <div className="deck-grid pointer-events-none absolute inset-0" aria-hidden="true" />
            <div className="relative mx-auto w-full max-w-5xl">{slide.contenido}</div>
          </section>
        ))}
      </div>

      <nav aria-label="Diapositivas" className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-2 md:flex">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => irA(index)}
            aria-label={`${pad(index + 1)} · ${slide.titulo}`}
            aria-current={activo === index ? "step" : undefined}
            title={slide.titulo}
            className={`h-1.5 rounded-full transition-all ${activo === index ? "w-6 bg-ink" : "w-1.5 bg-rule hover:bg-ink-faint"}`}
          />
        ))}
      </nav>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-5 py-4 sm:px-10">
        <span className="readout text-xs text-ink-faint">
          {pad(activo + 1)} <span className="text-rule">/</span> {pad(slides.length)}
        </span>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => irA(activo - 1)}
            disabled={activo === 0}
            aria-label="Anterior"
            className="size-9 rounded-full border border-rule text-ink-soft transition-colors hover:border-ink-soft hover:text-ink disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => irA(activo + 1)}
            disabled={activo === slides.length - 1}
            aria-label="Siguiente"
            className="size-9 rounded-full border border-rule text-ink-soft transition-colors hover:border-ink-soft hover:text-ink disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      </div>
    </div>
  );
}
