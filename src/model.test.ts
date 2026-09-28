import { describe, expect, it } from "vitest";
import {
  addDays,
  changed,
  dateLabel,
  isToday,
  localDate,
  newTask,
  parseItems,
  releaseReady,
} from "./model";
import type { Release } from "./model";

describe("personal planning rules", () => {
  it("uses local dates across month and leap year boundaries", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dateLabel("2027-01-01", "2026-12-31")).toBe("明天");
    expect(localDate(new Date(2026, 0, 1, 0, 15))).toBe("2026-01-01");
  });
  it("keeps overdue tasks in today without pulling in future work", () => {
    expect(
      isToday(
        newTask("past", { today: false, dueDate: "2026-09-25" }),
        "2026-09-26",
      ),
    ).toBe(true);
    expect(
      isToday(
        newTask("future", { today: false, dueDate: "2026-09-27" }),
        "2026-09-26",
      ),
    ).toBe(false);
    expect(
      isToday(
        newTask("selected", { today: true, dueDate: "2026-09-27" }),
        "2026-09-26",
      ),
    ).toBe(true);
  });
  it("preserves checklist identity when editing/reordering, including duplicate titles", () => {
    const old = [
      { id: "a", title: "验收", done: true },
      { id: "b", title: "验收", done: false },
      { id: "c", title: "测试", done: true },
    ];
    const result = parseItems("测试\n验收\n验收\n新功能", old);
    expect(result.slice(0, 3).map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(result.map((i) => i.done)).toEqual([true, true, false, false]);
  });
  it("requires explicit feature acceptance separately from checklist completion", () => {
    const r = {
      features: [{ accepted: false, items: [{ done: true }] }],
      steps: [
        { required: true, done: true },
        { required: false, done: false },
      ],
    } as Release;
    expect(releaseReady(r)).toBe(false);
    r.features[0].accepted = true;
    expect(releaseReady(r)).toBe(true);
    r.steps[0].done = false;
    expect(releaseReady(r)).toBe(false);
  });
  it("sends only edited fields, protecting unrelated changes from another window", () => {
    const task = newTask("原名称");
    const next = { ...task, title: "新名称" };
    expect(changed(task, next, ["title", "today", "items"])).toEqual({
      title: "新名称",
    });
  });
});
