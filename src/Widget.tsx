import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarRange,
  Check,
  CheckCheck,
  ChevronRight,
  Expand,
  Layers,
  Minus,
  Pin,
  PinOff,
  Plus,
  Rocket,
  Sun,
  X,
} from "lucide-react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useApp, desktop } from "./state";
import { dateLabel, isToday, newTask, pendingCount, sortTasks } from "./model";
import { CheckButton, IconButton, Logo, ToastView } from "./ui";
import { TaskRow } from "./pages";
const WidgetCalendar = lazy(() =>
  import("./calendar/WidgetCalendar").then((m) => ({
    default: m.WidgetCalendar,
  })),
);
export const WIDGET_CALENDAR_REQUEST = "ohmytodo-widget-calendar-request";

export function Widget() {
  const { data, day, act, notify } = useApp();
  const [mode, setMode] = useState<"today" | "release">(() => {
    const saved = localStorage.getItem("ohmytodo-widget-view");
    return saved === "release" ? saved : "today";
  });
  useEffect(() => {
    const sync = () => {
      const value = localStorage.getItem("ohmytodo-widget-view");
      if (value === "today" || value === "release") setMode(value);
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    localStorage.setItem("ohmytodo-widget-view", mode);
  }, [mode]);
  const [releaseId, setReleaseId] = useState("");
  const [featureId, setFeatureId] = useState("");
  const [pinned, setPinned] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarLoaded, setCalendarLoaded] = useState(false);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [expandedSize, setExpandedSize] = useState({ width: 380, height: 550 });
  const openCalendar = useCallback(async () => {
    try {
      if (collapsed) {
        await getCurrentWindow().setSize(
          new LogicalSize(
            expandedSize.width,
            Math.max(expandedSize.height, 520),
          ),
        );
        setCollapsed(false);
      }
      setCalendarLoaded(true);
      setCalendarOpen(true);
    } catch (e) {
      notify(String(e), undefined, true);
    }
  }, [collapsed, expandedSize, notify]);
  useEffect(() => {
    const consume = () => {
      if (!localStorage.getItem(WIDGET_CALENDAR_REQUEST)) return;
      localStorage.removeItem(WIDGET_CALENDAR_REQUEST);
      void openCalendar();
    };
    const storage = (e: StorageEvent) => {
      if (e.key === WIDGET_CALENDAR_REQUEST) consume();
    };
    consume();
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, [openCalendar]);
  const tasks = sortTasks(
    data!.tasks.filter((t) => !t.completedAt && isToday(t, day)),
  );
  const releases = data!.releases
    .filter((r) => r.status === "planned")
    .sort((a, b) => a.date.localeCompare(b.date));
  const release = releases.find((r) => r.id === releaseId) || releases[0];
  const feature = release?.features.find((f) => f.id === featureId);
  useEffect(() => {
    getCurrentWindow()
      .isAlwaysOnTop()
      .then(setPinned)
      .catch(() => {});
  }, []);
  const collapse = async () => {
    try {
      const w = getCurrentWindow();
      if (!collapsed) {
        const size = (await w.innerSize()).toLogical(await w.scaleFactor());
        setExpandedSize({ width: size.width, height: size.height });
        await w.setSize(new LogicalSize(size.width, 70));
      } else
        await w.setSize(
          new LogicalSize(expandedSize.width, expandedSize.height),
        );
      setCollapsed(!collapsed);
    } catch (e) {
      notify(String(e), undefined, true);
    }
  };
  const pin = async () => {
    try {
      await getCurrentWindow().setAlwaysOnTop(!pinned);
      setPinned(!pinned);
    } catch (e) {
      notify(String(e), undefined, true);
    }
  };
  const add = async () => {
    if (!text.trim() || adding) return;
    setAdding(true);
    if (await act({ type: "add_task", task: newTask(text.trim()) }))
      setText("");
    setAdding(false);
  };
  return (
    <>
      <div className={`widget ${collapsed ? "collapsed" : ""}`}>
        <header className="widget-titlebar" data-tauri-drag-region>
          <div className="widget-brand" data-tauri-drag-region>
            <Logo small />
            <span data-tauri-drag-region>待办</span>
          </div>
          <div className="window-controls">
            <button
              className={`icon-button widget-calendar-trigger ${calendarOpen ? "active" : ""}`}
              type="button"
              aria-label="打开日历"
              title="打开日历"
              aria-haspopup="dialog"
              aria-expanded={calendarOpen}
              onClick={() => void openCalendar()}
            >
              <CalendarRange size={16} />
            </button>
            <IconButton
              label={pinned ? "取消置顶" : "置顶悬浮窗"}
              className={pinned ? "pinned" : ""}
              onClick={() => void pin()}
            >
              {pinned ? (
                <Pin size={15} fill="currentColor" />
              ) : (
                <PinOff size={15} />
              )}
            </IconButton>
            <IconButton
              label={collapsed ? "展开悬浮窗" : "收起悬浮窗"}
              onClick={() => void collapse()}
            >
              {collapsed ? <Expand size={14} /> : <Minus size={15} />}
            </IconButton>
            <IconButton
              label="隐藏悬浮窗"
              onClick={() => void getCurrentWindow().hide()}
            >
              <X size={16} />
            </IconButton>
          </div>
        </header>
        {collapsed ? (
          <button className="collapsed-summary" onClick={() => void collapse()}>
            <Sun size={14} />
            今天还有 {tasks.length} 项待办
            <ChevronRight size={14} />
          </button>
        ) : (
          <>
            <div className="widget-tabs">
              <div className="segmented">
                <button
                  className={mode === "today" ? "active" : ""}
                  onClick={() => setMode("today")}
                >
                  <Sun size={14} />
                  今天<span>{tasks.length}</span>
                </button>
                <button
                  className={mode === "release" ? "active" : ""}
                  onClick={() => setMode("release")}
                >
                  <Rocket size={14} />
                  发版<span>{releases.length}</span>
                </button>
              </div>
            </div>
            <div className="widget-scroll">
              {mode === "today" ? (
                <>
                  {release && (
                    <button
                      className="widget-release-summary"
                      onClick={() => {
                        setMode("release");
                        setReleaseId(release.id);
                        setFeatureId("");
                      }}
                    >
                      <span>
                        <strong>
                          {release.project} · {release.version}
                        </strong>
                        <small>
                          {dateLabel(release.date, day)}发布 ·{" "}
                          {pendingCount(release)} 项必做未完成
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  )}
                  <div className="widget-task-list">
                    {tasks.slice(0, 8).map((t) => (
                      <TaskRow
                        compact
                        key={t.id}
                        task={t}
                        onOpen={(id) => void desktop("main", `task:${id}`)}
                      />
                    ))}
                  </div>
                  {tasks.length === 0 && (
                    <div className="widget-empty">
                      <CheckCheck size={30} strokeWidth={1.4} />
                      <strong>给今天，留一点从容</strong>
                      <p>想到什么，就记在下面。</p>
                    </div>
                  )}
                  {tasks.length > 8 && (
                    <button
                      className="text-button widget-more"
                      onClick={() => void desktop("main", "today")}
                    >
                      查看其他 {tasks.length - 8} 项待办
                      <ChevronRight size={14} />
                    </button>
                  )}
                </>
              ) : release ? (
                <>
                  {releases.length > 1 && (
                    <select
                      className="widget-release-select"
                      aria-label="选择发布计划"
                      value={release.id}
                      onChange={(e) => {
                        setReleaseId(e.target.value);
                        setFeatureId("");
                      }}
                    >
                      {releases.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.project} · {r.version}
                        </option>
                      ))}
                    </select>
                  )}
                  {feature ? (
                    <div className="widget-feature">
                      <button
                        className="widget-back"
                        onClick={() => setFeatureId("")}
                      >
                        <ArrowLeft size={13} />
                        {release.project} / {release.version}
                      </button>
                      <h2>{feature.title}</h2>
                      <div className="detail-tags">
                        <span
                          className={`badge ${feature.accepted ? "green" : "amber"}`}
                        >
                          {feature.accepted ? "已验收" : "待验收"}
                        </span>
                        <small className="muted">
                          {dateLabel(release.date, day)}发布
                        </small>
                      </div>
                      <div className="widget-section-title">
                        功能清单
                        <span>
                          {feature.items.filter((i) => i.done).length}/
                          {feature.items.length}
                        </span>
                      </div>
                      {feature.items.map((i) => (
                        <div className="checklist-item" key={i.id}>
                          <CheckButton
                            checked={i.done}
                            label={i.title}
                            onClick={() =>
                              void act({
                                type: "toggle_feature_item",
                                releaseId: release.id,
                                featureId: feature.id,
                                itemId: i.id,
                              })
                            }
                          />
                          <span>{i.title}</span>
                        </div>
                      ))}
                      {feature.notes && (
                        <div className="feature-notes">
                          <span>验收备注</span>
                          <p>{feature.notes}</p>
                        </div>
                      )}
                      <button
                        className={`accept-button ${feature.accepted ? "accepted" : ""}`}
                        disabled={
                          !feature.accepted &&
                          feature.items.some((i) => !i.done)
                        }
                        onClick={() =>
                          void act({
                            type: "toggle_feature_accepted",
                            releaseId: release.id,
                            featureId: feature.id,
                          })
                        }
                      >
                        <CheckCheck size={15} />
                        {feature.accepted
                          ? "已验收 · 点击重新打开"
                          : "确认验收"}
                      </button>
                    </div>
                  ) : (
                    <div className="widget-release">
                      <h2>
                        {release.project}
                        <span>{release.version}</span>
                      </h2>
                      <p className="muted">
                        {dateLabel(release.date, day)}发布
                      </p>
                      <div className="widget-section-title">
                        本次 Feature
                        <span>
                          {release.features.filter((f) => f.accepted).length}/
                          {release.features.length}
                        </span>
                      </div>
                      {release.features.map((f) => (
                        <button
                          key={f.id}
                          className="widget-feature-link"
                          onClick={() => setFeatureId(f.id)}
                        >
                          {f.accepted ? (
                            <CheckCheck size={17} className="success-color" />
                          ) : (
                            <Layers size={17} />
                          )}
                          <span>{f.title}</span>
                          <small>
                            {f.items.filter((i) => i.done).length}/
                            {f.items.length}
                          </small>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                      <div className="widget-section-title">
                        发布流程
                        <span>
                          {release.steps.filter((s) => s.done).length}/
                          {release.steps.length}
                        </span>
                      </div>
                      {release.steps.map((s) => (
                        <div className="widget-step" key={s.id}>
                          <CheckButton
                            checked={s.done}
                            square
                            label={s.title}
                            onClick={() =>
                              void act({
                                type: "toggle_release_step",
                                releaseId: release.id,
                                stepId: s.id,
                              })
                            }
                          />
                          <span>{s.title}</span>
                          {s.required && <small>必做</small>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="widget-empty">
                  <Rocket size={30} strokeWidth={1.4} />
                  <strong>安排下一次发布</strong>
                  <p>在完整视图中创建一个发布计划。</p>
                  <button
                    className="text-button"
                    onClick={() => void desktop("main", "releases")}
                  >
                    打开发布计划
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
            <footer className="widget-footer">
              {mode === "today" ? (
                <form
                  className="widget-quick-add"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void add();
                  }}
                >
                  <Plus size={18} />
                  <input
                    aria-label="悬浮窗添加待办"
                    placeholder="添加待办…"
                    value={text}
                    maxLength={200}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing && e.key === "Enter")
                        e.preventDefault();
                    }}
                  />
                  <button
                    type="submit"
                    className="icon-button"
                    aria-label="添加悬浮窗待办"
                    disabled={!text.trim() || adding}
                  >
                    <Check size={16} />
                  </button>
                  <IconButton
                    label="打开完整视图"
                    onClick={() => void desktop("main", "today")}
                  >
                    <Expand size={16} />
                  </IconButton>
                </form>
              ) : (
                <button
                  className="widget-open-release"
                  onClick={() =>
                    void desktop(
                      "main",
                      release ? `release:${release.id}` : "releases",
                    )
                  }
                >
                  在完整视图中查看
                  <Expand size={15} />
                </button>
              )}
            </footer>
          </>
        )}
        {calendarLoaded && (
          <Suspense
            fallback={
              <div className="widget-calendar-loading" role="status">
                正在打开日历…
              </div>
            }
          >
            <WidgetCalendar
              open={calendarOpen}
              onClose={() => setCalendarOpen(false)}
            />
          </Suspense>
        )}
      </div>
      {!calendarOpen && <ToastView />}
    </>
  );
}
