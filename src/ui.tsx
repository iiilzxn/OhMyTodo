import { cloneElement, useEffect, useId, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  Check,
  Minus,
  Square,
  X,
  ChevronRight,
  CircleAlert,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { useApp } from "./state";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? "small" : ""}`}>
      <Check size={small ? 16 : 20} strokeWidth={3} />
    </span>
  );
}
export function IconButton({
  label,
  children,
  onClick,
  className = "",
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function CheckButton({
  checked,
  onClick,
  label,
  disabled = false,
  square = false,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  square?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`check-button ${checked ? "checked" : ""} ${square ? "squared" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {checked && <Check size={14} strokeWidth={2.5} />}
    </button>
  );
}
export function Titlebar() {
  const { notify } = useApp();
  const call = async (action: "minimize" | "toggleMaximize" | "hide") => {
    if (isTauri())
      await getCurrentWindow()
        [action]()
        .catch((e) => notify(String(e), undefined, true));
  };
  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <Logo small />
        <span data-tauri-drag-region>待办</span>
        <span className="brand-sub" data-tauri-drag-region>
          OhMyTodo
        </span>
      </div>
      <div className="window-controls">
        <IconButton label="最小化" onClick={() => void call("minimize")}>
          <Minus size={15} />
        </IconButton>
        <IconButton
          label="最大化或还原"
          onClick={() => void call("toggleMaximize")}
        >
          <Square size={12} />
        </IconButton>
        <IconButton
          label="收起到托盘"
          className="window-close"
          onClick={() => void call("hide")}
        >
          <X size={16} />
        </IconButton>
      </div>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const { toast, dismiss } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dismiss();
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <div className="modal-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <IconButton label="关闭对话框" onClick={onClose}>
          <X size={19} />
        </IconButton>
      </div>
      {toast?.error && (
        <div className="modal-error" role="alert">
          <CircleAlert size={15} />
          <span>{toast.text}</span>
        </div>
      )}
      {children}
    </dialog>
  );
}
export function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}
export function SectionLabel({
  children,
  count,
}: {
  children: ReactNode;
  count?: number | string;
}) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {count !== undefined && <span className="count">{count}</span>}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const child = cloneElement(
    children as ReactElement<{
      id?: string;
      "aria-labelledby"?: string;
      "aria-describedby"?: string;
    }>,
    {
      id,
      "aria-labelledby": `${id}-label`,
      "aria-describedby": hint ? `${id}-hint` : undefined,
    },
  );
  return (
    <div className="field">
      <label id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      {child}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={onChange}
      disabled={disabled}
    >
      <span />
    </button>
  );
}
export function Breadcrumb({
  children,
  onBack,
}: {
  children: ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="breadcrumb">
      <button onClick={onBack}>发布计划</button>
      <ChevronRight size={13} />
      <span>{children}</span>
    </div>
  );
}
export function ToastView() {
  const { toast, dismiss, notify } = useApp();
  if (!toast) return null;
  return (
    <div
      className={`toast ${toast.error ? "error" : ""}`}
      role={toast.error ? "alert" : "status"}
    >
      {toast.error ? <CircleAlert size={17} /> : <Check size={17} />}
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          onClick={async () => {
            const undo = toast.undo;
            dismiss();
            try {
              await undo?.();
            } catch (e) {
              notify(String(e), undefined, true);
            }
          }}
        >
          撤销
        </button>
      )}
      <IconButton label="关闭提示" onClick={dismiss}>
        <X size={14} />
      </IconButton>
    </div>
  );
}
