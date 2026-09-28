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

async function freePort() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

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

test("native desktop: tasks, widget sync, release gates, backups and restart", async () => {
  const directory = path.resolve(`output/verification/data-${Date.now()}`);
  const screenshots = path.resolve("output/verification");
  await mkdir(directory, { recursive: true });
  await mkdir(screenshots, { recursive: true });
  const exe =
    process.env.OHMYTODO_EXE ||
    path.resolve("src-tauri/target/debug/ohmytodo.exe");
  let child: ChildProcess | undefined;
  let browser: Browser | undefined;
  let main: Page;
  let widget: Page;
  const pageErrors: string[] = [];
  const start = async () => {
    const port = await freePort();
    child = spawn(exe, [], {
      cwd: path.dirname(exe),
      windowsHide: true,
      env: {
        ...process.env,
        OHMYTODO_DATA_DIR: directory,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stdout?.on("data", (s) => {
      logs += String(s);
    });
    child.stderr?.on("data", (s) => {
      logs += String(s);
    });
    await expect(async () => {
      if (child?.exitCode !== null) throw new Error(`App exited: ${logs}`);
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      expect(response.ok).toBe(true);
    }).toPass({ timeout: 30000 });
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    await expect
      .poll(
        () =>
          browser!
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
    for (const page of [main, widget])
      page.on("pageerror", (e) => pageErrors.push(e.message));
    await expect(
      main.getByRole("heading", { name: "今天", exact: true }),
    ).toBeVisible();
  };
  const stop = async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((resolve) =>
        child!.once("exit", () => resolve()),
      );
      if (main && !main.isClosed())
        await api(main, "window_action", {
          action: "quit",
          target: null,
        }).catch(() => {});
      await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      if (child.exitCode === null) {
        child.kill();
        await exited;
      }
    }
    await browser?.close().catch(() => {});
  };
  try {
    await start();
    await main.getByRole("button", { name: "体验示例", exact: true }).click();
    await expect(
      main.getByText("整理今天的工作安排", { exact: true }),
    ).toBeVisible();
    await main.screenshot({ path: path.join(screenshots, "01-today.png") });

    await main
      .getByLabel("快速添加待办", { exact: true })
      .fill("本机集成测试待办");
    await main.getByLabel("快速添加待办", { exact: true }).press("Enter");
    await expect(
      main.getByText("本机集成测试待办", { exact: true }),
    ).toBeVisible();
    await main.getByText("本机集成测试待办", { exact: true }).click();
    await main.getByRole("button", { name: "编辑详情", exact: true }).click();
    await main
      .getByLabel("备注", { exact: true })
      .fill("验证任务编辑与子任务保存");
    await main.getByLabel("子任务", { exact: true }).fill("核对本地子任务");
    await main.getByRole("button", { name: "保存修改", exact: true }).click();
    await main.getByText("本机集成测试待办", { exact: true }).click();
    await main
      .getByRole("checkbox", { name: "核对本地子任务", exact: true })
      .click();
    await expect(
      main.getByRole("checkbox", { name: "核对本地子任务", exact: true }),
    ).toBeChecked();
    await main.getByRole("button", { name: "关闭对话框", exact: true }).click();
    await main.getByText("本机集成测试待办", { exact: true }).hover();
    await main
      .getByRole("button", { name: "删除：本机集成测试待办", exact: true })
      .click();
    await expect(
      main.getByText("本机集成测试待办", { exact: true }),
    ).toHaveCount(0);
    await main.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(
      main.getByText("本机集成测试待办", { exact: true }),
    ).toBeVisible();
    await main.getByRole("button", { name: "悬浮窗", exact: true }).click();
    await expect(widget.getByLabel("悬浮窗添加待办")).toBeVisible();
    await widget.getByLabel("悬浮窗添加待办").fill("从悬浮窗添加");
    await widget.getByLabel("悬浮窗添加待办").press("Enter");
    await expect(main.getByText("从悬浮窗添加", { exact: true })).toBeVisible();
    await widget
      .getByRole("checkbox", { name: "完成：从悬浮窗添加", exact: true })
      .click();
    await expect(
      main.getByRole("checkbox", { name: "恢复：从悬浮窗添加", exact: true }),
    ).toBeChecked();
    await widget.screenshot({ path: path.join(screenshots, "02-widget.png") });
    await widget.getByRole("button", { name: "取消置顶", exact: true }).click();
    await expect(
      widget.getByRole("button", { name: "置顶悬浮窗", exact: true }),
    ).toBeVisible();
    await widget
      .getByRole("button", { name: "置顶悬浮窗", exact: true })
      .click();
    await widget
      .getByRole("button", { name: "收起悬浮窗", exact: true })
      .click();
    await expect(widget.locator(".collapsed-summary")).toBeVisible();
    await widget
      .getByRole("button", { name: "展开悬浮窗", exact: true })
      .click();
    await expect(widget.getByLabel("悬浮窗添加待办")).toBeVisible();
    await widget.locator(".widget-release-summary").click();
    await widget
      .getByRole("button", { name: "全局搜索 3/4", exact: true })
      .click();
    await expect(
      widget.getByRole("heading", { name: "全局搜索", exact: true }),
    ).toBeVisible();
    await widget.getByRole("button", { name: "打开日历", exact: true }).click();
    await expect(
      widget.getByRole("dialog", { name: "悬浮日历", exact: true }),
    ).toBeVisible();
    await widget.getByRole("button", { name: "收起日历", exact: true }).click();
    await expect(
      widget.getByRole("heading", { name: "全局搜索", exact: true }),
    ).toBeVisible();
    await widget.screenshot({
      path: path.join(screenshots, "06-widget-feature.png"),
    });
    await widget
      .getByRole("checkbox", { name: "空结果与中文输入法验收", exact: true })
      .click();
    await widget.getByRole("button", { name: "确认验收", exact: true }).click();
    const sharedRelease = (await api(main, "get_state")).releases[0];
    expect(sharedRelease.features[0].accepted).toBe(true);
    await widget
      .locator(".widget-tabs button")
      .filter({ hasText: "今天" })
      .click();
    await main.getByRole("button", { name: "收起到托盘", exact: true }).click();
    expect(child!.exitCode).toBeNull();
    await widget
      .getByRole("button", { name: "打开完整视图", exact: true })
      .click();
    await expect(
      main.getByRole("heading", { name: "今天", exact: true }),
    ).toBeVisible();

    await main.getByRole("button", { name: "新建待办", exact: true }).click();
    await main.getByLabel("待办名称", { exact: true }).fill("   ");
    await main.getByRole("button", { name: "添加待办", exact: true }).click();
    await expect(main.locator("dialog .modal-error")).toContainText(
      "名称不能为空",
    );
    await main.getByLabel("待办名称", { exact: true }).fill("每周备份测试");
    await main.getByLabel("重复", { exact: true }).selectOption("weekly");
    await main.getByRole("button", { name: "添加待办", exact: true }).click();
    await main.bringToFront();
    await main
      .getByRole("checkbox", { name: "完成：每周备份测试", exact: true })
      .evaluate((el) =>
        el.scrollIntoView({ block: "center", behavior: "instant" }),
      );
    await main
      .getByRole("checkbox", { name: "完成：每周备份测试", exact: true })
      .click();
    let state = await api(main, "get_state");
    expect(
      state.tasks.filter((t: any) => t.title === "每周备份测试"),
    ).toHaveLength(2);
    expect(
      state.tasks.find((t: any) => t.title === "每周备份测试" && !t.completedAt)
        .today,
    ).toBe(false);
    await main.getByRole("button", { name: "撤销", exact: true }).click();
    state = await api(main, "get_state");
    expect(
      state.tasks.filter((t: any) => t.title === "每周备份测试"),
    ).toHaveLength(1);

    await main.getByRole("button", { name: "新建待办", exact: true }).click();
    await main.getByRole("button", { name: "Release", exact: true }).click();
    await main.getByLabel("项目名称", { exact: true }).fill("桌面验收项目");
    await main.getByLabel("版本", { exact: true }).fill("v0.1.0");
    await main
      .getByRole("button", { name: "添加 Feature", exact: true })
      .click();
    await main
      .getByLabel("Feature 名称 1", { exact: true })
      .fill("全局搜索验收");
    await main
      .getByLabel("Feature 功能项 1", { exact: true })
      .fill("搜索关键词\n空结果提示");
    await main.screenshot({
      path: path.join(screenshots, "03-create-release.png"),
    });
    await main
      .getByRole("button", { name: "创建发布计划", exact: true })
      .click();
    await expect(
      main.getByRole("button", { name: "完成发版", exact: true }),
    ).toBeDisabled();
    await expect(
      main.getByRole("button", { name: "确认验收", exact: true }),
    ).toBeDisabled();
    await main
      .getByRole("checkbox", { name: "搜索关键词", exact: true })
      .click();
    await main
      .getByRole("checkbox", { name: "空结果提示", exact: true })
      .click();
    await main.getByRole("button", { name: "确认验收", exact: true }).click();
    for (const title of [
      "确认功能验收完成",
      "更新版本号与发布说明",
      "运行回归测试",
      "构建并验证安装包",
    ])
      await main.getByRole("checkbox", { name: title, exact: true }).click();
    await expect(
      main.getByRole("button", { name: "完成发版", exact: true }),
    ).toBeDisabled();
    await main.screenshot({
      path: path.join(screenshots, "04-release-checklist.png"),
    });
    for (const title of ["上传安装包并发布版本", "下载与启动冒烟验证"])
      await main.getByRole("checkbox", { name: title, exact: true }).click();
    await expect(
      main.getByRole("button", { name: "完成发版", exact: true }),
    ).toBeEnabled();
    await main
      .getByRole("button", { name: "编辑 Feature：全局搜索验收", exact: true })
      .click();
    await main
      .getByLabel("验收备注", { exact: true })
      .fill("追加边界情况后必须重新验收");
    await main
      .getByRole("button", { name: "保存 Feature", exact: true })
      .click();
    await expect(
      main.getByRole("button", { name: "完成发版", exact: true }),
    ).toBeDisabled();
    await main.getByRole("button", { name: "确认验收", exact: true }).click();
    await main.getByRole("button", { name: "完成发版", exact: true }).click();
    await main
      .getByRole("button", { name: "确认完成发版", exact: true })
      .click();
    await expect(main.locator(".release-title .badge")).toHaveText("已发布");
    await expect(
      main.getByRole("checkbox", { name: "搜索关键词", exact: true }),
    ).toBeDisabled();

    await main.getByRole("button", { name: "设置", exact: true }).click();
    await main.getByLabel("界面主题", { exact: true }).selectOption("dark");
    await expect(main.locator("html")).toHaveAttribute("data-theme", "dark");
    await main.getByRole("button", { name: "新建模板", exact: true }).click();
    await main.getByLabel("模板名称", { exact: true }).fill("简化发布");
    await main
      .getByRole("button", { name: "添加流程步骤", exact: true })
      .click();
    await main.getByLabel("流程步骤 1", { exact: true }).fill("准备发布说明");
    await main.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(main.getByText("简化发布", { exact: true })).toBeVisible();
    state = await api(main, "get_state");
    expect(
      state.releases.find((r: any) => r.project === "桌面验收项目").steps,
    ).toHaveLength(6);

    const backupPath = path.join(directory, "manual-backup.json");
    await api(main, "export_backup", { path: backupPath });
    const backup = JSON.parse(await readFile(backupPath, "utf8"));
    expect(
      backup.data.tasks.some((t: any) => t.title === "本机集成测试待办"),
    ).toBe(true);
    const taskId = backup.data.tasks.find(
      (t: any) => t.title === "本机集成测试待办",
    ).id;
    await api(main, "dispatch", {
      action: { type: "delete_task", id: taskId },
    });
    await api(main, "restore_backup", { path: backupPath });
    state = await api(main, "get_state");
    expect(state.tasks.some((t: any) => t.id === taskId)).toBe(true);
    const invalidPath = path.join(directory, "invalid.json");
    await writeFile(invalidPath, JSON.stringify({ ...backup, version: 999 }));
    await expect(
      api(main, "preview_backup", { path: invalidPath }),
    ).rejects.toBeTruthy();
    expect((await api(main, "get_state")).revision).toBe(state.revision);
    await stop();
    await start();
    state = await api(main, "get_state");
    expect(state.tasks.some((t: any) => t.id === taskId)).toBe(true);
    expect(state.settings.theme).toBe("dark");
    expect(
      state.releases.find((r: any) => r.project === "桌面验收项目").status,
    ).toBe("released");
    await main.screenshot({
      path: path.join(screenshots, "05-dark-theme.png"),
    });
    const info = await api(main, "get_info");
    expect(info.dataPath).toBe(directory);
    expect(info.warnings).toEqual([]);
    expect(pageErrors).toEqual([]);
    await writeFile(
      path.join(screenshots, "result.json"),
      JSON.stringify(
        {
          passed: true,
          executable: exe,
          dataDirectory: directory,
          frontendErrors: pageErrors,
          screenshots: 6,
          verified: [
            "task CRUD and undo",
            "subtask persistence",
            "repeat generation and undo",
            "native widget pin/collapse",
            "two-window synchronization",
            "widget feature acceptance",
            "tray hide/reopen",
            "release creation and completion gates",
            "feature edits invalidate acceptance",
            "released plan lock",
            "independent workflow templates",
            "backup export and restore",
            "invalid backup rejection",
            "SQLite restart persistence",
            "theme persistence",
            "shortcut registration",
          ],
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (main! && !main.isClosed())
      await main
        .screenshot({
          path: path.join(screenshots, "failure.png"),
          timeout: 3000,
        })
        .catch(() => {});
    throw error;
  } finally {
    await stop();
  }
});
