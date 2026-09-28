import { Solar } from "lunar-typescript";
import { addDays, localDate } from "../model";
import type { CalendarColor, CalendarMark } from "../model";
import { HOLIDAY_YEARS, officialDay } from "./holidays";

export const MIN_DATE = "1900-01-01";
export const MAX_DATE = "2100-12-31";
export const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
export const COLORS: { id: CalendarColor; name: string }[] = [
  { id: "blue", name: "蓝色" },
  { id: "green", name: "绿色" },
  { id: "amber", name: "琥珀色" },
  { id: "rose", name: "玫红色" },
  { id: "violet", name: "紫色" },
  { id: "cyan", name: "青色" },
];
export type DateRange = { start: string; end: string };
export function orderedRange(a: string, b: string): DateRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}
export function validDay(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= MIN_DATE &&
    value <= MAX_DATE &&
    localDate(new Date(`${value}T12:00:00`)) === value
  );
}
export function supportedDay(value: string) {
  return value >= MIN_DATE && value <= MAX_DATE;
}
export function clampDay(value: string) {
  return value < MIN_DATE ? MIN_DATE : value > MAX_DATE ? MAX_DATE : value;
}
export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  return clampDay(localDate(new Date(y, m - 1 + by, 1, 12))).slice(0, 7);
}
export function monthDays(month: string) {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T12:00:00`).getDay();
  const start = addDays(first, -((weekday + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function daysBetween(a: string, b: string) {
  const utc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86400000);
}
export function shortDate(date: string, year = false) {
  return `${year ? `${Number(date.slice(0, 4))}年` : ""}${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}
export function rangeLabel(range: DateRange) {
  return range.start === range.end
    ? shortDate(range.start, true)
    : `${shortDate(range.start, true)} — ${shortDate(range.end, range.end.slice(0, 4) !== range.start.slice(0, 4))}`;
}
export function overlaps(mark: CalendarMark, range: DateRange) {
  return mark.startDate <= range.end && mark.endDate >= range.start;
}
export function rangeStats(range: DateRange) {
  const days = daysBetween(range.start, range.end) + 1;
  let workdays = 0;
  let known = true;
  if (days > 3660)
    return { days, workdays: 0, restdays: 0, known: false, tooLong: true };
  for (let i = 0; i < days; i++) {
    const date = addDays(range.start, i);
    const official = officialDay(date);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    if (!HOLIDAY_YEARS[Number(date.slice(0, 4))]) known = false;
    if (
      official?.kind === "work" ||
      (!official && weekday !== 0 && weekday !== 6)
    )
      workdays++;
  }
  return { days, workdays, restdays: days - workdays, known, tooLong: false };
}

const traditional = new Set([
  "春节",
  "元宵节",
  "端午节",
  "七夕节",
  "中秋节",
  "重阳节",
  "腊八节",
  "小年",
  "除夕",
]);
const solarFestivals: Record<string, string> = {
  "01-01": "元旦",
  "03-08": "妇女节",
  "05-01": "劳动节",
  "05-04": "青年节",
  "06-01": "儿童节",
  "09-10": "教师节",
  "10-01": "国庆节",
};
const cache = new Map<string, ReturnType<typeof calculateDay>>();
function calculateDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();
  const term = lunar.getJieQi();
  const festival =
    solarFestivals[date.slice(5)] ||
    lunar.getFestivals().find((f) => traditional.has(f)) ||
    (term === "清明" ? "清明节" : "");
  const lunarText = `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
  const short =
    festival ||
    term ||
    (lunar.getDay() === 1
      ? `${lunar.getMonthInChinese()}月`
      : lunar.getDayInChinese());
  const official = officialDay(date);
  const statutory =
    Boolean(HOLIDAY_YEARS[year]) &&
    (date.slice(5) === "01-01" ||
      ["05-01", "05-02", "10-01", "10-02", "10-03"].includes(date.slice(5)) ||
      term === "清明" ||
      (lunar.getMonth() === 1 && lunar.getDay() <= 3) ||
      (lunar.getMonth() === 5 && lunar.getDay() === 5) ||
      (lunar.getMonth() === 8 && lunar.getDay() === 15) ||
      festival === "除夕");
  return {
    date,
    day,
    weekday: new Date(`${date}T12:00:00`).getDay(),
    lunarText,
    short,
    term,
    festival,
    official,
    statutory,
  };
}
export function dayInfo(date: string) {
  let info = cache.get(date);
  if (!info) {
    info = calculateDay(date);
    if (cache.size > 3000) cache.clear();
    cache.set(date, info);
  }
  return info;
}
export function dayAccessibleName(date: string) {
  const info = dayInfo(date);
  return `${shortDate(date, true)}，农历${info.lunarText}${info.festival ? `，${info.festival}` : ""}${info.term && info.term !== info.festival ? `，${info.term}` : ""}${info.official ? (info.official.kind === "rest" ? `，${info.statutory ? "法定节假日" : "放假调休"}` : "，调休补班") : ""}`;
}
export function weekSpans(marks: CalendarMark[], weekStart: string) {
  const weekEnd = addDays(weekStart, 6);
  const ends: number[] = [];
  return marks
    .filter((m) => overlaps(m, { start: weekStart, end: weekEnd }))
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        b.endDate.localeCompare(a.endDate) ||
        a.id.localeCompare(b.id),
    )
    .map((mark) => {
      const start = Math.max(0, daysBetween(weekStart, mark.startDate));
      const end = Math.min(6, daysBetween(weekStart, mark.endDate));
      let lane = ends.findIndex((last) => last < start);
      if (lane < 0) lane = ends.length;
      ends[lane] = end;
      return {
        mark,
        start,
        end,
        lane,
        continuesBefore: mark.startDate < weekStart,
        continuesAfter: mark.endDate > weekEnd,
      };
    });
}
