import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "../ui";
import { useApp } from "../state";
import { shiftMonth } from "./dates";

const firstYear = 1900;
const lastYear = 2100;
const yearPage = (year: number) =>
  firstYear + Math.floor((year - firstYear) / 12) * 12;

export function MonthControls({
  month,
  onMonth,
  onToday,
  compact = false,
  yearOnly = false,
}: {
  month: string;
  onMonth: (month: string) => void;
  onToday: () => void;
  compact?: boolean;
  yearOnly?: boolean;
}) {
  const { day } = useApp();
  const [year, number] = month.split("-").map(Number);
  const [panel, setPanel] = useState<"year" | "month" | null>(null);
  const [page, setPage] = useState(yearPage(year));
  const [browseYear, setBrowseYear] = useState(year);
  const [typedYear, setTypedYear] = useState(String(year));
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const id = useId();
  const todayYear = Number(day.slice(0, 4));
  const todayMonth = Number(day.slice(5, 7));
  const validYear =
    /^\d{4}$/.test(typedYear) &&
    Number(typedYear) >= firstYear &&
    Number(typedYear) <= lastYear;
  const close = (restoreFocus = true) => {
    setPanel(null);
    if (restoreFocus) opener.current?.focus();
  };
  const open = (kind: "year" | "month", button: HTMLButtonElement) => {
    opener.current = button;
    setPage(yearPage(year));
    setBrowseYear(year);
    setTypedYear(String(year));
    setPanel(panel === kind ? null : kind);
  };
  const choose = (y: number, m: number) => {
    onMonth(`${y}-${String(m).padStart(2, "0")}`);
    close();
  };
  useEffect(() => {
    if (!panel) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setPanel(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [panel]);
  useEffect(() => {
    if (!panel) return;
    const selected = grid.current?.querySelector<HTMLButtonElement>(
      '[aria-pressed="true"]',
    );
    (
      selected ||
      grid.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")
    )?.focus();
  }, [panel, page, browseYear]);
  const moveInGrid = (event: KeyboardEvent<HTMLButtonElement>) => {
    const buttons = Array.from(
      grid.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) || [],
    );
    const index = buttons.indexOf(event.currentTarget);
    const columns = panel === "year" ? 3 : 4;
    const next =
      event.key === "ArrowRight"
        ? index + 1
        : event.key === "ArrowLeft"
          ? index - 1
          : event.key === "ArrowDown"
            ? index + columns
            : event.key === "ArrowUp"
              ? index - columns
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : null;
    if (next !== null) {
      event.preventDefault();
      event.stopPropagation();
      buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
    }
  };
  return (
    <div className={`cal-month-controls ${compact ? "small" : ""}`}>
      <div
        ref={root}
        className="cal-month-pickers"
        onBlur={(e) => {
          if (
            e.relatedTarget instanceof Node &&
            !e.currentTarget.contains(e.relatedTarget)
          )
            close(false);
        }}
        onKeyDown={(e) => {
          if (panel) e.stopPropagation();
          if (e.key === "Escape" && panel) {
            e.preventDefault();
            close();
          }
        }}
      >
        <button
          className="cal-period-trigger"
          aria-label="日历年份"
          aria-haspopup="dialog"
          aria-expanded={panel === "year"}
          aria-controls={panel === "year" ? id : undefined}
          onClick={(e) => open("year", e.currentTarget)}
        >
          {year}
          <span>年</span>
          <ChevronDown size={14} />
        </button>
        {!yearOnly && (
          <button
            className="cal-period-trigger"
            aria-label="日历月份"
            aria-haspopup="dialog"
            aria-expanded={panel === "month"}
            aria-controls={panel === "month" ? id : undefined}
            onClick={(e) => open("month", e.currentTarget)}
          >
            {number}
            <span>月</span>
            <ChevronDown size={14} />
          </button>
        )}
        {panel && (
          <div
            className="cal-period-panel"
            role="dialog"
            aria-label={panel === "year" ? "选择年份" : "选择月份"}
            id={id}
          >
            <div className="cal-period-caption">
              {panel === "year" ? "选择年份" : "选择月份"}
            </div>
            <div className="cal-period-heading">
              <IconButton
                label={panel === "year" ? "上一组年份" : "月份面板上一年"}
                disabled={
                  panel === "year"
                    ? page === firstYear
                    : browseYear === firstYear
                }
                onClick={() =>
                  panel === "year"
                    ? setPage(page - 12)
                    : setBrowseYear(browseYear - 1)
                }
              >
                <ChevronLeft size={16} />
              </IconButton>
              <strong aria-live="polite">
                {panel === "year"
                  ? `${page} — ${Math.min(lastYear, page + 11)}`
                  : `${browseYear} 年`}
              </strong>
              <IconButton
                label={panel === "year" ? "下一组年份" : "月份面板下一年"}
                disabled={
                  panel === "year"
                    ? page + 11 >= lastYear
                    : browseYear === lastYear
                }
                onClick={() =>
                  panel === "year"
                    ? setPage(page + 12)
                    : setBrowseYear(browseYear + 1)
                }
              >
                <ChevronRight size={16} />
              </IconButton>
            </div>
            <div
              className={`cal-period-grid ${panel === "year" ? "years" : "months"}`}
              ref={grid}
            >
              {Array.from({ length: 12 }, (_, i) =>
                panel === "year" ? page + i : i + 1,
              ).map((value) => {
                const selected =
                  panel === "year"
                    ? value === year
                    : value === number && browseYear === year;
                const current =
                  panel === "year"
                    ? value === todayYear
                    : browseYear === todayYear && value === todayMonth;
                return (
                  <button
                    key={`${panel}-${value}`}
                    type="button"
                    disabled={panel === "year" && value > lastYear}
                    aria-label={panel === "year" ? `${value}年` : `${value}月`}
                    aria-pressed={selected}
                    aria-current={current ? "date" : undefined}
                    onClick={() =>
                      choose(
                        panel === "year" ? value : browseYear,
                        panel === "year" ? number : value,
                      )
                    }
                    onKeyDown={moveInGrid}
                  >
                    {value}
                    {panel === "month" && <span>月</span>}
                    {current && <i aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            {panel === "year" ? (
              <form
                className="cal-year-jump"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (validYear) choose(Number(typedYear), number);
                }}
              >
                <input
                  aria-label="直接输入年份"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="1900 — 2100"
                  value={typedYear}
                  onChange={(e) =>
                    setTypedYear(e.target.value.replace(/\D/g, ""))
                  }
                />
                <button type="submit" disabled={!validYear}>
                  前往
                  <ChevronRight size={13} />
                </button>
              </form>
            ) : (
              <button
                className="cal-period-current"
                onClick={() => {
                  onToday();
                  close();
                }}
              >
                回到本月
                <span>
                  {todayYear} 年 {todayMonth} 月
                </span>
              </button>
            )}
          </div>
        )}
      </div>
      <div className="cal-month-arrows">
        <IconButton
          label={yearOnly ? "上一年" : "上个月"}
          disabled={yearOnly ? year === firstYear : month === "1900-01"}
          onClick={() => onMonth(shiftMonth(month, yearOnly ? -12 : -1))}
        >
          <ChevronLeft size={17} />
        </IconButton>
        <button className="cal-today-button" onClick={onToday}>
          {yearOnly ? "今年" : "今天"}
        </button>
        <IconButton
          label={yearOnly ? "下一年" : "下个月"}
          disabled={yearOnly ? year === lastYear : month === "2100-12"}
          onClick={() => onMonth(shiftMonth(month, yearOnly ? 12 : 1))}
        >
          <ChevronRight size={17} />
        </IconButton>
      </div>
    </div>
  );
}
