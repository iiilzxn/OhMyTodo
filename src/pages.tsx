import { useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Folder,
  Inbox,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  Repeat2,
  Rocket,
  Search,
  Star,
  Sun,
  Trash2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "./state";
import {
  addDays,
  dateLabel,
  featurePending,
  isToday,
  localDate,
  newTask,
  pendingCount,
  releaseReady,
  sortTasks,
} from "./model";
import type { AppData, Feature, Release, Task, View } from "./model";
import {
  Breadcrumb,
  CheckButton,
  Empty,
  IconButton,
  Modal,
  SectionLabel,
} from "./ui";
import { ConfirmDialog } from "./forms";

export function TaskRow({
  task,
  onOpen,
  compact = false,
}: {
  task: Task;
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  const { act, notify, day } = useApp();
  const toggle = async () => {
    if (await act({ type: "toggle_task", id: task.id }))
      notify(
        task.completedAt
          ? "已恢复待办"
          : task.repeat !== "none"
            ? "已完成，下一次已安排"
            : "完成了一件事",
        () => act({ type: "toggle_task", id: task.id }),
      );
  };
  return (
    <div
      className={`task-row ${task.completedAt ? "done" : ""} ${compact ? "compact" : ""}`}
      data-testid="task-row"
    >
      <CheckButton
        checked={Boolean(task.completedAt)}
        label={`${task.completedAt ? "恢复" : "完成"}：${task.title}`}
        onClick={() => void toggle()}
      />
      <button className="task-content" onClick={() => onOpen(task.id)}>
        <span className="task-title">{task.title}</span>
        {!compact && task.notes && (
          <span className="task-description">{task.notes}</span>
        )}
      </button>
      <div className="task-meta">
        {task.repeat !== "none" && (
          <span title={task.repeat === "daily" ? "每天重复" : "每周重复"}>
            <Repeat2 size={14} />
          </span>
        )}
        {task.items.length > 0 && (
          <span title="子任务进度">
            <ListChecks size={14} />
            {task.items.filter((i) => i.done).length}/{task.items.length}
          </span>
        )}
        {task.dueDate && (
          <span
            className={!task.completedAt && task.dueDate < day ? "overdue" : ""}
          >
            <CalendarDays size={13} />
            {dateLabel(task.dueDate, day)}
            {task.dueTime && ` ${task.dueTime}`}
          </span>
        )}
      </div>
      {!task.completedAt && (
        <IconButton
          label={`${task.starred ? "取消重要" : "标记重要"}：${task.title}`}
          className={`star-button ${task.starred ? "starred" : "row-action"}`}
          onClick={() =>
            void act({
              type: "update_task",
              id: task.id,
              patch: { starred: !task.starred },
            })
          }
        >
          <Star size={16} fill={task.starred ? "currentColor" : "none"} />
        </IconButton>
      )}
      {!compact && (
        <IconButton
          label={`删除：${task.title}`}
          className="row-action"
          onClick={async () => {
            if (await act({ type: "delete_task", id: task.id }))
              notify("待办已删除", () => act({ type: "add_task", task }));
          }}
        >
          <Trash2 size={15} />
        </IconButton>
      )}
    </div>
  );
}

export function TaskDetails({
  id,
  onClose,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { data, act, day } = useApp();
  const task = data!.tasks.find((t) => t.id === id);
  if (!task)
    return (
      <Modal title="待办已删除" onClose={onClose}>
        <div className="form-body">这项待办已在另一个窗口中删除。</div>
      </Modal>
    );
  return (
    <Modal title={task.title} onClose={onClose}>
      <div className="form-body task-detail">
        <div className="detail-tags">
          <span className="badge neutral">
            <Folder size={13} />
            {task.category === "work" ? "工作" : "生活"}
          </span>
          {task.today && (
            <span className="badge blue">
              <Sun size={13} />
              今天
            </span>
          )}
          {task.starred && (
            <span className="badge amber">
              <Star size={12} />
              重要
            </span>
          )}
          {task.dueDate && (
            <span className="badge neutral">
              <CalendarDays size={13} />
              {dateLabel(task.dueDate, day)} {task.dueTime}
            </span>
          )}
          {task.repeat !== "none" && (
            <span className="badge neutral">
              <Repeat2 size={13} />
              {task.repeat === "daily" ? "每天" : "每周"}
            </span>
          )}
        </div>
        {task.items.length > 0 && (
          <div>
            <SectionLabel
              count={`${task.items.filter((i) => i.done).length}/${task.items.length}`}
            >
              子任务
            </SectionLabel>
            {task.items.map((i) => (
              <div className="checklist-item" key={i.id}>
                <CheckButton
                  checked={i.done}
                  label={i.title}
                  onClick={() =>
                    void act({
                      type: "toggle_task_item",
                      id: task.id,
                      itemId: i.id,
                    })
                  }
                />
                <span className={i.done ? "muted" : ""}>{i.title}</span>
              </div>
            ))}
          </div>
        )}
        {task.notes ? (
          <div>
            <SectionLabel>备注</SectionLabel>
            <p className="notes-text">{task.notes}</p>
          </div>
        ) : (
          task.items.length === 0 && (
            <p className="muted">
              把注意力放在这件事上。需要时可以补充备注和子任务。
            </p>
          )
        )}
      </div>
      <div className="form-footer">
        <button className="button secondary" onClick={onEdit}>
          <Pencil size={15} />
          编辑详情
        </button>
        <button
          className="button primary"
          onClick={async () => {
            if (await act({ type: "toggle_task", id: task.id })) onClose();
          }}
        >
          <Check size={16} />
          {task.completedAt ? "重新打开待办" : "完成待办"}
        </button>
      </div>
    </Modal>
  );
}

const viewInfo: Record<
  string,
  { title: string; subtitle: string; icon: typeof Sun }
> = {
  today: { title: "今天", subtitle: "留一点空间，专注眼前。", icon: Sun },
  inbox: { title: "收集箱", subtitle: "先记下来，再慢慢安排。", icon: Inbox },
  planned: {
    title: "计划",
    subtitle: "让每件事，都有合适的时间。",
    icon: CalendarDays,
  },
  completed: {
    title: "已完成",
    subtitle: "每一小步，都值得被看见。",
    icon: CheckCheck,
  },
  work: { title: "工作", subtitle: "有条不紊地，推进手头的事。", icon: Folder },
  life: {
    title: "生活",
    subtitle: "也为生活里的小事，留一点位置。",
    icon: Folder,
  },
  search: { title: "搜索", subtitle: "找回那件记下来的事。", icon: Search },
};

export function TaskPage({
  view,
  search,
  onOpen,
  onCreate,
  onRelease,
}: {
  view: View;
  search: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onRelease: (id: string) => void;
}) {
  const { data, day, act, notify, accept } = useApp();
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(true);
  const info = viewInfo[view] || viewInfo.today;
  const query = search.trim().toLocaleLowerCase();
  const matches = (task: Task) =>
    `${task.title} ${task.notes} ${task.items.map((i) => i.title).join(" ")}`
      .toLocaleLowerCase()
      .includes(query);
  const inView = (task: Task) =>
    view === "today"
      ? isToday(task, day)
      : view === "inbox"
        ? !task.today && !task.dueDate
        : view === "planned"
          ? Boolean(task.dueDate)
          : view === "work" || view === "life"
            ? task.category === view
            : true;
  const pending = sortTasks(
    data!.tasks.filter((t) => !t.completedAt && inView(t) && matches(t)),
  );
  const done = data!.tasks
    .filter(
      (t) =>
        t.completedAt &&
        matches(t) &&
        (view === "today"
          ? localDate(new Date(t.completedAt)) === day
          : inView(t)),
    )
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  const matchingReleases =
    view === "search"
      ? data!.releases.filter((r) =>
          `${r.project} ${r.version} ${r.notes} ${r.features.map((f) => `${f.title} ${f.items.map((i) => i.title).join(" ")}`).join(" ")}`
            .toLocaleLowerCase()
            .includes(query),
        )
      : [];
  const dueReleases =
    view === "today"
      ? data!.releases
          .filter((r) => r.status === "planned" && r.date <= addDays(day, 2))
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];
  const submit = async () => {
    if (!text.trim() || adding) return;
    setAdding(true);
    const task = newTask(text.trim(), {
      today: view === "today",
      category: view === "life" ? "life" : "work",
      dueDate: view === "planned" ? day : null,
    });
    if (await act({ type: "add_task", task })) {
      setText("");
      notify("已添加待办");
    }
    setAdding(false);
  };
  const groups =
    view === "planned"
      ? [...new Set(pending.map((t) => t.dueDate!))].sort().map((date) => ({
          label:
            date < day
              ? `${dateLabel(date, day)} · 已逾期`
              : dateLabel(date, day),
          tasks: pending.filter((t) => t.dueDate === date),
        }))
      : [{ label: "", tasks: pending }];
  const empty =
    (view === "completed"
      ? done.length === 0
      : pending.length === 0 && done.length === 0) &&
    matchingReleases.length === 0;
  return (
    <div className="page task-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">
            {view === "today"
              ? new Date(`${day}T12:00:00`).toLocaleDateString("zh-CN", {
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                })
              : "我的待办"}
          </div>
          <h1>{info.title}</h1>
          <p>{view === "search" ? `“${search}” 的搜索结果` : info.subtitle}</p>
        </div>
        <span className="page-symbol">
          <info.icon size={28} strokeWidth={1.5} />
        </span>
      </header>
      {view !== "completed" && view !== "search" && (
        <form
          className="quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Plus size={20} />
          <input
            aria-label="快速添加待办"
            placeholder="添加一件要做的事…"
            maxLength={200}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing && e.key === "Enter")
                e.preventDefault();
            }}
          />
          <button
            type="submit"
            disabled={!text.trim() || adding}
            aria-label="添加快速待办"
          >
            <span>添加</span>
            <kbd>↵</kbd>
          </button>
        </form>
      )}
      {dueReleases.length > 0 && (
        <div className="upcoming-strip">
          {dueReleases.slice(0, 2).map((r) => (
            <button
              className="release-reminder"
              key={r.id}
              onClick={() => onRelease(r.id)}
            >
              <span className="release-reminder-icon">
                <Rocket size={17} />
              </span>
              <span>
                <strong>
                  {r.project} <span className="muted">{r.version}</span>
                </strong>
                <small>
                  {dateLabel(r.date, day)}发布 · {featurePending(r)} 项待验收 ·{" "}
                  {pendingCount(r)} 项必做未完成
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      )}
      {!empty && view !== "completed" && pending.length > 0 && (
        <div className="task-groups">
          {groups.map((group) => (
            <section key={group.label}>
              <SectionLabel count={group.tasks.length}>
                {group.label || (view === "search" ? "待办" : "待完成")}
              </SectionLabel>
              {group.tasks.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={onOpen} />
              ))}
            </section>
          ))}
        </div>
      )}
      {done.length > 0 && (
        <section className="completed-section">
          <button
            className="completed-toggle"
            onClick={() => setShowDone(!showDone)}
          >
            <ChevronDown
              size={15}
              className={showDone || view === "completed" ? "" : "closed"}
            />
            已完成<span>{done.length}</span>
          </button>
          {(showDone || view === "completed") &&
            done.map((task) => (
              <TaskRow key={task.id} task={task} onOpen={onOpen} />
            ))}
        </section>
      )}
      {matchingReleases.length > 0 && (
        <section>
          <SectionLabel count={matchingReleases.length}>发布计划</SectionLabel>
          {matchingReleases.map((r) => (
            <ReleaseCard key={r.id} release={r} onOpen={onRelease} />
          ))}
        </section>
      )}
      {empty && (
        <Empty
          icon={<info.icon size={32} strokeWidth={1.4} />}
          title={
            view === "search"
              ? "没有找到匹配的内容"
              : view === "completed"
                ? "完成的事，会留在这里"
                : view === "today"
                  ? "今天，还有很多可能"
                  : "这里暂时很安静"
          }
          text={
            view === "search"
              ? "试试任务名称、备注或 Feature 里的关键词。"
              : view === "completed"
                ? "做完一件事，轻轻打个勾。"
                : "从一件小事开始，把脑海里的想法记下来。"
          }
        >
          {view !== "completed" && view !== "search" && (
            <button className="button primary" onClick={onCreate}>
              <Plus size={16} />
              新建待办
            </button>
          )}
          {data!.tasks.length === 0 &&
            data!.releases.length === 0 &&
            view !== "search" && (
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    accept(await invoke<AppData>("add_examples"));
                    notify("已添加体验示例，可随时编辑和删除");
                  } catch (e) {
                    notify(String(e), undefined, true);
                  }
                }}
              >
                体验示例
              </button>
            )}
        </Empty>
      )}
      {view === "today" && pending.length === 0 && done.length > 0 && (
        <div className="all-done">
          <CheckCheck size={18} />
          <span>今天安排的事，都完成了。给自己一点休息时间。</span>
        </div>
      )}
    </div>
  );
}

export function ReleaseCard({
  release: r,
  onOpen,
}: {
  release: Release;
  onOpen: (id: string) => void;
}) {
  const { day } = useApp();
  const complete = r.steps.filter((s) => s.done).length;
  return (
    <button
      className="release-card"
      onClick={() => onOpen(r.id)}
      data-testid="release-card"
    >
      <div className="release-card-top">
        <span
          className={`project-icon ${r.status === "released" ? "green" : ""}`}
        >
          {r.status === "released" ? (
            <CheckCheck size={21} />
          ) : (
            <Rocket size={21} />
          )}
        </span>
        <div>
          <h3>
            {r.project}
            <span>{r.version}</span>
          </h3>
          <p>
            {dateLabel(r.date, day)}发布
            {r.status === "planned" && r.date < day ? " · 计划已逾期" : ""}
          </p>
        </div>
        <span
          className={`badge ${r.status === "released" ? "green" : r.date === day ? "blue" : "neutral"}`}
        >
          {r.status === "released"
            ? "已发布"
            : r.date === day
              ? "今天发布"
              : "计划中"}
        </span>
        <ChevronRight size={17} />
      </div>
      <div className="release-card-bottom">
        <span>
          <Layers size={14} />
          {r.features.filter((f) => f.accepted).length}/{r.features.length}{" "}
          Feature 已验收
        </span>
        <span>
          <ListChecks size={14} />
          {complete}/{r.steps.length} 流程已完成
        </span>
        <div className="thin-progress">
          <i
            style={{
              width: `${r.steps.length ? (complete / r.steps.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
    </button>
  );
}

export function ReleasesPage({
  onOpen,
  onCreate,
}: {
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const { data } = useApp();
  const [tab, setTab] = useState("planned");
  const releases = data!.releases
    .filter((r) => tab === "all" || r.status === tab)
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">从想法，到交付</div>
          <h1>发布计划</h1>
          <p>看清本次功能，记住每一步发布流程。</p>
        </div>
        <button className="button primary" onClick={onCreate}>
          <Plus size={16} />
          新建发布计划
        </button>
      </header>
      <div className="filter-tabs">
        {[
          ["planned", "进行中"],
          ["released", "已发布"],
          ["all", "全部"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            <span>
              {
                data!.releases.filter((r) => id === "all" || r.status === id)
                  .length
              }
            </span>
          </button>
        ))}
      </div>
      <div className="release-list">
        {releases.map((r) => (
          <ReleaseCard key={r.id} release={r} onOpen={onOpen} />
        ))}
      </div>
      {releases.length === 0 && (
        <Empty
          icon={<Rocket size={32} strokeWidth={1.4} />}
          title={
            tab === "released"
              ? "期待你的第一次发布"
              : "为下一次发布，留一份计划"
          }
          text="版本、Feature、验收和发布流程，放在一起就清楚了。"
        >
          <button className="button primary" onClick={onCreate}>
            <Plus size={16} />
            创建发布计划
          </button>
        </Empty>
      )}
    </div>
  );
}

export function ReleasePage({
  id,
  onBack,
  onEdit,
  onFeature,
}: {
  id: string;
  onBack: () => void;
  onEdit: () => void;
  onFeature: (feature?: Feature) => void;
}) {
  const { data, day, act, notify } = useApp();
  const r = data!.releases.find((r) => r.id === id);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<"finish" | "delete" | "reopen" | null>(
    null,
  );
  if (!r)
    return (
      <div className="page">
        <Empty
          icon={<Folder size={30} />}
          title="这个发布计划已删除"
          text="返回列表，查看其他计划。"
        >
          <button className="button secondary" onClick={onBack}>
            返回发布计划
          </button>
        </Empty>
      </div>
    );
  const readonly = r.status === "released";
  const ready = releaseReady(r);
  const remaining = pendingCount(r);
  const pendingFeatures = featurePending(r);
  return (
    <div className="page release-detail">
      <Breadcrumb onBack={onBack}>{r.version}</Breadcrumb>
      <header className="page-heading">
        <div>
          <div className="release-title">
            <h1>
              {r.project}
              <span>{r.version}</span>
            </h1>
            <span className={`badge ${readonly ? "green" : "blue"}`}>
              {readonly ? "已发布" : r.date === day ? "今天发布" : "计划中"}
            </span>
          </div>
          <p>
            <CalendarDays size={14} />
            {dateLabel(r.date, day)}发布<span className="dot-separator">·</span>
            {readonly
              ? "这次交付，已经完成。"
              : pendingFeatures
                ? `${pendingFeatures} 项 Feature 等待验收`
                : "功能已验收，继续推进发布流程"}
          </p>
        </div>
        <div className="heading-actions">
          {!readonly && (
            <IconButton label="编辑发布计划" onClick={onEdit}>
              <Pencil size={17} />
            </IconButton>
          )}
          <IconButton label="删除发布计划" onClick={() => setConfirm("delete")}>
            <Trash2 size={17} />
          </IconButton>
        </div>
      </header>
      {r.notes && <div className="release-note">{r.notes}</div>}
      <div className="release-columns">
        <section className="feature-panel">
          <div className="panel-heading">
            <h2>本次 Feature</h2>
            <span className="muted">
              {r.features.length - pendingFeatures}/{r.features.length} 已验收
            </span>
          </div>
          <div className="feature-list">
            {r.features.map((f, index) => {
              const isOpen =
                expanded.includes(f.id) ||
                (expanded.length === 0 && index === 0);
              const allDone = f.items.every((i) => i.done);
              return (
                <article
                  className={`feature-entry ${f.accepted ? "accepted" : ""}`}
                  key={f.id}
                >
                  <div className="feature-entry-header">
                    <button
                      onClick={() =>
                        setExpanded(
                          isOpen
                            ? expanded
                                .filter((x) => x !== f.id)
                                .concat(`closed:${f.id}`)
                            : expanded
                                .filter((x) => x !== `closed:${f.id}`)
                                .concat(f.id),
                        )
                      }
                      aria-expanded={isOpen}
                    >
                      <ChevronRight
                        size={15}
                        className={isOpen ? "open" : ""}
                      />
                      {f.accepted ? (
                        <span className="accepted-icon">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      ) : (
                        <Layers size={16} className="muted" />
                      )}
                      <strong>{f.title}</strong>
                      <span className="muted">
                        {f.items.filter((i) => i.done).length}/{f.items.length}
                      </span>
                    </button>
                    {!readonly && (
                      <IconButton
                        label={`编辑 Feature：${f.title}`}
                        onClick={() => onFeature(f)}
                      >
                        <Pencil size={14} />
                      </IconButton>
                    )}
                  </div>
                  {isOpen && (
                    <div className="feature-content">
                      {f.items.length === 0 && (
                        <p className="muted small-text">
                          按你的验收标准，确认这个 Feature 已完成。
                        </p>
                      )}
                      {f.items.map((item) => (
                        <div key={item.id} className="checklist-item">
                          <CheckButton
                            checked={item.done}
                            label={item.title}
                            disabled={readonly}
                            onClick={() =>
                              void act({
                                type: "toggle_feature_item",
                                releaseId: r.id,
                                featureId: f.id,
                                itemId: item.id,
                              })
                            }
                          />
                          <span className={item.done ? "muted" : ""}>
                            {item.title}
                          </span>
                        </div>
                      ))}
                      {f.notes && (
                        <div className="feature-notes">
                          <span>验收备注</span>
                          <p>{f.notes}</p>
                        </div>
                      )}
                      <div className="feature-footer">
                        <button
                          className={`accept-button ${f.accepted ? "accepted" : ""}`}
                          disabled={readonly || (!f.accepted && !allDone)}
                          title={!allDone ? "先完成全部功能子项" : undefined}
                          onClick={() =>
                            void act({
                              type: "toggle_feature_accepted",
                              releaseId: r.id,
                              featureId: f.id,
                            })
                          }
                        >
                          <CheckCheck size={15} />
                          {f.accepted ? "已验收" : "确认验收"}
                        </button>
                        {!readonly && (
                          <IconButton
                            label={`删除 Feature：${f.title}`}
                            onClick={async () => {
                              if (
                                await act({
                                  type: "remove_feature",
                                  releaseId: r.id,
                                  featureId: f.id,
                                })
                              )
                                notify("Feature 已删除", () =>
                                  act({
                                    type: "upsert_feature",
                                    releaseId: r.id,
                                    feature: { ...f, accepted: false },
                                  }),
                                );
                            }}
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {!readonly && (
            <button className="add-feature-button" onClick={() => onFeature()}>
              <Plus size={16} />
              添加 Feature
            </button>
          )}
          {r.features.length === 0 && (
            <p className="panel-empty">
              可以添加新功能，也可以只用检查清单管理一次发布。
            </p>
          )}
        </section>
        <section className="workflow-panel">
          <div className="panel-heading">
            <h2>发版检查清单</h2>
            <span className="muted">
              {r.steps.filter((s) => s.done).length}/{r.steps.length}
            </span>
          </div>
          <div className="workflow-list">
            {r.steps.map((s, index) => (
              <div
                key={s.id}
                className={`workflow-row ${s.done ? "done" : ""} ${r.steps.find((x) => !x.done)?.id === s.id && !readonly ? "next-step" : ""}`}
              >
                <CheckButton
                  square
                  checked={s.done}
                  label={s.title}
                  disabled={readonly}
                  onClick={() =>
                    void act({
                      type: "toggle_release_step",
                      releaseId: r.id,
                      stepId: s.id,
                    })
                  }
                />
                <span className="step-number">{index + 1}.</span>
                <span className="step-title">{s.title}</span>
                {s.required && <span className="required-tag">必做</span>}
              </div>
            ))}
          </div>
          {r.steps.length === 0 && (
            <p className="panel-empty">
              还没有发布流程。编辑计划即可添加步骤。
            </p>
          )}
          {!readonly && (
            <button className="workflow-edit" onClick={onEdit}>
              <Pencil size={13} />
              编辑流程
            </button>
          )}
        </section>
      </div>
      <div className="release-footer">
        <div className={`release-summary ${ready ? "ready" : ""}`}>
          <span className="status-dot" />
          {readonly
            ? "已记录这次发布"
            : ready
              ? "全部就绪，可以完成发版"
              : `剩余 ${remaining} 项必做${pendingFeatures ? ` · ${pendingFeatures} 项待验收` : ""}`}
        </div>
        {readonly ? (
          <button
            className="button secondary"
            onClick={() => setConfirm("reopen")}
          >
            重新打开计划
          </button>
        ) : (
          <button
            className="button primary"
            disabled={!ready}
            onClick={() => setConfirm("finish")}
          >
            <CheckCheck size={16} />
            完成发版
          </button>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          title={
            confirm === "finish"
              ? "确认这次发布已完成？"
              : confirm === "reopen"
                ? "重新打开发布计划？"
                : "删除这个发布计划？"
          }
          text={
            confirm === "finish"
              ? "全部 Feature 已验收，必做流程已勾选。确认后将记录完成时间，并锁定本次发布内容。"
              : confirm === "reopen"
                ? "重新打开后可以继续修改功能和流程，再次确认发布。"
                : `${r.project} ${r.version} 及其功能、流程将一起删除。删除后可以撤销。`
          }
          button={
            confirm === "finish"
              ? "确认完成发版"
              : confirm === "reopen"
                ? "重新打开"
                : "删除计划"
          }
          danger={confirm === "delete"}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            if (confirm === "delete") {
              if (await act({ type: "delete_release", id: r.id })) {
                notify("发布计划已删除", () =>
                  act({ type: "add_release", release: r }),
                );
                onBack();
              }
            } else if (
              await act({
                type: "release_status",
                id: r.id,
                status: confirm === "finish" ? "released" : "planned",
              })
            )
              notify(
                confirm === "finish"
                  ? "发布完成，辛苦了！"
                  : "已重新打开发布计划",
              );
          }}
        />
      )}
    </div>
  );
}
