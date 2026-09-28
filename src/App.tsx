import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  CheckCheck,
  Folder,
  Inbox,
  LoaderCircle,
  PanelTop,
  Plus,
  Rocket,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { useApp, desktop } from "./state";
import { isToday } from "./model";
import type { View } from "./model";
import { IconButton, Logo, Modal, Titlebar, ToastView } from "./ui";
import { CreateDialog, FeatureForm, ReleaseForm, TaskForm } from "./forms";
import type { CreateKind } from "./forms";
import { ReleasePage, ReleasesPage, TaskDetails, TaskPage } from "./pages";
import { SettingsPage } from "./SettingsPage";
import { Widget, WIDGET_CALENDAR_REQUEST } from "./Widget";
const CalendarPage = lazy(() =>
  import("./calendar/Calendar").then((m) => ({ default: m.CalendarPage })),
);

type Editor =
  | { kind: "create"; tab: CreateKind }
  | { kind: "task"; id: string; edit: boolean }
  | { kind: "release"; id: string }
  | { kind: "feature"; releaseId: string; featureId?: string }
  | null;
export function App() {
  const { data, fatal, busy, day, notify } = useApp();
  const [view, setView] = useState<View>("today");
  const [editor, setEditor] = useState<Editor>(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const isWidget =
    new URLSearchParams(location.search).get("view") === "widget";
  useEffect(() => {
    if (!isTauri() || isWidget) return;
    let disposed = false;
    const unsubs: (() => void)[] = [];
    const subscribe = async () => {
      for (const [name, handler] of [
        ["quick-add", () => setEditor({ kind: "create", tab: "task" })],
        [
          "navigate",
          (event: { payload: unknown }) => {
            const target = String(event.payload);
            setSearch("");
            if (target.startsWith("task:")) {
              setView("today");
              setEditor({ kind: "task", id: target.slice(5), edit: false });
            } else {
              setEditor(null);
              setView(target as View);
            }
          },
        ],
      ] as const) {
        const unsub = await listen(name, handler);
        if (disposed) unsub();
        else unsubs.push(unsub);
      }
    };
    void subscribe().catch((e) => notify(String(e), undefined, true));
    return () => {
      disposed = true;
      unsubs.forEach((fn) => fn());
    };
  }, [isWidget, notify]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.isComposing || !e.ctrlKey || e.altKey || e.metaKey || isWidget)
        return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!document.querySelector("dialog[open]")) {
          if (view === "calendar")
            window.dispatchEvent(new Event("calendar-search"));
          else searchRef.current?.focus();
        }
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (!document.querySelector("dialog[open]")) {
          if (view === "calendar")
            window.dispatchEvent(new Event("calendar-new-mark"));
          else setEditor({ kind: "create", tab: "task" });
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [isWidget, view]);
  if (!data)
    return (
      <div className="startup">
        <Logo />
        <h2>待办</h2>
        {fatal ? (
          <>
            <p role="alert">{fatal}</p>
            <button
              className="button secondary"
              onClick={() => location.reload()}
            >
              重新加载
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spinner" size={20} />
            <p>准备好，开始今天。</p>
          </>
        )}
      </div>
    );
  if (isWidget) return <Widget />;
  const navigate = (target: View) => {
    setView(target);
    setSearch("");
  };
  const releaseId = view.startsWith("release:") ? view.slice(8) : "";
  const currentTask =
    editor?.kind === "task"
      ? data.tasks.find((t) => t.id === editor.id)
      : undefined;
  const currentRelease =
    editor?.kind === "release"
      ? data.releases.find((r) => r.id === editor.id)
      : undefined;
  const editedFeature =
    editor?.kind === "feature"
      ? data.releases
          .find((r) => r.id === editor.releaseId)
          ?.features.find((f) => f.id === editor.featureId)
      : undefined;
  const navigation = [
    {
      id: "today",
      name: "今天",
      icon: Sun,
      count: data.tasks.filter((t) => !t.completedAt && isToday(t, day)).length,
    },
    {
      id: "inbox",
      name: "收集箱",
      icon: Inbox,
      count: data.tasks.filter((t) => !t.completedAt && !t.today && !t.dueDate)
        .length,
    },
    {
      id: "planned",
      name: "计划",
      icon: CalendarDays,
      count: data.tasks.filter((t) => !t.completedAt && t.dueDate).length,
    },
    {
      id: "completed",
      name: "已完成",
      icon: CheckCheck,
      count: data.tasks.filter((t) => t.completedAt).length,
    },
  ];
  return (
    <div className="app-shell">
      <Titlebar />
      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-label">我的待办</div>
          <nav aria-label="主要导航">
            {navigation.map((n) => (
              <button
                key={n.id}
                className={`nav-item ${view === n.id ? "active" : ""}`}
                onClick={() => navigate(n.id as View)}
              >
                <n.icon size={19} strokeWidth={1.7} />
                <span>{n.name}</span>
                {n.count > 0 && <span className="nav-count">{n.count}</span>}
              </button>
            ))}
            <div className="nav-separator" />
            <button
              className={`nav-item ${view === "calendar" ? "active" : ""}`}
              onClick={() => navigate("calendar")}
            >
              <CalendarRange size={19} strokeWidth={1.7} />
              <span>日历</span>
            </button>
            <button
              className={`nav-item ${view === "releases" || releaseId ? "active" : ""}`}
              onClick={() => navigate("releases")}
            >
              <Rocket size={19} strokeWidth={1.7} />
              <span>发布计划</span>
              {data.releases.filter((r) => r.status === "planned").length >
                0 && (
                <span className="nav-count">
                  {data.releases.filter((r) => r.status === "planned").length}
                </span>
              )}
            </button>
            <div className="sidebar-label category-label">分类</div>
            {[
              ["work", "工作"],
              ["life", "生活"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`nav-item ${view === id ? "active" : ""}`}
                onClick={() => navigate(id as View)}
              >
                <Folder size={18} strokeWidth={1.7} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button
              className={`nav-item ${view === "settings" ? "active" : ""}`}
              onClick={() => navigate("settings")}
            >
              <Settings size={18} strokeWidth={1.7} />
              <span>设置</span>
            </button>
            <div className="save-status" title="任务数据自动保存在这台电脑">
              <span className={`status-dot ${busy ? "saving" : ""}`} />
              {busy ? "正在保存…" : "已保存到本机"}
            </div>
          </div>
        </aside>
        <main className="main">
          <div className="toolbar">
            {view === "calendar" ? (
              <div className="cal-toolbar-identity">
                <CalendarRange size={17} />
                <span>独立日历</span>
                <small>自由标记，安心规划</small>
              </div>
            ) : (
              <div className="search-box">
                <Search size={16} />
                <input
                  ref={searchRef}
                  aria-label="搜索待办和发布计划"
                  placeholder="搜索待办、版本或功能"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setView(e.target.value ? "search" : "today");
                  }}
                />
                {search ? (
                  <IconButton
                    label="清空搜索"
                    onClick={() => navigate("today")}
                  >
                    <X size={14} />
                  </IconButton>
                ) : (
                  <kbd>Ctrl K</kbd>
                )}
              </div>
            )}
            <div className="toolbar-actions">
              <button
                className="button ghost widget-launch"
                onClick={() => {
                  void desktop("widget")
                    .then(() => {
                      if (view === "calendar")
                        localStorage.setItem(
                          WIDGET_CALENDAR_REQUEST,
                          String(Date.now()),
                        );
                    })
                    .catch((e) => notify(String(e), undefined, true));
                }}
              >
                <PanelTop size={17} />
                悬浮窗
              </button>
              {view !== "calendar" && (
                <button
                  className="button primary small"
                  onClick={() => setEditor({ kind: "create", tab: "task" })}
                >
                  <Plus size={16} />
                  新建待办
                </button>
              )}
            </div>
          </div>
          <div className="page-scroll" key={view}>
            {view === "calendar" ? (
              <Suspense
                fallback={
                  <div className="empty-state">
                    <LoaderCircle className="spinner" size={22} />
                    <p>正在打开日历…</p>
                  </div>
                }
              >
                <CalendarPage />
              </Suspense>
            ) : view === "settings" ? (
              <SettingsPage />
            ) : view === "releases" ? (
              <ReleasesPage
                onOpen={(id) => navigate(`release:${id}`)}
                onCreate={() => setEditor({ kind: "create", tab: "release" })}
              />
            ) : releaseId ? (
              <ReleasePage
                key={releaseId}
                id={releaseId}
                onBack={() => navigate("releases")}
                onEdit={() => setEditor({ kind: "release", id: releaseId })}
                onFeature={(feature) =>
                  setEditor({
                    kind: "feature",
                    releaseId,
                    featureId: feature?.id,
                  })
                }
              />
            ) : (
              <TaskPage
                view={view}
                search={search}
                onOpen={(id) => setEditor({ kind: "task", id, edit: false })}
                onCreate={() => setEditor({ kind: "create", tab: "task" })}
                onRelease={(id) => navigate(`release:${id}`)}
              />
            )}
          </div>
        </main>
      </div>
      {editor?.kind === "create" && (
        <CreateDialog
          kind={editor.tab}
          onClose={() => setEditor(null)}
          onCreated={(id) => navigate(`release:${id}`)}
          initialToday={view === "today"}
        />
      )}
      {editor?.kind === "task" &&
        (editor.edit && currentTask ? (
          <Modal title="编辑待办" onClose={() => setEditor(null)}>
            <TaskForm task={currentTask} onClose={() => setEditor(null)} />
          </Modal>
        ) : (
          <TaskDetails
            id={editor.id}
            onClose={() => setEditor(null)}
            onEdit={() => setEditor({ ...editor, edit: true })}
          />
        ))}
      {editor?.kind === "release" && currentRelease && (
        <Modal title="编辑发布计划" wide onClose={() => setEditor(null)}>
          <ReleaseForm
            release={currentRelease}
            onClose={() => setEditor(null)}
            onCreated={(id) => navigate(`release:${id}`)}
          />
        </Modal>
      )}
      {editor?.kind === "feature" && (
        <Modal
          title={editedFeature ? "编辑 Feature" : "添加 Feature"}
          onClose={() => setEditor(null)}
        >
          <FeatureForm
            releaseId={editor.releaseId}
            feature={editedFeature}
            onClose={() => setEditor(null)}
            onSwitch={() => setEditor({ kind: "create", tab: "release" })}
          />
        </Modal>
      )}
      <ToastView />
    </div>
  );
}
