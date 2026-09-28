import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import type { CalendarColor, CalendarMark } from "../model";
import { uid } from "../model";
import { useApp } from "../state";
import { Field, Modal } from "../ui";
import {
  COLORS,
  MAX_DATE,
  MIN_DATE,
  daysBetween,
  rangeLabel,
  validDay,
} from "./dates";
import type { DateRange } from "./dates";

export function CalendarEditor({
  mark,
  range,
  onClose,
}: {
  mark?: CalendarMark;
  range: DateRange;
  onClose: () => void;
}) {
  const { act, notify } = useApp();
  const [original] = useState(mark);
  const [title, setTitle] = useState(mark?.title || "");
  const [start, setStart] = useState(mark?.startDate || range.start);
  const [end, setEnd] = useState(mark?.endDate || range.end);
  const [color, setColor] = useState<CalendarColor>(mark?.color || "blue");
  const [notes, setNotes] = useState(mark?.notes || "");
  const [busy, setBusy] = useState(false);
  const valid =
    validDay(start) &&
    validDay(end) &&
    end >= start &&
    daysBetween(start, end) < 3660;
  const remove = async () => {
    if (!original || busy) return;
    setBusy(true);
    const result = await act({
      type: "delete_calendar_mark",
      id: original.id,
      expectedUpdatedAt: original.updatedAt,
    });
    setBusy(false);
    if (result) {
      onClose();
      notify("日历标记已删除", () =>
        act({
          type: "upsert_calendar_mark",
          mark: original,
          expectedUpdatedAt: null,
        }),
      );
    }
  };
  return (
    <Modal
      title={original ? "编辑日历标记" : "新建日历标记"}
      subtitle="为一段时间，留一个清晰的记号。"
      onClose={onClose}
    >
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          if (!valid) {
            notify(
              "请检查日期范围：结束日期不能早于开始日期，最长 3660 天",
              undefined,
              true,
            );
            return;
          }
          setBusy(true);
          const now = new Date().toISOString();
          const value: CalendarMark = {
            id: original?.id || uid(),
            title: title.trim(),
            startDate: start,
            endDate: end,
            color,
            notes,
            createdAt: original?.createdAt || now,
            updatedAt: original?.updatedAt || now,
          };
          const result = await act({
            type: "upsert_calendar_mark",
            mark: value,
            expectedUpdatedAt: original?.updatedAt || null,
          });
          setBusy(false);
          if (result) {
            onClose();
            notify(original ? "日历标记已更新" : "已添加日历标记");
          }
        }}
      >
        <div className="form-body">
          <Field label="标记名称">
            <input
              autoFocus
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如 休假、出差、专注学习…"
            />
          </Field>
          <div className="form-grid">
            <Field label="开始日期">
              <input
                required
                type="date"
                min={MIN_DATE}
                max={MAX_DATE}
                value={start}
                onChange={(e) => {
                  const next = e.target.value;
                  setStart(next);
                  if (next && next > end) setEnd(next);
                }}
              />
            </Field>
            <Field label="结束日期">
              <input
                required
                type="date"
                min={start || MIN_DATE}
                max={MAX_DATE}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
          </div>
          <div className="cal-editor-range">
            {valid
              ? `${rangeLabel({ start, end })} · 共 ${daysBetween(start, end) + 1} 天`
              : "请选择有效的起止日期"}
          </div>
          <Field label="标记颜色">
            <div className="cal-colors" role="radiogroup">
              {COLORS.map((c) => (
                <label
                  key={c.id}
                  className="cal-color-swatch"
                  data-color={c.id}
                  title={c.name}
                >
                  <input
                    type="radio"
                    name="calendar-color"
                    aria-label={c.name}
                    checked={color === c.id}
                    onChange={() => setColor(c.id)}
                  />
                  <span>
                    {color === c.id && <Check size={16} strokeWidth={2.5} />}
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="日历备注">
            <textarea
              rows={3}
              maxLength={16000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="目的地、想法，或这段时间的安排…"
            />
          </Field>
        </div>
        <div className="form-footer">
          {original && (
            <button
              type="button"
              className="cal-delete-button"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 size={15} />
              删除
            </button>
          )}
          <span className="cal-footer-space" />
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "保存中…" : "保存标记"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
