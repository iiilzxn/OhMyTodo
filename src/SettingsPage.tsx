import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  Bell,
  Download,
  FolderOpen,
  Keyboard,
  Monitor,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useApp, desktop } from "./state";
import type { AppData, ChecklistTemplate, ReleaseStep } from "./model";
import { uid } from "./model";
import { Field, IconButton, Modal, Toggle } from "./ui";
import { ConfirmDialog, FormFooter, StepEditor } from "./forms";

export function SettingsPage() {
  const { data, day, act, notify, accept } = useApp();
  const [auto, setAuto] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [info, setInfo] = useState<{
    dataPath: string;
    version: string;
    warnings: string[];
  } | null>(null);
  const [restore, setRestore] = useState<{
    path: string;
    data: AppData;
  } | null>(null);
  const [template, setTemplate] = useState<ChecklistTemplate | "new" | null>(
    null,
  );
  useEffect(() => {
    isEnabled()
      .then(setAuto)
      .catch((e) =>
        notify(`无法读取开机启动设置：${String(e)}`, undefined, true),
      );
    invoke<typeof info>("get_info")
      .then(setInfo)
      .catch((e) => notify(String(e), undefined, true));
  }, [notify]);
  const exportData = async () => {
    try {
      const path = await save({
        defaultPath: `ohmytodo-backup-${day}.json`,
        filters: [{ name: "待办备份", extensions: ["json"] }],
      });
      if (path) {
        await invoke("export_backup", { path });
        notify("备份已导出");
      }
    } catch (e) {
      notify(String(e), undefined, true);
    }
  };
  const importData = async () => {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "待办备份", extensions: ["json"] }],
      });
      if (typeof path === "string")
        setRestore({
          path,
          data: await invoke<AppData>("preview_backup", { path }),
        });
    } catch (e) {
      notify(String(e), undefined, true);
    }
  };
  return (
    <div className="page settings-page">
      <header className="page-heading">
        <div>
          <div className="eyebrow">按你的习惯来</div>
          <h1>设置</h1>
          <p>让这个小工具，安静地陪你工作。</p>
        </div>
      </header>
      <section className="settings-card">
        <h2>
          <Monitor size={18} />
          外观与启动
        </h2>
        <div className="setting-row">
          <div>
            <strong>界面主题</strong>
            <p>选择舒适的明暗风格</p>
          </div>
          <select
            aria-label="界面主题"
            value={data!.settings.theme}
            onChange={(e) =>
              void act({
                type: "set_settings",
                settings: {
                  ...data!.settings,
                  theme: e.target.value as AppData["settings"]["theme"],
                },
              })
            }
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
        <div className="setting-row">
          <div>
            <strong>登录 Windows 时启动</strong>
            <p>启动后留在托盘，需要时再打开</p>
          </div>
          <Toggle
            label="登录 Windows 时启动"
            checked={auto}
            disabled={autoBusy}
            onChange={async () => {
              setAutoBusy(true);
              try {
                if (auto) await disable();
                else await enable();
                setAuto(!auto);
              } catch (e) {
                notify(String(e), undefined, true);
              } finally {
                setAutoBusy(false);
              }
            }}
          />
        </div>
      </section>
      <section className="settings-card">
        <h2>
          <Bell size={18} />
          提醒
        </h2>
        <div className="setting-row">
          <div>
            <strong>桌面通知</strong>
            <p>有提醒时间的待办，到时通知你</p>
          </div>
          <Toggle
            label="桌面通知"
            checked={data!.settings.notifications}
            onChange={() =>
              void act({
                type: "set_settings",
                settings: {
                  ...data!.settings,
                  notifications: !data!.settings.notifications,
                },
              })
            }
          />
        </div>
        <p className="settings-footnote">
          保持应用在托盘运行即可提醒。发版提醒在前一天及当天 09:00
          发送；退出应用后暂停提醒。Windows 勿扰模式可能将通知收进通知中心。
        </p>
      </section>
      <section className="settings-card">
        <h2>
          <Keyboard size={18} />
          快捷键
        </h2>
        <div className="shortcut-row">
          <span>随时添加待办</span>
          <kbd>Ctrl</kbd>
          <kbd>Alt</kbd>
          <kbd>N</kbd>
        </div>
        <div className="shortcut-row">
          <span>显示 / 隐藏悬浮窗</span>
          <kbd>Ctrl</kbd>
          <kbd>Alt</kbd>
          <kbd>Space</kbd>
        </div>
        <div className="shortcut-row">
          <span>应用内搜索</span>
          <kbd>Ctrl</kbd>
          <kbd>K</kbd>
        </div>
        {info?.warnings.map((w) => (
          <p key={w} className="settings-warning">
            {w}
          </p>
        ))}
      </section>
      <section className="settings-card">
        <div className="label-action">
          <h2>
            <ShieldCheck size={18} />
            发版流程模板
          </h2>
          <button className="text-button" onClick={() => setTemplate("new")}>
            <Plus size={15} />
            新建模板
          </button>
        </div>
        <p className="settings-footnote">
          新建版本时复制模板。之后修改模板，不会影响已创建的发布计划。
        </p>
        {data!.templates.map((t) => (
          <div className="template-row" key={t.id}>
            <button onClick={() => setTemplate(t)}>
              <strong>{t.name}</strong>
              <span>
                {t.steps.length} 项流程 ·{" "}
                {t.steps.filter((s) => s.required).length} 项必做
              </span>
            </button>
            <IconButton
              label={`删除模板：${t.name}`}
              onClick={async () => {
                if (await act({ type: "delete_template", id: t.id }))
                  notify("模板已删除", () =>
                    act({ type: "upsert_template", template: t }),
                  );
              }}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
      </section>
      <section className="settings-card">
        <h2>
          <FolderOpen size={18} />
          本地数据
        </h2>
        <p className="settings-footnote">
          每次修改自动保存。每天保留一份自动备份，保存最近 14
          天；恢复备份前也会保存当前数据。
        </p>
        <div className="backup-actions">
          <button
            className="button secondary"
            onClick={() => void exportData()}
          >
            <Download size={16} />
            导出备份
          </button>
          <button
            className="button secondary"
            onClick={() => void importData()}
          >
            <Upload size={16} />
            恢复备份
          </button>
        </div>
        <Field label="数据目录">
          <input
            readOnly
            value={info?.dataPath || "正在读取…"}
            onFocus={(e) => e.target.select()}
          />
        </Field>
        <button
          className="text-button"
          onClick={() =>
            void invoke("open_data_directory").catch((e) =>
              notify(String(e), undefined, true),
            )
          }
        >
          <FolderOpen size={14} />
          打开数据文件夹
        </button>
      </section>
      <div className="settings-bottom">
        <span>OhMyTodo {info?.version || "…"} · 为专注留一点空间</span>
        <button className="text-button" onClick={() => void desktop("quit")}>
          退出应用
        </button>
      </div>
      {restore && (
        <ConfirmDialog
          title="恢复这份备份？"
          text={`备份包含 ${restore.data.tasks.length} 项待办、${restore.data.releases.length} 个发布计划、${restore.data.calendarMarks.length} 条日历标记。它将替换当前数据；当前数据会先自动备份。`}
          button="备份当前数据并恢复"
          onClose={() => setRestore(null)}
          onConfirm={async () => {
            try {
              accept(
                await invoke<AppData>("restore_backup", { path: restore.path }),
              );
              notify("备份已恢复");
            } catch (e) {
              notify(String(e), undefined, true);
            }
          }}
        />
      )}
      {template && (
        <TemplateEditor
          template={template === "new" ? undefined : template}
          onClose={() => setTemplate(null)}
        />
      )}
    </div>
  );
}
function TemplateEditor({
  template,
  onClose,
}: {
  template?: ChecklistTemplate;
  onClose: () => void;
}) {
  const { act, notify } = useApp();
  const [name, setName] = useState(template?.name || "");
  const [steps, setSteps] = useState<ReleaseStep[]>(
    template?.steps.map((s) => ({ ...s })) || [],
  );
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      title={template ? "编辑流程模板" : "新建流程模板"}
      wide
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const value = {
            id: template?.id || uid(),
            name: name.trim(),
            steps: steps.map((s) => ({ ...s, done: false })),
          };
          const result = await act({
            type: "upsert_template",
            template: value,
          });
          setSaving(false);
          if (result) {
            notify("流程模板已保存");
            onClose();
          }
        }}
      >
        <div className="form-body">
          <Field label="模板名称">
            <input
              autoFocus
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如 桌面应用发布"
            />
          </Field>
          <StepEditor steps={steps} onChange={setSteps} />
        </div>
        <FormFooter onClose={onClose} saving={saving}>
          保存模板
        </FormFooter>
      </form>
    </Modal>
  );
}
