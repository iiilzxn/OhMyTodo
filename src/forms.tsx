import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Layers,
  ListTodo,
  Rocket,
} from "lucide-react";
import { useApp } from "./state";
import { changed, localDate, newTask, parseItems, uid } from "./model";
import type { Feature, Release, ReleaseStep, Task } from "./model";
import { Field, IconButton, Modal, Toggle } from "./ui";

export type CreateKind = "task" | "feature" | "release";
export function FormFooter({
  onClose,
  saving,
  children = "保存修改",
}: {
  onClose: () => void;
  saving: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="form-footer">
      <button type="button" className="button secondary" onClick={onClose}>
        取消
      </button>
      <button type="submit" className="button primary" disabled={saving}>
        {saving ? "正在保存…" : children}
      </button>
    </div>
  );
}
export function TaskForm({
  task,
  onClose,
  initialToday = true,
}: {
  task?: Task;
  onClose: () => void;
  initialToday?: boolean;
}) {
  const { act, notify } = useApp();
  const [draft, setDraft] = useState<Task>(() =>
    task ? { ...task } : newTask("", { today: initialToday }),
  );
  const [original] = useState(task);
  const [lines, setLines] = useState(
    draft.items.map((i) => i.title).join("\n"),
  );
  const [saving, setSaving] = useState(false);
  const patch = (value: Partial<Task>) => setDraft((d) => ({ ...d, ...value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const value = {
      ...draft,
      title: draft.title.trim(),
      items: parseItems(lines, task?.items),
      dueTime: draft.dueDate ? draft.dueTime : null,
    };
    const result = await act(
      task
        ? {
            type: "update_task",
            id: task.id,
            patch: changed(original!, value, [
              "title",
              "notes",
              "today",
              "starred",
              "category",
              "dueDate",
              "dueTime",
              "repeat",
              "items",
            ]),
          }
        : { type: "add_task", task: value },
    );
    setSaving(false);
    if (result) {
      notify(task ? "修改已保存" : "已添加待办");
      onClose();
    }
  };
  return (
    <form onSubmit={submit} className="editor-form">
      <div className="form-body">
        <Field label="待办名称">
          <input
            autoFocus
            required
            maxLength={200}
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="接下来要做什么？"
            className="large-input"
          />
        </Field>
        <div className="form-grid">
          <Field label="日期">
            <input
              type="date"
              value={draft.dueDate || ""}
              onChange={(e) =>
                patch({
                  dueDate: e.target.value || null,
                  dueTime: e.target.value ? draft.dueTime : null,
                })
              }
            />
          </Field>
          <Field
            label="提醒时间"
            hint={
              draft.dueDate
                ? "保持应用在托盘运行即可收到提醒"
                : "先选择日期，可按需设置提醒"
            }
          >
            <input
              type="time"
              disabled={!draft.dueDate}
              value={draft.dueTime || ""}
              onChange={(e) => patch({ dueTime: e.target.value || null })}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="分类">
            <select
              value={draft.category}
              onChange={(e) =>
                patch({ category: e.target.value as Task["category"] })
              }
            >
              <option value="work">工作</option>
              <option value="life">生活</option>
            </select>
          </Field>
          <Field label="重复">
            <select
              value={draft.repeat}
              onChange={(e) =>
                patch({ repeat: e.target.value as Task["repeat"] })
              }
            >
              <option value="none">不重复</option>
              <option value="daily">每天 · 完成后安排下一次</option>
              <option value="weekly">每周 · 完成后安排下一次</option>
            </select>
          </Field>
        </div>
        <div className="inline-options">
          <label>
            <input
              type="checkbox"
              checked={draft.today}
              onChange={(e) => patch({ today: e.target.checked })}
            />
            加入今天
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.starred}
              onChange={(e) => patch({ starred: e.target.checked })}
            />
            标记为重要
          </label>
        </div>
        <Field label="子任务" hint="每行一项；已有子项会保留完成状态">
          <textarea
            rows={3}
            value={lines}
            onChange={(e) => setLines(e.target.value)}
            placeholder="把一件大事，拆成几步小事"
          />
        </Field>
        <Field label="备注">
          <textarea
            rows={3}
            maxLength={16000}
            value={draft.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="补充说明、想法或注意事项…"
          />
        </Field>
      </div>
      <FormFooter onClose={onClose} saving={saving}>
        {task ? "保存修改" : "添加待办"}
      </FormFooter>
    </form>
  );
}

export function StepEditor({
  steps,
  onChange,
}: {
  steps: ReleaseStep[];
  onChange: (steps: ReleaseStep[]) => void;
}) {
  const change = (index: number, value: Partial<ReleaseStep>) =>
    onChange(steps.map((s, i) => (i === index ? { ...s, ...value } : s)));
  const move = (index: number, offset: number) => {
    const copy = [...steps];
    [copy[index], copy[index + offset]] = [copy[index + offset], copy[index]];
    onChange(copy);
  };
  return (
    <div className="step-editor">
      {steps.map((step, index) => (
        <div className="step-edit-row" key={step.id}>
          <span className="row-number">{index + 1}</span>
          <input
            aria-label={`流程步骤 ${index + 1}`}
            required
            maxLength={200}
            value={step.title}
            onChange={(e) =>
              change(index, { title: e.target.value, done: false })
            }
          />
          <label className="required-control">
            <input
              type="checkbox"
              checked={step.required}
              onChange={(e) => change(index, { required: e.target.checked })}
            />
            必做
          </label>
          <IconButton
            label={`上移步骤 ${index + 1}`}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUp size={13} />
          </IconButton>
          <IconButton
            label={`下移步骤 ${index + 1}`}
            disabled={index === steps.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDown size={13} />
          </IconButton>
          <IconButton
            label={`删除步骤 ${index + 1}`}
            onClick={() => onChange(steps.filter((s) => s.id !== step.id))}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        onClick={() =>
          onChange([
            ...steps,
            { id: uid(), title: "", done: false, required: true },
          ])
        }
      >
        <Plus size={15} />
        添加流程步骤
      </button>
    </div>
  );
}

export function ReleaseForm({
  release,
  onClose,
  onCreated,
}: {
  release?: Release;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data, act, notify } = useApp();
  const [original] = useState(release);
  const [project, setProject] = useState(release?.project || "");
  const [version, setVersion] = useState(release?.version || "");
  const [date, setDate] = useState(release?.date || localDate());
  const [notes, setNotes] = useState(release?.notes || "");
  const [remind, setRemind] = useState(release?.remind ?? true);
  const [templateId, setTemplateId] = useState(data!.templates[0]?.id || "");
  const [steps, setSteps] = useState<ReleaseStep[]>(() =>
    release
      ? release.steps.map((s) => ({ ...s }))
      : (data!.templates[0]?.steps || []).map((s) => ({
          ...s,
          id: uid(),
          done: false,
        })),
  );
  const [editSteps, setEditSteps] = useState(Boolean(release));
  const [features, setFeatures] = useState<
    { id: string; title: string; lines: string }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const mergedSteps = steps.map((step) => {
      const old = original?.steps.find((s) => s.id === step.id);
      const current = release?.steps.find((s) => s.id === step.id);
      return old &&
        current &&
        old.title === step.title &&
        current.title === step.title
        ? { ...step, done: current.done }
        : step;
    });
    const value: Release = {
      id: release?.id || uid(),
      project: project.trim(),
      version: version.trim(),
      date,
      notes,
      remind,
      steps: mergedSteps,
      features:
        release?.features ||
        features.map((f) => ({
          id: f.id,
          title: f.title.trim(),
          items: parseItems(f.lines),
          notes: "",
          accepted: false,
        })),
      status: release?.status || "planned",
      createdAt: release?.createdAt || new Date().toISOString(),
      releasedAt: release?.releasedAt || null,
    };
    const result = await act(
      release
        ? {
            type: "update_release",
            id: release.id,
            patch: changed(original!, value, [
              "project",
              "version",
              "date",
              "notes",
              "remind",
              "steps",
            ]),
          }
        : { type: "add_release", release: value },
    );
    setSaving(false);
    if (result) {
      notify(release ? "发布计划已更新" : "发布计划已创建");
      onClose();
      onCreated(value.id);
    }
  };
  return (
    <form onSubmit={submit} className="editor-form">
      <div className="form-body">
        <div className="form-grid">
          <Field label="项目名称">
            <input
              autoFocus
              required
              maxLength={200}
              placeholder="例如 NoteDesk"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            />
          </Field>
          <Field label="版本">
            <input
              required
              maxLength={100}
              placeholder="例如 v1.4.0"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </Field>
        </div>
        <Field label="计划发布日期">
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        {!release && (
          <div className="feature-drafts">
            <div className="label-action">
              <h3>本次包含的 Feature</h3>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setFeatures([
                    ...features,
                    { id: uid(), title: "", lines: "" },
                  ])
                }
              >
                <Plus size={15} />
                添加 Feature
              </button>
            </div>
            {features.length === 0 && (
              <div className="form-hint">
                先创建版本，也可以稍后逐个添加功能。
              </div>
            )}
            {features.map((f, index) => (
              <div className="feature-draft" key={f.id}>
                <div className="feature-draft-title">
                  <input
                    required
                    aria-label={`Feature 名称 ${index + 1}`}
                    maxLength={200}
                    placeholder="Feature 名称，例如全局搜索"
                    value={f.title}
                    onChange={(e) =>
                      setFeatures(
                        features.map((x) =>
                          x.id === f.id ? { ...x, title: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <IconButton
                    label={`移除 Feature ${index + 1}`}
                    onClick={() =>
                      setFeatures(features.filter((x) => x.id !== f.id))
                    }
                  >
                    <XIcon />
                  </IconButton>
                </div>
                <textarea
                  aria-label={`Feature 功能项 ${index + 1}`}
                  rows={3}
                  placeholder="具体功能 / 验收项，每行一项"
                  value={f.lines}
                  onChange={(e) =>
                    setFeatures(
                      features.map((x) =>
                        x.id === f.id ? { ...x, lines: e.target.value } : x,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}
        <div>
          <div className="label-action">
            <h3>发版流程</h3>
            <button
              type="button"
              className="text-button"
              onClick={() => setEditSteps(!editSteps)}
            >
              {editSteps ? "收起" : "编辑流程"}
              <ChevronDown size={14} className={editSteps ? "rotate" : ""} />
            </button>
          </div>
          {!release && (
            <select
              aria-label="发版流程模板"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setSteps(
                  (
                    data!.templates.find((t) => t.id === e.target.value)
                      ?.steps || []
                  ).map((s) => ({ ...s, id: uid(), done: false })),
                );
              }}
            >
              <option value="">空白流程</option>
              {data!.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {editSteps ? (
            <StepEditor steps={steps} onChange={setSteps} />
          ) : (
            <div className="flow-preview">
              {steps.length} 项流程 · {steps.filter((s) => s.required).length}{" "}
              项必做
              <span>
                {steps
                  .slice(0, 3)
                  .map((s) => s.title)
                  .join(" → ")}
                {steps.length > 3 ? " …" : ""}
              </span>
            </div>
          )}
        </div>
        <Field label="版本备注">
          <textarea
            rows={2}
            maxLength={16000}
            placeholder="这次发布的目标或注意事项…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <div className="setting-inline">
          <div>
            <strong>发版提醒</strong>
            <small>发布前一天及当天 09:00</small>
          </div>
          <Toggle
            label="发版提醒"
            checked={remind}
            onChange={() => setRemind(!remind)}
          />
        </div>
      </div>
      <FormFooter saving={saving} onClose={onClose}>
        {release ? "保存修改" : "创建发布计划"}
      </FormFooter>
    </form>
  );
}
function XIcon() {
  return <Trash2 size={15} />;
}

export function FeatureForm({
  releaseId,
  feature,
  onClose,
  onSwitch,
}: {
  releaseId?: string;
  feature?: Feature;
  onClose: () => void;
  onSwitch?: () => void;
}) {
  const { data, act, notify } = useApp();
  const releases = data!.releases.filter((r) => r.status === "planned");
  const [target, setTarget] = useState(releaseId || releases[0]?.id || "");
  const [name, setName] = useState(feature?.title || "");
  const [lines, setLines] = useState(
    feature?.items.map((i) => i.title).join("\n") || "",
  );
  const [notes, setNotes] = useState(feature?.notes || "");
  const [saving, setSaving] = useState(false);
  if (releases.length === 0)
    return (
      <div className="form-body feature-no-release">
        <Layers size={32} />
        <h3>先为功能安排一个版本</h3>
        <p>创建发布计划后，就可以添加 Feature 和具体功能。</p>
        <button className="button primary" onClick={onSwitch}>
          创建发布计划
        </button>
      </div>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const value: Feature = {
      id: feature?.id || uid(),
      title: name.trim(),
      notes,
      items: parseItems(lines, feature?.items),
      accepted: feature?.accepted || false,
    };
    const result = await act({
      type: "upsert_feature",
      releaseId: target,
      feature: value,
    });
    setSaving(false);
    if (result) {
      notify(feature ? "Feature 已更新，请重新确认验收" : "Feature 已添加");
      onClose();
    }
  };
  return (
    <form className="editor-form" onSubmit={submit}>
      <div className="form-body">
        <Field label="所属发布计划">
          <select
            value={target}
            disabled={Boolean(releaseId)}
            onChange={(e) => setTarget(e.target.value)}
          >
            {releases.map((r) => (
              <option key={r.id} value={r.id}>
                {r.project} · {r.version}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Feature 名称">
          <input
            autoFocus
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如 全局搜索"
          />
        </Field>
        <Field
          label="具体功能 / 验收项"
          hint="每行一项。全部完成后，还需要单独确认验收。"
        >
          <textarea
            rows={6}
            value={lines}
            onChange={(e) => setLines(e.target.value)}
            placeholder={
              "搜索标题与正文\n键盘上下选择\nEnter 打开结果\n空结果与中文输入法验收"
            }
          />
        </Field>
        <Field label="验收备注">
          <textarea
            rows={3}
            maxLength={16000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="怎样才算完成？"
          />
        </Field>
      </div>
      <FormFooter saving={saving} onClose={onClose}>
        {feature ? "保存 Feature" : "添加 Feature"}
      </FormFooter>
    </form>
  );
}

export function CreateDialog({
  kind: initial,
  onClose,
  onCreated,
  initialToday,
}: {
  kind: CreateKind;
  onClose: () => void;
  onCreated: (id: string) => void;
  initialToday: boolean;
}) {
  const [kind, setKind] = useState(initial);
  return (
    <Modal
      title="新建待办"
      subtitle="把想做的事，安排得清清楚楚。"
      onClose={onClose}
      wide={kind === "release"}
    >
      <div className="segmented create-tabs">
        {(
          [
            { id: "task", label: "普通待办", icon: ListTodo },
            { id: "feature", label: "Feature", icon: Layers },
            { id: "release", label: "Release", icon: Rocket },
          ] as const
        ).map((item) => (
          <button
            type="button"
            key={item.id}
            className={kind === item.id ? "active" : ""}
            onClick={() => setKind(item.id)}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>
      {kind === "task" && (
        <TaskForm onClose={onClose} initialToday={initialToday} />
      )}
      {kind === "release" && (
        <ReleaseForm onClose={onClose} onCreated={onCreated} />
      )}
      {kind === "feature" && (
        <FeatureForm onClose={onClose} onSwitch={() => setKind("release")} />
      )}
    </Modal>
  );
}

export function ConfirmDialog({
  title,
  text,
  onClose,
  onConfirm,
  button = "确认",
  danger = false,
}: {
  title: string;
  text: string;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
  button?: string;
  danger?: boolean;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="form-body">
        <p className="confirm-text">{text}</p>
      </div>
      <div className="form-footer">
        <button className="button secondary" onClick={onClose}>
          取消
        </button>
        <button
          className={`button ${danger ? "danger" : "primary"}`}
          disabled={pending}
          onClick={async () => {
            setPending(true);
            await onConfirm();
            setPending(false);
            onClose();
          }}
        >
          {pending ? "处理中…" : button}
        </button>
      </div>
    </Modal>
  );
}
