import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { CalendarMark } from "../model";
import type { DateRange } from "./dates";
import { addDays } from "../model";
import {
  dayAccessibleName,
  dayInfo,
  monthDays,
  orderedRange,
  supportedDay,
  WEEKDAYS,
  weekSpans,
} from "./dates";

export interface Selection {
  anchor: string;
  focus: string;
}
interface Props {
  month: string;
  today: string;
  marks: CalendarMark[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMonth: (month: string) => void;
  onCreate: (date: string, range?: DateRange) => void;
  onEdit: (mark: CalendarMark) => void;
  compact?: boolean;
}
export function CalendarGrid(props: Props) {
  const {
    month,
    today,
    marks,
    selection,
    onSelect,
    onMonth,
    onCreate,
    onEdit,
    compact = false,
  } = props;
  const grid = useRef<HTMLDivElement>(null);
  const [lanes, setLanes] = useState(2);
  useEffect(() => {
    if (!grid.current || compact) return;
    const observer = new ResizeObserver(([entry]) =>
      setLanes((entry.contentRect.height - 28) / 6 >= 88 ? 2 : 1),
    );
    observer.observe(grid.current);
    return () => observer.disconnect();
  }, [compact]);
  const latest = useRef(props);
  latest.current = props;
  const drag = useRef<{ anchor: string; last: string; pointer: number } | null>(
    null,
  );
  const keyboardFocus = useRef(false);
  const days = useMemo(() => monthDays(month), [month]);
  const range = orderedRange(selection.anchor, selection.focus);
  useEffect(() => {
    const move = (e: globalThis.PointerEvent) => {
      if (!drag.current || e.pointerId !== drag.current.pointer) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const cell = target?.closest<HTMLElement>("[data-calendar-date]");
      const week = target?.closest<HTMLElement>("[data-calendar-week]");
      let date = cell?.dataset.calendarDate;
      if (!date && week?.dataset.calendarWeek) {
        const rect = week.getBoundingClientRect();
        const column = Math.min(
          6,
          Math.max(0, Math.floor((e.clientX - rect.left) / (rect.width / 7))),
        );
        date = addDays(week.dataset.calendarWeek, column);
      }
      if (
        (cell || week) &&
        grid.current?.contains((cell || week)!) &&
        date &&
        supportedDay(date) &&
        drag.current.last !== date
      ) {
        drag.current.last = date;
        latest.current.onSelect({ anchor: drag.current.anchor, focus: date });
      }
    };
    const finish = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
    };
  }, []);
  useEffect(() => {
    if (keyboardFocus.current) {
      keyboardFocus.current = false;
      grid.current
        ?.querySelector<HTMLButtonElement>(
          `[data-calendar-date="${selection.focus}"] .cal-day-button`,
        )
        ?.focus({ preventScroll: true });
    }
  }, [selection.focus, month]);
  const start = (e: PointerEvent<HTMLElement>, date: string) => {
    if (e.button !== 0 || !supportedDay(date)) return;
    (e.currentTarget instanceof HTMLButtonElement
      ? e.currentTarget
      : e.currentTarget.querySelector<HTMLButtonElement>(".cal-day-button")
    )?.focus({ preventScroll: true });
    const anchor = e.shiftKey ? latest.current.selection.anchor : date;
    onSelect({ anchor, focus: date });
    if (e.pointerType !== "touch") {
      drag.current = { anchor, last: date, pointer: e.pointerId };
    }
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const offset = (
      { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<
        string,
        number
      >
    )[e.key];
    if (offset !== undefined) {
      e.preventDefault();
      const next = addDays(date, offset);
      if (!supportedDay(next)) return;
      keyboardFocus.current = true;
      onSelect({
        anchor: e.shiftKey ? latest.current.selection.anchor : next,
        focus: next,
      });
      if (next.slice(0, 7) !== month) onMonth(next.slice(0, 7));
    } else if (e.key === "Enter") {
      e.preventDefault();
      onCreate(
        date,
        orderedRange(
          latest.current.selection.anchor,
          latest.current.selection.focus,
        ),
      );
    }
  };
  return (
    <div
      className={`cal-grid ${compact ? "compact-calendar" : ""}`}
      ref={grid}
      role="grid"
      aria-label={`${month} 月历`}
      aria-multiselectable="true"
    >
      <div className="cal-weekdays" role="row">
        {WEEKDAYS.map((w, i) => (
          <span role="columnheader" className={i >= 5 ? "weekend" : ""} key={w}>
            周{w}
          </span>
        ))}
      </div>
      {Array.from({ length: 6 }, (_, week) => {
        const weekDays = days.slice(week * 7, week * 7 + 7);
        const spans = weekSpans(marks, weekDays[0]);
        return (
          <div
            className="cal-week"
            role="row"
            key={weekDays[0]}
            data-calendar-week={weekDays[0]}
          >
            {weekDays.map((date) => {
              const info = dayInfo(date);
              const selected = date >= range.start && date <= range.end;
              const dayMarks = marks.filter(
                (m) => m.startDate <= date && m.endDate >= date,
              );
              const overflow = spans.filter(
                (s) =>
                  s.lane >= lanes &&
                  date >= s.mark.startDate &&
                  date <= s.mark.endDate,
              ).length;
              return (
                <div
                  role="gridcell"
                  aria-selected={selected}
                  data-calendar-date={date}
                  key={date}
                  onPointerDown={(e) => {
                    if (!(e.target as HTMLElement).closest("button"))
                      start(e, date);
                  }}
                  className={`cal-day ${date.slice(0, 7) !== month ? "outside" : ""} ${info.weekday === 0 || info.weekday === 6 ? "weekend" : ""} ${selected ? "selected" : ""} ${date === range.start ? "range-start" : ""} ${date === range.end ? "range-end" : ""} ${date === today ? "is-today" : ""} ${info.official?.kind || ""}`}
                >
                  <button
                    type="button"
                    className="cal-day-button"
                    aria-label={dayAccessibleName(date)}
                    title={dayAccessibleName(date)}
                    disabled={!supportedDay(date)}
                    tabIndex={
                      date ===
                      (days.includes(selection.focus)
                        ? selection.focus
                        : `${month}-01`)
                        ? 0
                        : -1
                    }
                    onPointerDown={(e) => start(e, date)}
                    onClick={(e) => {
                      if (e.detail === 0)
                        onSelect({
                          anchor: e.shiftKey ? selection.anchor : date,
                          focus: date,
                        });
                    }}
                    onDoubleClick={() => onCreate(date)}
                    onKeyDown={(e) => key(e, date)}
                  >
                    <span className="cal-day-top">
                      <span className="cal-day-number">{info.day}</span>
                      {info.official && (
                        <span
                          className={`holiday-badge ${info.official.kind}`}
                          aria-hidden="true"
                        >
                          {info.official.kind === "rest" ? "休" : "班"}
                        </span>
                      )}
                    </span>
                    <span
                      className={`cal-lunar ${info.festival || info.term ? "special" : ""}`}
                    >
                      {info.short}
                    </span>
                  </button>
                  {compact && dayMarks.length > 0 && (
                    <div
                      className="cal-mark-dots"
                      aria-label={`${dayMarks.length} 条标记`}
                    >
                      {dayMarks.slice(0, 3).map((m) => (
                        <i key={m.id} data-color={m.color} />
                      ))}
                    </div>
                  )}
                  {!compact && overflow > 0 && (
                    <button
                      className="cal-overflow"
                      onClick={() => onSelect({ anchor: date, focus: date })}
                    >
                      +{overflow} 更多
                    </button>
                  )}
                </div>
              );
            })}
            {!compact && (
              <div className="cal-ribbons">
                {spans
                  .filter((s) => s.lane < lanes)
                  .map((s) => (
                    <button
                      type="button"
                      className={`cal-ribbon ${s.continuesBefore ? "from-before" : ""} ${s.continuesAfter ? "to-after" : ""}`}
                      data-color={s.mark.color}
                      key={s.mark.id}
                      style={{
                        gridColumn: `${s.start + 1} / span ${s.end - s.start + 1}`,
                        gridRow: s.lane + 1,
                      }}
                      aria-label={`编辑标记：${s.mark.title}`}
                      title={`${s.mark.title} · ${s.mark.startDate} 至 ${s.mark.endDate}`}
                      onClick={() => onEdit(s.mark)}
                    >
                      <span>
                        {s.continuesBefore ? "‹ " : ""}
                        {s.mark.title}
                        {s.continuesAfter ? " ›" : ""}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
