import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Download,
  ExternalLink,
  Info,
  Plus,
  Search,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { CalendarMark } from "../model";
import { useApp } from "../state";
import { IconButton, Modal } from "../ui";
import { CalendarEditor } from "./CalendarEditor";
import { CalendarGrid } from "./CalendarGrid";
import type { Selection } from "./CalendarGrid";
import {
  dayInfo,
  monthDays,
  orderedRange,
  overlaps,
  rangeLabel,
  rangeStats,
  shortDate,
  validDay,
  WEEKDAYS,
} from "./dates";
import type { DateRange } from "./dates";
import { HOLIDAY_YEARS, officialDay } from "./holidays";
import { MonthControls } from "./MonthControls";
import "./calendar.css";

export const CALENDAR_REQUEST = "ohmytodo-calendar-navigation";
export function storedMonth(key: string, fallback: string) {
  const saved = localStorage.getItem(key);
  return saved && validDay(`${saved}-01`) ? saved : fallback.slice(0, 7);
}
export function CalendarSources({ onClose }: { onClose: () => void }) {
  const { notify } = useApp();
  return (
    <Modal title="节假日与农历" onClose={onClose}>
      <div className="form-body cal-sources">
        <p>
          适用范围：中国大陆全体公民放假安排。红色“休”表示官方公布的放假或调休日；“班”表示周末调休补班。普通周末不标为法定假日。
        </p>
        {Object.entries(HOLIDAY_YEARS).map(([year, data]) => (
          <div className="cal-source-row" key={year}>
            <div>
              <strong>{year} 年官方放假安排</strong>
              <small>国务院办公厅 · {data.published}</small>
            </div>
            <button
              className="text-button"
              onClick={() =>
                void invoke("open_holiday_source", {
                  year: Number(year),
                }).catch((e) => notify(String(e), undefined, true))
              }
            >
              原文
              <ExternalLink size={13} />
            </button>
          </div>
        ))}
        <p>
          其他年份仍可浏览、规划和标记，但不展示未收录的官方放假、调休安排。节日当天与连续假期不同，节气也不等同于假期。
        </p>
        <p>
          农历与二十四节气在本地计算。日历不会读取或生成待办、Feature
          和发布计划。
        </p>
        <small className="muted">
          农历计算：lunar-typescript
          1.8.6（MIT）。官方安排最近核对：2026-09-27。
        </small>
      </div>
    </Modal>
  );
}
export function HolidayLegend({
  year,
  onSources,
}: {
  year: number;
  onSources: () => void;
}) {
  return (
    <div className="cal-legend">
      <span>
        <b className="holiday-badge rest">休</b>放假
      </span>
      <span>
        <b className="holiday-badge work">班</b>调休补班
      </span>
      <button onClick={onSources}>
        <Info size={12} />
        {HOLIDAY_YEARS[year]
          ? `${year} 官方安排已收录`
          : `${year} 官方安排未收录`}
      </button>
    </div>
  );
}
export function MarkList({
  marks,
  onEdit,
  onLocate,
}: {
  marks: CalendarMark[];
  onEdit: (mark: CalendarMark) => void;
  onLocate?: (mark: CalendarMark) => void;
}) {
  return (
    <div className="cal-mark-list">
      {marks.map((mark) => (
        <div className="cal-mark-card" data-color={mark.color} key={mark.id}>
          <button
            className="cal-mark-main"
            onClick={() => onEdit(mark)}
            aria-label={`编辑标记：${mark.title}`}
          >
            <span className="cal-mark-color" />
            <div>
              <strong>{mark.title}</strong>
              <small>
                {rangeLabel({ start: mark.startDate, end: mark.endDate })}
              </small>
              {mark.notes && <p>{mark.notes}</p>}
            </div>
          </button>
          {onLocate && (
            <IconButton
              label={`定位日期：${mark.title}`}
              onClick={() => onLocate(mark)}
            >
              <CalendarDays size={15} />
            </IconButton>
          )}
        </div>
      ))}
    </div>
  );
}
function YearOverview({
  year,
  today,
  marks,
  onMonth,
}: {
  year: number;
  today: string;
  marks: CalendarMark[];
  onMonth: (month: string) => void;
}) {
  return (
    <div className="cal-year-grid">
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
        const month = `${year}-${String(m).padStart(2, "0")}`;
        return (
          <button
            className="cal-year-month"
            key={m}
            onClick={() => onMonth(month)}
            aria-label={`查看${year}年${m}月`}
          >
            <div className="cal-year-title">
              <strong>{m}月</strong>
              <span>
                {marks.filter(
                  (mark) =>
                    mark.startDate.slice(0, 7) <= month &&
                    mark.endDate.slice(0, 7) >= month,
                ).length || ""}
              </span>
            </div>
            <div className="cal-mini-week">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="cal-mini-days">
              {monthDays(month).map((date) => {
                const official = officialDay(date);
                const inMonth = date.slice(0, 7) === month;
                return (
                  <span
                    key={date}
                    className={`${!inMonth ? "outside" : ""} ${official?.kind || ""} ${date === today ? "today" : ""} ${inMonth && marks.some((mark) => mark.startDate <= date && mark.endDate >= date) ? "marked" : ""}`}
                    title={
                      official
                        ? `${date} ${official.name} ${official.kind === "rest" ? "休" : "班"}`
                        : date
                    }
                  >
                    {inMonth ? Number(date.slice(8)) : ""}
                  </span>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function CalendarPage() {
  const { data, day, notify } = useApp();
  const marks = data!.calendarMarks;
  const [month, setMonth] = useState(() =>
    storedMonth("ohmytodo-calendar-month", day),
  );
  const [selection, setSelection] = useState<Selection>(() => {
    const initial = month === day.slice(0, 7) ? day : `${month}-01`;
    return { anchor: initial, focus: initial };
  });
  const [view, setView] = useState<"month" | "year" | "marks">("month");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{
    mark?: CalendarMark;
    range: DateRange;
  } | null>(null);
  const [sources, setSources] = useState(false);
  const [exporting, setExporting] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const range = orderedRange(selection.anchor, selection.focus);
  const stats = useMemo(() => rangeStats(range), [range.start, range.end]);
  const single = range.start === range.end;
  const info = dayInfo(range.start);
  const selectedMarks = useMemo(
    () =>
      marks
        .filter((mark) => overlaps(mark, range))
        .sort(
          (a, b) =>
            a.startDate.localeCompare(b.startDate) ||
            a.title.localeCompare(b.title),
        ),
    [marks, range.start, range.end],
  );
  const visibleMarks = useMemo(() => {
    const days = monthDays(month);
    return marks.filter((mark) =>
      overlaps(mark, { start: days[0], end: days[41] }),
    );
  }, [month, marks]);
  const allMarks = [...marks]
    .filter((mark) =>
      `${mark.title} ${mark.notes}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.title.localeCompare(b.title),
    );
  useEffect(() => {
    localStorage.setItem("ohmytodo-calendar-month", month);
  }, [month]);
  useEffect(() => {
    const consume = () => {
      const raw = localStorage.getItem(CALENDAR_REQUEST);
      if (!raw) return;
      localStorage.removeItem(CALENDAR_REQUEST);
      try {
        const request = JSON.parse(raw) as Selection;
        if (validDay(request.anchor) && validDay(request.focus)) {
          setSelection(request);
          setMonth(request.focus.slice(0, 7));
          setView("month");
        }
      } catch {
        /* A stale UI preference is harmless. */
      }
    };
    const storage = (e: StorageEvent) => {
      if (e.key === CALENDAR_REQUEST) consume();
    };
    consume();
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  useEffect(() => {
    const create = () => setEditor({ range });
    const find = () => {
      setView("marks");
      requestAnimationFrame(() => search.current?.focus());
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "n" &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.isComposing &&
        !document.querySelector("dialog[open]") &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest("input,textarea,select")
        )
      ) {
        e.preventDefault();
        create();
      }
    };
    window.addEventListener("calendar-new-mark", create);
    window.addEventListener("calendar-search", find);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("calendar-new-mark", create);
      window.removeEventListener("calendar-search", find);
      window.removeEventListener("keydown", key);
    };
  }, [range.start, range.end]);
  const today = () => {
    setMonth(day.slice(0, 7));
    setSelection({ anchor: day, focus: day });
    if (view !== "year") setView("month");
  };
  const edit = (mark: CalendarMark) =>
    setEditor({ mark, range: { start: mark.startDate, end: mark.endDate } });
  const locate = (mark: CalendarMark) => {
    setMonth(mark.startDate.slice(0, 7));
    setSelection({ anchor: mark.startDate, focus: mark.endDate });
    setView("month");
  };
  const exportMarks = async () => {
    setExporting(true);
    try {
      const path = await save({
        defaultPath: `calendar-marks-${day}.ics`,
        filters: [{ name: "iCalendar 日历", extensions: ["ics"] }],
      });
      if (path) {
        await invoke("export_calendar", { path });
        notify(`已导出 ${marks.length} 条日历标记`);
      }
    } catch (e) {
      notify(String(e), undefined, true);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="page calendar-page">
      <header className="cal-page-heading">
        <div>
          <div className="eyebrow">留出时间，从容规划</div>
          <h1>日历</h1>
        </div>
        <div className="cal-heading-actions">
          <IconButton label="节假日数据说明" onClick={() => setSources(true)}>
            <Info size={18} />
          </IconButton>
          <button
            className="button secondary"
            disabled={!marks.length || exporting}
            onClick={() => void exportMarks()}
          >
            <Download size={15} />
            导出标记
          </button>
          <button
            className="button primary"
            onClick={() => setEditor({ range })}
          >
            <Plus size={16} />
            新建标记
          </button>
        </div>
      </header>
      <div className="cal-navigation">
        <MonthControls
          month={month}
          onMonth={setMonth}
          onToday={today}
          yearOnly={view === "year"}
        />
        <div className="segmented cal-view-tabs">
          {(
            [
              { id: "month", label: "月历" },
              { id: "year", label: "年览" },
              { id: "marks", label: "标记" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              className={view === tab.id ? "active" : ""}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <HolidayLegend
        year={Number(month.slice(0, 4))}
        onSources={() => setSources(true)}
      />
      {view === "month" ? (
        <div className="cal-layout">
          <div className="cal-month-board">
            <CalendarGrid
              month={month}
              today={day}
              marks={visibleMarks}
              selection={selection}
              onSelect={setSelection}
              onMonth={setMonth}
              onCreate={(date, selected) =>
                setEditor({ range: selected || { start: date, end: date } })
              }
              onEdit={edit}
            />
            <div className="cal-help">
              拖动选择范围 · Shift + 点击可跨月选择 · 双击日期添加标记
            </div>
          </div>
          <aside className="cal-detail">
            <div className="cal-selection-heading">
              {single ? (
                <>
                  <span className="cal-selected-number">
                    {Number(range.start.slice(8))}
                  </span>
                  <div>
                    <strong>{shortDate(range.start, true)}</strong>
                    <small>
                      星期
                      {
                        ["日", "一", "二", "三", "四", "五", "六"][info.weekday]
                      }{" "}
                      · 农历{info.lunarText}
                    </small>
                  </div>
                </>
              ) : (
                <div>
                  <span className="eyebrow">已选日期范围</span>
                  <h2>
                    {shortDate(range.start)}
                    <span> — </span>
                    {shortDate(
                      range.end,
                      range.start.slice(0, 4) !== range.end.slice(0, 4),
                    )}
                  </h2>
                  <small>{range.start.slice(0, 4)} 年 · 包含首尾两天</small>
                </div>
              )}
            </div>
            {single && (
              <div className="cal-day-facts">
                {info.official ? (
                  <span className={`cal-fact ${info.official.kind}`}>
                    <b>{info.official.kind === "rest" ? "休" : "班"}</b>
                    {info.official.name} ·{" "}
                    {info.official.kind === "work"
                      ? "调休补班"
                      : info.statutory
                        ? "法定节假日"
                        : "放假调休"}
                  </span>
                ) : info.festival ? (
                  <span className="cal-fact">{info.festival}</span>
                ) : (
                  <span className="muted">
                    {info.weekday === 0 || info.weekday === 6 ? "周末" : "平日"}
                  </span>
                )}
                {info.term && (
                  <span className="cal-term">节气 · {info.term}</span>
                )}
              </div>
            )}
            {!single && (
              <div className="cal-range-stats">
                <div>
                  <strong>{stats.days}</strong>
                  <span>总天数</span>
                </div>
                <div>
                  <strong>{stats.tooLong ? "—" : stats.workdays}</strong>
                  <span>{stats.known ? "工作日" : "工作日估算"}</span>
                </div>
                <div>
                  <strong>{stats.tooLong ? "—" : stats.restdays}</strong>
                  <span>休息日</span>
                </div>
              </div>
            )}
            {!stats.known && (
              <p className="cal-data-notice">
                {stats.tooLong
                  ? "一次最多标记 3660 天，请缩小范围。"
                  : "所选年份的官方安排未完全收录，工作日按周末及已收录安排估算。"}
              </p>
            )}
            <button
              className="button primary cal-mark-selection"
              disabled={stats.tooLong}
              onClick={() => setEditor({ range })}
            >
              <Plus size={15} />
              {single ? "标记这一天" : "标记这段时间"}
            </button>
            <div className="cal-detail-list-title">
              {single ? "当天标记" : "范围内的标记"}
              <span>{selectedMarks.length}</span>
            </div>
            {selectedMarks.length ? (
              <MarkList marks={selectedMarks} onEdit={edit} />
            ) : (
              <div className="cal-no-marks">
                <CalendarDays size={25} strokeWidth={1.4} />
                <p>还没有标记</p>
                <small>用颜色记下想安排的事。</small>
              </div>
            )}
          </aside>
        </div>
      ) : view === "year" ? (
        <YearOverview
          year={Number(month.slice(0, 4))}
          marks={marks}
          today={day}
          onMonth={(m) => {
            setMonth(m);
            setSelection({ anchor: `${m}-01`, focus: `${m}-01` });
            setView("month");
          }}
        />
      ) : (
        <div className="cal-agenda">
          <div className="cal-agenda-toolbar">
            <div className="cal-search">
              <Search size={15} />
              <input
                ref={search}
                aria-label="搜索日历标记"
                placeholder="搜索标记名称或备注"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <IconButton label="清空日历搜索" onClick={() => setQuery("")}>
                  <X size={13} />
                </IconButton>
              )}
            </div>
            <span>{allMarks.length} 条标记 · 全部日期</span>
          </div>
          {allMarks.length ? (
            <MarkList marks={allMarks} onEdit={edit} onLocate={locate} />
          ) : (
            <div className="cal-no-marks large">
              <CalendarDays size={33} strokeWidth={1.4} />
              <h3>{query ? "没有匹配的标记" : "给未来的安排，留一个位置"}</h3>
              <p>在月历选择一天或一段日期，即可添加标记。</p>
            </div>
          )}
        </div>
      )}
      {sources && <CalendarSources onClose={() => setSources(false)} />}
      {editor && (
        <CalendarEditor
          key={editor.mark?.id || `${editor.range.start}:${editor.range.end}`}
          {...editor}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
