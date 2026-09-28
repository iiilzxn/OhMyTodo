import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Expand, Plus, X } from "lucide-react";
import type { CalendarMark } from "../model";
import { useApp, desktop } from "../state";
import {
  CALENDAR_REQUEST,
  CalendarSources,
  HolidayLegend,
  MarkList,
  storedMonth,
} from "./Calendar";
import { CalendarGrid } from "./CalendarGrid";
import type { Selection } from "./CalendarGrid";
import { CalendarEditor } from "./CalendarEditor";
import { dayInfo, orderedRange, overlaps, rangeLabel } from "./dates";
import type { DateRange } from "./dates";
import { MonthControls } from "./MonthControls";
import { IconButton, ToastView } from "../ui";

export function WidgetCalendar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, day, notify } = useApp();
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropDown = useRef(false);
  useEffect(() => {
    const element = dialog.current!;
    if (open) element.showModal();
    else element.close();
    return () => element.close();
  }, [open]);
  const [month, setMonth] = useState(() =>
    storedMonth("ohmytodo-widget-calendar-month", day),
  );
  const [selection, setSelection] = useState<Selection>(() => {
    const initial = month === day.slice(0, 7) ? day : `${month}-01`;
    return { anchor: initial, focus: initial };
  });
  const [editor, setEditor] = useState<{
    mark?: CalendarMark;
    range: DateRange;
  } | null>(null);
  const [sources, setSources] = useState(false);
  const range = orderedRange(selection.anchor, selection.focus);
  const info = dayInfo(selection.focus);
  const marks = data!.calendarMarks;
  const selected = useMemo(
    () =>
      marks
        .filter((m) => overlaps(m, range))
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [marks, range.start, range.end],
  );
  useEffect(() => {
    localStorage.setItem("ohmytodo-widget-calendar-month", month);
  }, [month]);
  const edit = (mark: CalendarMark) =>
    setEditor({ mark, range: { start: mark.startDate, end: mark.endDate } });
  const openFull = async () => {
    localStorage.setItem(CALENDAR_REQUEST, JSON.stringify(selection));
    await desktop("main", "calendar").catch((e) =>
      notify(String(e), undefined, true),
    );
    onClose();
  };
  return (
    <dialog
      ref={dialog}
      className="widget-calendar-popup"
      aria-label="悬浮日历"
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      onPointerDown={(e) => {
        backdropDown.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (!backdropDown.current || e.target !== e.currentTarget) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < bounds.left ||
          e.clientX > bounds.right ||
          e.clientY < bounds.top ||
          e.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <header className="widget-calendar-heading">
        <div>
          <CalendarRange size={16} />
          <h2>日历</h2>
        </div>
        <IconButton label="收起日历" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>
      <div className="widget-calendar-body">
        <div className="cal-widget">
          <MonthControls
            compact
            month={month}
            onMonth={setMonth}
            onToday={() => {
              setMonth(day.slice(0, 7));
              setSelection({ anchor: day, focus: day });
            }}
          />
          <CalendarGrid
            compact
            month={month}
            today={day}
            marks={marks}
            selection={selection}
            onSelect={setSelection}
            onMonth={setMonth}
            onCreate={(date, selected) =>
              setEditor({ range: selected || { start: date, end: date } })
            }
            onEdit={edit}
          />
          <HolidayLegend
            year={Number(month.slice(0, 4))}
            onSources={() => setSources(true)}
          />
          <div className="cal-widget-selection">
            <strong>{rangeLabel(range)}</strong>
            <small>
              {range.start === range.end
                ? `农历${info.lunarText}${info.official ? ` · ${info.official.name}${info.official.kind === "rest" ? "放假" : "补班"}` : ""}`
                : "拖动或 Shift + 点击，选择一段时间"}
            </small>
          </div>
          <div className="cal-widget-marks">
            {selected.length ? (
              <MarkList marks={selected} onEdit={edit} />
            ) : (
              <p className="cal-widget-empty">这段时间还没有标记</p>
            )}
          </div>
          <div className="cal-widget-actions">
            <button
              className="button primary"
              onClick={() => setEditor({ range })}
            >
              <Plus size={14} />
              标记所选日期
            </button>
            <button className="text-button" onClick={() => void openFull()}>
              <Expand size={14} />
              完整日历
            </button>
          </div>
        </div>
      </div>
      {open && !editor && !sources && <ToastView />}
      {open && editor && (
        <CalendarEditor
          key={editor.mark?.id || "new"}
          {...editor}
          onClose={() => setEditor(null)}
        />
      )}
      {open && sources && <CalendarSources onClose={() => setSources(false)} />}
    </dialog>
  );
}
