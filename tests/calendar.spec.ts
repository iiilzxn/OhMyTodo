import {
  test,
  expect,
  chromium,
  type Browser,
  type Page,
} from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import net from "node:net";

async function api<T = any>(
  page: Page,
  command: string,
  args: object = {},
): Promise<T> {
  return page.evaluate(
    ({ command, args }) =>
      (window as any).__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
}
async function portNumber() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function chooseMonth(page: Page, year: number, month: number) {
  await page.getByRole("button", { name: "日历年份", exact: true }).click();
  await page.getByLabel("直接输入年份", { exact: true }).fill(String(year));
  await page.getByRole("button", { name: "前往", exact: true }).click();
  await page.getByRole("button", { name: "日历月份", exact: true }).click();
  await page.getByRole("button", { name: `${month}月`, exact: true }).click();
}

test("calendar is independent: official holidays, drag ranges, widget, backup and export", async () => {
  const directory = path.resolve(
    `output/verification/calendar-data-${Date.now()}`,
  );
  const shots = path.resolve("output/verification/calendar");
  await mkdir(directory, { recursive: true });
  await mkdir(shots, { recursive: true });
  const exe =
    process.env.OHMYTODO_EXE ||
    path.resolve("src-tauri/target/debug/ohmytodo.exe");
  let child: ChildProcess;
  let browser: Browser;
  let main: Page;
  let widget: Page;
  const errors: string[] = [];
  const start = async () => {
    const port = await portNumber();
    child = spawn(exe, [], {
      cwd: path.dirname(exe),
      windowsHide: true,
      env: {
        ...process.env,
        OHMYTODO_DATA_DIR: directory,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
      },
      stdio: "ignore",
    });
    await expect(async () => {
      expect((await fetch(`http://127.0.0.1:${port}/json/version`)).ok).toBe(
        true,
      );
    }).toPass({ timeout: 30000 });
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    await expect
      .poll(
        () =>
          browser
            .contexts()[0]
            .pages()
            .filter((p) => p.url().includes("tauri.localhost")).length,
      )
      .toBe(2);
    main = browser
      .contexts()[0]
      .pages()
      .find((p) => !p.url().includes("view=widget"))!;
    widget = browser
      .contexts()[0]
      .pages()
      .find((p) => p.url().includes("view=widget"))!;
    for (const p of [main, widget])
      p.on("pageerror", (e) => errors.push(e.message));
    await expect(
      main.getByRole("heading", { name: "今天", exact: true }),
    ).toBeVisible();
  };
  const stop = async () => {
    if (child && child.exitCode === null) {
      const exit = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      await api(main, "window_action", { action: "quit", target: null }).catch(
        () => {},
      );
      await Promise.race([exit, new Promise((r) => setTimeout(r, 1500))]);
      if (child.exitCode === null) {
        child.kill();
        await exit;
      }
    }
    await browser?.close().catch(() => {});
  };
  const day = (page: Page, date: string) =>
    page.locator(`[data-calendar-date="${date}"] .cal-day-button`);
  try {
    await start();
    await api(main, "add_examples");
    const baseline = await api(main, "get_state");
    await main
      .getByRole("navigation", { name: "主要导航" })
      .getByRole("button", { name: "日历", exact: true })
      .click();
    await expect(
      main.getByRole("heading", { name: "日历", exact: true }),
    ).toBeVisible();
    await chooseMonth(main, 2026, 9);
    await main.getByRole("button", { name: "日历年份", exact: true }).click();
    await expect(
      main.getByRole("button", { name: "2026年", exact: true }),
    ).toBeFocused();
    await main.keyboard.press("ArrowRight");
    await main.keyboard.press("Enter");
    await expect(
      main.getByRole("button", { name: "日历年份", exact: true }),
    ).toHaveText("2027年");
    await main.getByRole("button", { name: "日历年份", exact: true }).click();
    await main.getByLabel("直接输入年份").fill("1899");
    await expect(
      main.getByRole("button", { name: "前往", exact: true }),
    ).toBeDisabled();
    await main.getByLabel("直接输入年份").fill("2100");
    await main.getByRole("button", { name: "前往", exact: true }).click();
    await main.getByRole("button", { name: "日历年份", exact: true }).click();
    await expect(
      main.getByRole("button", { name: "下一组年份", exact: true }),
    ).toBeDisabled();
    await main.keyboard.press("Escape");
    await expect(
      main.getByRole("button", { name: "日历年份", exact: true }),
    ).toBeFocused();
    await chooseMonth(main, 2026, 9);
    await main.getByRole("button", { name: "日历月份", exact: true }).click();
    await main.screenshot({
      animations: "disabled",
      path: path.join(shots, "05-month-picker.png"),
    });
    await main.keyboard.press("Escape");
    await expect(
      main.locator('[data-calendar-date="2026-09-20"] .holiday-badge'),
    ).toHaveText("班");
    await expect(
      main.locator('[data-calendar-date="2026-09-27"] .holiday-badge'),
    ).toHaveText("休");
    await expect(day(main, "2026-09-25")).toContainText("中秋节");
    await expect(main.locator(".calendar-page")).not.toContainText("NoteDesk");

    const startBox = await day(main, "2026-09-28").boundingBox();
    const endBox = await day(main, "2026-10-07").boundingBox();
    expect(startBox).not.toBeNull();
    expect(endBox).not.toBeNull();
    await main.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + 10);
    await main.mouse.down();
    await main.mouse.move(endBox!.x + endBox!.width / 2, endBox!.y + 10, {
      steps: 14,
    });
    await main.mouse.up();
    await expect(main.locator(".cal-range-stats")).toContainText("10");
    await main
      .getByRole("button", { name: "标记这段时间", exact: true })
      .click();
    await expect(main.getByLabel("开始日期", { exact: true })).toHaveValue(
      "2026-09-28",
    );
    await expect(main.getByLabel("结束日期", { exact: true })).toHaveValue(
      "2026-10-07",
    );
    await main.getByLabel("标记名称", { exact: true }).fill("国庆休假规划");
    await main.getByRole("radio", { name: "紫色", exact: true }).check();
    await main
      .getByLabel("日历备注", { exact: true })
      .fill("沿途停留，留出缓冲时间");
    await main.getByRole("button", { name: "保存标记", exact: true }).click();
    await expect(
      main.locator(".cal-ribbon").filter({ hasText: "国庆休假规划" }),
    ).toHaveCount(2);
    await day(main, "2026-09-20").click();
    await main.keyboard.press("Shift+ArrowRight");
    await main.keyboard.press("Shift+ArrowRight");
    await main.keyboard.press("Enter");
    await expect(main.getByLabel("开始日期", { exact: true })).toHaveValue(
      "2026-09-20",
    );
    await expect(main.getByLabel("结束日期", { exact: true })).toHaveValue(
      "2026-09-22",
    );
    await main.getByRole("button", { name: "取消", exact: true }).click();
    await day(main, "2026-10-01").dblclick();
    await main.getByLabel("标记名称", { exact: true }).fill("家人聚会");
    await main.getByRole("radio", { name: "玫红色", exact: true }).check();
    await main.getByRole("button", { name: "保存标记", exact: true }).click();
    await main.getByRole("button", { name: "关闭提示", exact: true }).click();
    await main.screenshot({
      animations: "disabled",
      path: path.join(shots, "01-month-ranges.png"),
    });

    await day(main, "2026-09-30").click();
    await main.getByRole("button", { name: "下个月", exact: true }).click();
    await day(main, "2026-10-10").click({ modifiers: ["Shift"] });
    await main
      .getByRole("button", { name: "标记这段时间", exact: true })
      .click();
    await expect(main.getByLabel("开始日期", { exact: true })).toHaveValue(
      "2026-09-30",
    );
    await expect(main.getByLabel("结束日期", { exact: true })).toHaveValue(
      "2026-10-10",
    );
    await main.getByLabel("标记名称", { exact: true }).fill("跨月学习");
    await main.getByRole("radio", { name: "绿色", exact: true }).check();
    await main.getByRole("button", { name: "保存标记", exact: true }).click();
    let state = await api(main, "get_state");
    expect(state.tasks).toEqual(baseline.tasks);
    expect(state.releases).toEqual(baseline.releases);
    expect(state.calendarMarks).toHaveLength(3);

    await main.getByRole("button", { name: "年览", exact: true }).click();
    await expect(main.locator(".cal-year-month")).toHaveCount(12);
    await expect(main.locator(".cal-year-month").last()).toBeInViewport({
      ratio: 1,
    });
    await main.getByRole("button", { name: "下一年", exact: true }).click();
    await expect(main.getByLabel("日历年份", { exact: true })).toHaveText(
      "2027年",
    );
    await main.getByRole("button", { name: "上一年", exact: true }).click();
    await main.screenshot({
      animations: "disabled",
      path: path.join(shots, "02-year-overview.png"),
    });
    await main
      .getByRole("button", { name: "查看2026年10月", exact: true })
      .click();
    await chooseMonth(main, 2027, 1);
    await expect(
      main.getByRole("button", { name: /2027 官方安排未收录/ }),
    ).toBeVisible();
    await expect(day(main, "2027-01-01")).toContainText("元旦");
    await expect(
      main.locator('[data-calendar-date="2027-01-01"] .holiday-badge'),
    ).toHaveCount(0);
    await main.getByRole("button", { name: "标记", exact: true }).click();
    await main.getByLabel("搜索日历标记", { exact: true }).fill("国庆");
    await expect(main.locator(".cal-agenda .cal-mark-card")).toHaveCount(1);
    await main
      .locator(".cal-agenda")
      .getByRole("button", { name: "编辑标记：国庆休假规划", exact: true })
      .click();
    await main
      .getByLabel("标记名称", { exact: true })
      .fill("国庆休假 · 调整版");
    await main.getByRole("button", { name: "保存标记", exact: true }).click();

    await main.getByRole("button", { name: "悬浮窗", exact: true }).click();
    await expect(widget.locator(".cal-widget")).toBeVisible();
    const popup = widget.getByRole("dialog", { name: "悬浮日历", exact: true });
    await expect(popup).toBeVisible();
    await expect(widget.locator(".widget-tabs button")).toHaveCount(2);
    await widget.keyboard.press("Escape");
    await expect(popup).not.toBeVisible();
    await widget.getByLabel("悬浮窗添加待办").fill("保留未提交的想法");
    await widget.getByRole("button", { name: "打开日历", exact: true }).click();
    await chooseMonth(widget, 2026, 9);
    await widget.getByRole("button", { name: "日历年份", exact: true }).click();
    await widget.screenshot({
      animations: "disabled",
      path: path.join(shots, "06-widget-year-picker.png"),
    });
    await widget.keyboard.press("Escape");
    await expect(popup).toBeVisible();
    await expect(
      widget.getByRole("dialog", { name: "选择年份", exact: true }),
    ).not.toBeVisible();
    await widget
      .getByRole("button", { name: "标记所选日期", exact: true })
      .click();
    await widget.keyboard.press("Escape");
    await expect(popup).toBeVisible();
    await expect(
      widget.getByRole("dialog", { name: "新建日历标记", exact: true }),
    ).not.toBeVisible();
    await widget.mouse.click(14, 20);
    await expect(popup).not.toBeVisible();
    await expect(widget.getByLabel("悬浮窗添加待办")).toHaveValue(
      "保留未提交的想法",
    );
    await widget.getByLabel("悬浮窗添加待办").fill("");
    await widget
      .getByRole("button", { name: "收起悬浮窗", exact: true })
      .click();
    await widget.getByRole("button", { name: "打开日历", exact: true }).click();
    await expect(popup).toBeVisible();
    await expect(widget.locator(".widget")).not.toHaveClass(/collapsed/);
    await day(widget, "2026-09-29").click();
    await widget
      .getByRole("button", { name: "标记所选日期", exact: true })
      .click();
    await widget.getByLabel("标记名称", { exact: true }).fill("出差准备");
    await widget.getByRole("button", { name: "保存标记", exact: true }).click();
    await widget.getByRole("button", { name: "关闭提示", exact: true }).click();
    await widget
      .getByRole("button", { name: "编辑标记：出差准备", exact: true })
      .click();
    await widget.getByRole("button", { name: "删除", exact: true }).click();
    await widget.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(
      widget.getByRole("button", { name: "编辑标记：出差准备", exact: true }),
    ).toBeVisible();
    await widget.screenshot({
      animations: "disabled",
      path: path.join(shots, "03-widget-calendar.png"),
    });
    state = await api(main, "get_state");
    expect(state.calendarMarks).toHaveLength(4);
    expect(state.tasks).toEqual(baseline.tasks);
    expect(state.releases).toEqual(baseline.releases);
    await widget.getByRole("button", { name: "完整日历", exact: true }).click();
    await expect(
      main.getByRole("grid", { name: "2026-09 月历", exact: true }),
    ).toBeVisible();
    await expect(
      main.locator('[data-calendar-date="2026-09-29"]'),
    ).toHaveAttribute("aria-selected", "true");

    await main
      .locator(".cal-detail")
      .getByRole("button", { name: "编辑标记：出差准备", exact: true })
      .click();
    await main.getByRole("button", { name: "删除", exact: true }).click();
    await expect(main.locator(".cal-detail")).not.toContainText("出差准备");
    await main.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(main.locator(".cal-detail")).toContainText("出差准备");
    const mark = (await api(main, "get_state")).calendarMarks.find(
      (m: any) => m.title === "出差准备",
    );
    await main
      .locator(".cal-detail")
      .getByRole("button", { name: "编辑标记：出差准备", exact: true })
      .click();
    await api(widget, "dispatch", {
      action: {
        type: "upsert_calendar_mark",
        mark: { ...mark, title: "另一窗口的修改" },
        expectedUpdatedAt: mark.updatedAt,
      },
    });
    await main.getByLabel("标记名称", { exact: true }).fill("过期草稿");
    await main.getByRole("button", { name: "保存标记", exact: true }).click();
    await expect(main.locator("dialog .modal-error")).toContainText(
      "另一窗口修改",
    );
    await main.getByRole("button", { name: "取消", exact: true }).click();
    expect(
      (await api(main, "get_state")).calendarMarks.find(
        (m: any) => m.id === mark.id,
      ).title,
    ).toBe("另一窗口的修改");

    const exportPath = path.join(directory, "planning.ics");
    await api(main, "export_calendar", { path: exportPath });
    const ics = await readFile(exportPath, "utf8");
    expect(ics).toContain("DTEND;VALUE=DATE:20261008");
    expect(ics).toContain("SUMMARY:国庆休假");
    expect(ics).not.toContain("保留的待办");
    expect(ics).not.toContain("NoteDesk");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    const backupPath = path.join(directory, "calendar-backup.json");
    await api(main, "export_backup", { path: backupPath });
    const backup = JSON.parse(await readFile(backupPath, "utf8"));
    expect(backup.data.calendarMarks).toHaveLength(4);
    const legacy = { ...backup, data: { ...backup.data, schemaVersion: 1 } };
    delete legacy.data.calendarMarks;
    const legacyPath = path.join(directory, "legacy-backup.json");
    await writeFile(legacyPath, JSON.stringify(legacy));
    const preview = await api(main, "preview_backup", { path: legacyPath });
    expect(preview.schemaVersion).toBe(2);
    expect(preview.calendarMarks).toEqual([]);
    await api(main, "restore_backup", { path: legacyPath });
    expect((await api(main, "get_state")).tasks).toEqual(baseline.tasks);
    await api(main, "restore_backup", { path: backupPath });
    await stop();
    await start();
    state = await api(main, "get_state");
    expect(state.calendarMarks).toHaveLength(4);
    expect(state.tasks).toEqual(baseline.tasks);
    expect(state.releases).toEqual(baseline.releases);
    await main
      .getByRole("navigation", { name: "主要导航" })
      .getByRole("button", { name: "日历", exact: true })
      .click();
    await chooseMonth(main, 2026, 10);
    await api(main, "dispatch", {
      action: {
        type: "set_settings",
        settings: { ...state.settings, theme: "dark" },
      },
    });
    await expect(main.locator("html")).toHaveAttribute("data-theme", "dark");
    await main.screenshot({
      animations: "disabled",
      path: path.join(shots, "04-dark-calendar.png"),
    });
    await main.getByRole("button", { name: "悬浮窗", exact: true }).click();
    await expect(
      widget.getByRole("dialog", { name: "悬浮日历", exact: true }),
    ).toBeVisible();
    await widget.screenshot({
      animations: "disabled",
      path: path.join(shots, "07-dark-widget-popup.png"),
    });
    await widget.getByRole("button", { name: "日历月份", exact: true }).click();
    await expect(
      widget.getByRole("dialog", { name: "选择月份", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await widget.screenshot({
      animations: "disabled",
      path: path.join(shots, "08-dark-month-picker.png"),
    });
    await widget.keyboard.press("Escape");
    await widget.keyboard.press("Escape");
    await widget.screenshot({
      animations: "disabled",
      path: path.join(shots, "09-widget-corner-button.png"),
    });
    expect(errors).toEqual([]);
    await writeFile(
      path.join(shots, "result.json"),
      JSON.stringify(
        {
          passed: true,
          executable: exe,
          frontendErrors: errors,
          verified: [
            "official holidays and make-up days",
            "drag inclusive date ranges",
            "overlap lanes",
            "cross-month Shift selection",
            "lunar festivals and terms",
            "unknown-year disclosure",
            "year overview",
            "independent annotation search",
            "widget calendar creation and synchronization",
            "year and month grid pickers, keyboard focus and year limits",
            "corner calendar popup, outside click and layered Escape dismissal",
            "widget task draft survives calendar popup, including collapsed launch",
            "calendar popup delete undo and dark theme",
            "delete undo",
            "stale editor conflict protection",
            "standalone ICS export",
            "legacy backup compatibility",
            "SQLite restart persistence",
            "tasks and releases unchanged",
          ],
        },
        null,
        2,
      ),
    );
  } catch (e) {
    if (main! && !main.isClosed())
      await main
        .screenshot({
          animations: "disabled",
          path: path.join(shots, "failure.png"),
          timeout: 3000,
        })
        .catch(() => {});
    throw e;
  } finally {
    await stop();
  }
});
