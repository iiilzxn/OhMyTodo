// Official annual arrangements, independently verified against State Council notices.
// Festival calculation is intentionally separate from these rest / make-up-work dates.
export interface HolidayYear {
  source: string;
  published: string;
  breaks: { name: string; start: string; end: string }[];
  workdays: { date: string; name: string }[];
}
export const HOLIDAY_YEARS: Record<number, HolidayYear> = {
  2025: {
    source: "https://www.gov.cn/zhengce/zhengceku/202411/content_6986383.htm",
    published: "2024-11-12",
    breaks: [
      { name: "元旦", start: "2025-01-01", end: "2025-01-01" },
      { name: "春节", start: "2025-01-28", end: "2025-02-04" },
      { name: "清明节", start: "2025-04-04", end: "2025-04-06" },
      { name: "劳动节", start: "2025-05-01", end: "2025-05-05" },
      { name: "端午节", start: "2025-05-31", end: "2025-06-02" },
      { name: "国庆节 / 中秋节", start: "2025-10-01", end: "2025-10-08" },
    ],
    workdays: [
      { date: "2025-01-26", name: "春节" },
      { date: "2025-02-08", name: "春节" },
      { date: "2025-04-27", name: "劳动节" },
      { date: "2025-09-28", name: "国庆节 / 中秋节" },
      { date: "2025-10-11", name: "国庆节 / 中秋节" },
    ],
  },
  2026: {
    source: "https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm",
    published: "2025-11-04",
    breaks: [
      { name: "元旦", start: "2026-01-01", end: "2026-01-03" },
      { name: "春节", start: "2026-02-15", end: "2026-02-23" },
      { name: "清明节", start: "2026-04-04", end: "2026-04-06" },
      { name: "劳动节", start: "2026-05-01", end: "2026-05-05" },
      { name: "端午节", start: "2026-06-19", end: "2026-06-21" },
      { name: "中秋节", start: "2026-09-25", end: "2026-09-27" },
      { name: "国庆节", start: "2026-10-01", end: "2026-10-07" },
    ],
    workdays: [
      { date: "2026-01-04", name: "元旦" },
      { date: "2026-02-14", name: "春节" },
      { date: "2026-02-28", name: "春节" },
      { date: "2026-05-09", name: "劳动节" },
      { date: "2026-09-20", name: "国庆节" },
      { date: "2026-10-10", name: "国庆节" },
    ],
  },
};
export function officialDay(date: string) {
  const year = HOLIDAY_YEARS[Number(date.slice(0, 4))];
  if (!year) return null;
  const work = year.workdays.find((w) => w.date === date);
  if (work) return { kind: "work" as const, name: work.name };
  const rest = year.breaks.find((h) => date >= h.start && date <= h.end);
  return rest ? { kind: "rest" as const, name: rest.name } : null;
}
