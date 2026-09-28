export interface CheckItem {
  id: string;
  title: string;
  done: boolean;
}
export interface Task {
  id: string;
  title: string;
  notes: string;
  category: "work" | "life";
  today: boolean;
  starred: boolean;
  dueDate: string | null;
  dueTime: string | null;
  repeat: "none" | "daily" | "weekly";
  items: CheckItem[];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  generatedFrom: string | null;
}
export interface Feature {
  id: string;
  title: string;
  notes: string;
  items: CheckItem[];
  accepted: boolean;
}
export interface ReleaseStep extends CheckItem {
  required: boolean;
}
export interface Release {
  id: string;
  project: string;
  version: string;
  date: string;
  notes: string;
  features: Feature[];
  steps: ReleaseStep[];
  status: "planned" | "released";
  remind: boolean;
  createdAt: string;
  releasedAt: string | null;
}
export interface ChecklistTemplate {
  id: string;
  name: string;
  steps: ReleaseStep[];
}
export interface Settings {
  theme: "system" | "light" | "dark";
  notifications: boolean;
}
export interface AppData {
  schemaVersion: number;
  revision: number;
  tasks: Task[];
  releases: Release[];
  templates: ChecklistTemplate[];
  settings: Settings;
  calendarMarks: CalendarMark[];
}
export type CalendarColor =
  "blue" | "green" | "amber" | "rose" | "violet" | "cyan";
export interface CalendarMark {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  color: CalendarColor;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
export type Action =
  | { type: "add_task"; task: Task }
  | { type: "update_task"; id: string; patch: Partial<Task> }
  | { type: "toggle_task" | "delete_task"; id: string }
  | { type: "toggle_task_item"; id: string; itemId: string }
  | { type: "add_release"; release: Release }
  | { type: "update_release"; id: string; patch: Partial<Release> }
  | { type: "delete_release"; id: string }
  | { type: "release_status"; id: string; status: Release["status"] }
  | { type: "upsert_feature"; releaseId: string; feature: Feature }
  | {
      type: "remove_feature" | "toggle_feature_accepted";
      releaseId: string;
      featureId: string;
    }
  | {
      type: "toggle_feature_item";
      releaseId: string;
      featureId: string;
      itemId: string;
    }
  | { type: "toggle_release_step"; releaseId: string; stepId: string }
  | { type: "set_settings"; settings: Settings }
  | { type: "upsert_template"; template: ChecklistTemplate }
  | { type: "delete_template"; id: string }
  | {
      type: "upsert_calendar_mark";
      mark: CalendarMark;
      expectedUpdatedAt: string | null;
    }
  | { type: "delete_calendar_mark"; id: string; expectedUpdatedAt: string };
export type View =
  | "today"
  | "inbox"
  | "planned"
  | "completed"
  | "work"
  | "life"
  | "releases"
  | "settings"
  | "search"
  | "calendar"
  | `release:${string}`;
export const uid = () => crypto.randomUUID();
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
export function dateLabel(date: string | null, base = localDate()) {
  if (!date) return "";
  if (date === base) return "今天";
  if (date === addDays(base, 1)) return "明天";
  if (date === addDays(base, -1)) return "昨天";
  const d = new Date(`${date}T12:00:00`);
  return `${d.getFullYear() !== new Date(`${base}T12:00:00`).getFullYear() ? `${d.getFullYear()}年` : ""}${d.getMonth() + 1}月${d.getDate()}日`;
}
export function isToday(t: Task, day = localDate()) {
  return t.today || Boolean(t.dueDate && t.dueDate <= day);
}
export function releaseReady(r: Release) {
  return (
    r.features.every((f) => f.accepted) &&
    r.steps.filter((s) => s.required).every((s) => s.done)
  );
}
export function pendingCount(r: Release) {
  return r.steps.filter((s) => s.required && !s.done).length;
}
export function featurePending(r: Release) {
  return r.features.filter((f) => !f.accepted).length;
}
export function newTask(title = "", overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title,
    notes: "",
    category: "work",
    today: true,
    starred: false,
    dueDate: null,
    dueTime: null,
    repeat: "none",
    items: [],
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    generatedFrom: null,
    ...overrides,
  };
}
export function parseItems(
  text: string,
  existing: CheckItem[] = [],
): CheckItem[] {
  const available = [...existing];
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((title) => {
      const index = available.findIndex((i) => i.title === title);
      return index < 0
        ? { id: uid(), title, done: false }
        : available.splice(index, 1)[0];
    });
}
export function changed<T extends object>(
  before: T,
  after: T,
  keys: (keyof T)[],
): Partial<T> {
  return Object.fromEntries(
    keys
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      .map((k) => [k, after[k]]),
  ) as Partial<T>;
}
export function sortTasks(tasks: Task[]) {
  return [...tasks].sort(
    (a, b) =>
      Number(b.starred) - Number(a.starred) ||
      (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
