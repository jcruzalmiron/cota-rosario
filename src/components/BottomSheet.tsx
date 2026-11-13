"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

const SNAP_RATIO = 0.35;
const FLICK_PX = 18;
const FLICK_MS = 250;
const DRAG_START_PX = 8;
const SNAP_TRANSITION = "translate 320ms cubic-bezier(0.32, 0.72, 0, 1)";
const DESKTOP_QUERY = "(min-width: 1024px)";
const INTERACTIVE = "a, button, input, textarea, select, summary, label, [role='button']";
const SHEET_EVENT = "cota:sheet";

/** Abre o contrae el panel inferior del celular desde cualquier componente. En escritorio no hace nada visible. */
export function requestSheet(open: boolean): void {
  window.dispatchEvent(new CustomEvent<boolean>(SHEET_EVENT, { detail: open }));
}

interface BottomSheetProps {
  children: ReactNode;
  requestedOpen?: boolean;
}

interface Gesture {
  y: number;
  at: number;
  open: boolean;
  travel: number;
  dragging: boolean;
  fromHandle: boolean;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function peekPx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sheet-peek")) || 0;
}

function settles(start: Gesture, delta: number): boolean {
  const quick = performance.now() - start.at < FLICK_MS && Math.abs(delta) >= FLICK_PX;
  if (start.open) {
    return !(quick ? delta > 0 : delta > start.travel * SNAP_RATIO);
  }
  return quick ? delta < 0 : -delta > start.travel * SNAP_RATIO;
}

function startGesture(y: number, fromHandle: boolean, isOpen: boolean, sheetHeight: number): Gesture {
  return { y, at: performance.now(), open: isOpen, travel: Math.max(0, sheetHeight - peekPx()), dragging: false, fromHandle };
}

function dragOffset(start: Gesture, y: number): number {
  const base = start.open ? 0 : start.travel;
  return Math.min(start.travel, Math.max(0, base + y - start.y));
}

export function BottomSheet({ children, requestedOpen }: BottomSheetProps) {
  const [open, setOpen] = useState(requestedOpen ?? false);
  const [appliedRequest, setAppliedRequest] = useState(requestedOpen);
  if (requestedOpen !== appliedRequest) {
    setAppliedRequest(requestedOpen);
    if (requestedOpen !== undefined) {
      setOpen(requestedOpen);
    }
  }
  const [dragPx, setDragPx] = useState<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!open && scrollerRef.current) {
      scrollerRef.current.scrollTop = 0;
    }
  }, [open]);

  useEffect(() => {
    document.documentElement.dataset.sheetOpen = String(open);
    return () => {
      delete document.documentElement.dataset.sheetOpen;
    };
  }, [open]);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const requested = (event as CustomEvent<unknown>).detail;
      if (typeof requested === "boolean") {
        setOpen(requested);
      }
    };
    window.addEventListener(SHEET_EVENT, onRequest);
    return () => window.removeEventListener(SHEET_EVENT, onRequest);
  }, []);

  const sheetHeight = () => sheetRef.current?.offsetHeight ?? 0;

  const finish = (start: Gesture, y: number) => {
    setDragPx(null);
    setOpen(settles(start, y - start.y));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (window.matchMedia(DESKTOP_QUERY).matches) {
      return;
    }
    const fromHandle = Boolean((event.target as HTMLElement).closest("[data-sheet-handle]"));
    if (open && !fromHandle) {
      return;
    }
    gesture.current = startGesture(event.clientY, fromHandle, open, sheetHeight());
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const start = gesture.current;
    if (!start) {
      return;
    }
    if (!start.dragging) {
      if (Math.abs(event.clientY - start.y) < DRAG_START_PX) {
        return;
      }
      gesture.current = { ...start, dragging: true };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDragPx(dragOffset(start, event.clientY));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const start = gesture.current;
    gesture.current = null;
    if (!start) {
      return;
    }
    if (start.dragging) {
      suppressClick.current = true;
      finish(start, event.clientY);
      return;
    }
    const onControl = Boolean((event.target as HTMLElement).closest(INTERACTIVE));
    if (start.fromHandle) {
      setOpen(!start.open);
    } else if (!start.open && !onControl) {
      setOpen(true);
    }
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  };

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !open) {
      return;
    }
    let pull: Gesture | null = null;
    const onTouchStart = (event: TouchEvent) => {
      pull = scroller.scrollTop <= 0 ? startGesture(event.touches[0].clientY, false, true, sheetRef.current?.offsetHeight ?? 0) : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!pull) {
        return;
      }
      const y = event.touches[0].clientY;
      if (!pull.dragging) {
        if (y - pull.y < DRAG_START_PX) {
          if (pull.y - y >= DRAG_START_PX) pull = null;
          return;
        }
        pull = { ...pull, dragging: true };
      }
      event.preventDefault();
      setDragPx(dragOffset(pull, y));
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (pull?.dragging) {
        suppressClick.current = true;
        setDragPx(null);
        setOpen(settles(pull, event.changedTouches[0].clientY - pull.y));
      }
      pull = null;
    };
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd);
    scroller.addEventListener("touchcancel", onTouchEnd);
    return () => {
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [open]);

  const restingClass = open ? "translate-y-0" : "translate-y-[calc(100%-var(--sheet-peek))]";
  const style: CSSProperties = dragPx !== null ? { translate: `0 ${dragPx}px`, transition: "none" } : { transition: reduced ? "none" : SNAP_TRANSITION };

  return (
    <aside
      ref={sheetRef}
      data-sheet-open={open}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
      onFocusCapture={(event) => {
        if (!open && !window.matchMedia(DESKTOP_QUERY).matches && (event.target as HTMLElement).matches("input, textarea, select")) {
          setOpen(true);
        }
      }}
      className={`glass-sheet lg:glass-rail fixed inset-x-0 bottom-[var(--tabbar-h)] z-30 flex h-[calc(86dvh-var(--tabbar-h))] flex-col rounded-t-2xl border-t border-rule shadow-[0_-18px_48px_-24px_rgb(0_0_0/0.9)] ${restingClass} ${open ? "" : "max-lg:touch-none max-lg:select-none"} lg:static lg:z-20 lg:h-auto lg:w-[27rem] lg:shrink-0 lg:translate-y-0 lg:rounded-none lg:border-t-0 lg:border-r lg:shadow-none xl:w-[30rem]`}
      style={style}
    >
      <div
        data-sheet-handle
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? "Contraer el panel" : "Expandir el panel"}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
        className="flex shrink-0 cursor-grab touch-none select-none items-center justify-center py-4 active:cursor-grabbing lg:hidden"
      >
        <span className="h-1 w-10 rounded-full bg-rule" aria-hidden="true" />
      </div>
      <div ref={scrollerRef} className={`min-h-0 flex-1 overscroll-contain lg:overflow-y-auto ${open ? "overflow-y-auto" : "overflow-hidden"}`}>
        {children}
      </div>
    </aside>
  );
}
