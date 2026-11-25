"use client";

import { Fragment, useEffect, useMemo, useRef } from "react";
import { layoutSlots, minutesLabel, parseDateKey } from "@/lib/time";

type Props = {
  slots: string[];
  slotMin: number;
  cellClass?: (iso: string) => string;
  cellStyle?: (iso: string) => React.CSSProperties | undefined;
  cellTitle?: (iso: string) => string;
  // Painting: called on press with the first cell, then for every cell dragged over.
  onPaintStart?: (iso: string) => void;
  onPaintMove?: (iso: string) => void;
  onHover?: (iso: string | null) => void;
  onSelect?: (iso: string) => void;
  selected?: string | null;
  label: string;
};

export default function SlotGrid(p: Props) {
  const { days, rows, cell } = useMemo(() => layoutSlots(p.slots), [p.slots]);
  const painting = useRef(false);
  const last = useRef<string | null>(null);
  const paintable = Boolean(p.onPaintStart);
  const cbs = useRef(p);
  cbs.current = p;

  useEffect(() => {
    if (!paintable) return;
    const move = (e: PointerEvent) => {
      if (!painting.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const iso = el?.closest<HTMLElement>("[data-slot]")?.dataset.slot;
      if (iso && iso !== last.current) {
        last.current = iso;
        cbs.current.onPaintMove?.(iso);
      }
    };
    const up = () => {
      painting.current = false;
      last.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [paintable]);

  // Rows on the hour get a label; half/quarter hours only get a tick.
  const showLabel = (m: number) => p.slotMin >= 60 || m % 60 === 0 || rows.indexOf(m) === 0;
  const hourGap = (i: number) => i > 0 && rows[i] - rows[i - 1] > p.slotMin;

  return (
    <div className="grid-scroll" role="group" aria-label={p.label}>
      <div
        className={`slot-grid ${paintable ? "paintable" : ""} ${p.slotMin >= 60 ? "tall" : ""}`}
        style={{ gridTemplateColumns: `auto repeat(${days.length}, minmax(44px, 1fr))` }}
        onPointerLeave={() => p.onHover?.(null)}
      >
        <div className="corner" />
        {days.map((k) => {
          const d = parseDateKey(k);
          return (
            <div key={k} className="day-head">
              <span className="dow">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className="dnum">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </div>
          );
        })}
        {rows.map((m, i) => renderRow(m, i))}
      </div>
    </div>
  );

  function renderRow(m: number, i: number) {
    return (
      <Fragment key={m}>
        <div className={`time-label ${m % 60 === 0 ? "hour" : ""} ${hourGap(i) ? "gap" : ""}`}>
          {showLabel(m) ? minutesLabel(m, true) : ""}
        </div>
        {days.map((k) => {
          const iso = cell.get(`${k}|${m}`);
          if (!iso) return <div key={k} className={`cell empty ${hourGap(i) ? "gap" : ""}`} />;
          return (
            <button
              type="button"
              key={k}
              data-slot={iso}
              className={`cell ${m % 60 === 0 ? "hour" : ""} ${hourGap(i) ? "gap" : ""} ${p.cellClass?.(iso) ?? ""} ${
                p.selected === iso ? "selected" : ""
              }`}
              style={p.cellStyle?.(iso)}
              title={p.cellTitle?.(iso)}
              aria-label={`${parseDateKey(k).toDateString()} ${minutesLabel(m)}${p.cellTitle ? ": " + p.cellTitle(iso) : ""}`}
              onPointerDown={(e) => {
                if (!paintable) return;
                e.preventDefault();
                painting.current = true;
                last.current = iso;
                p.onPaintStart?.(iso);
              }}
              onKeyDown={(e) => {
                if (paintable && (e.key === " " || e.key === "Enter")) {
                  e.preventDefault();
                  p.onPaintStart?.(iso);
                }
              }}
              onPointerEnter={() => p.onHover?.(iso)}
              onFocus={() => p.onHover?.(iso)}
              onClick={() => p.onSelect?.(iso)}
            />
          );
        })}
      </Fragment>
    );
  }
}
