import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Action, AppData } from "./model";
import { localDate } from "./model";

type Toast = {
  id: number;
  text: string;
  error?: boolean;
  undo?: () => void | Promise<unknown>;
};
interface Context {
  data: AppData | null;
  fatal: string;
  busy: number;
  toast: Toast | null;
  day: string;
  act: (action: Action) => Promise<AppData | null>;
  accept: (data: AppData) => void;
  notify: (text: string, undo?: Toast["undo"], error?: boolean) => void;
  dismiss: () => void;
}
const AppContext = createContext<Context | null>(null);
export function Provider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [fatal, setFatal] = useState("");
  const [busy, setBusy] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [day, setDay] = useState(localDate());
  const toastId = useRef(0);
  const accept = useCallback(
    (value: AppData) =>
      setData((current) =>
        !current || value.revision >= current.revision ? value : current,
      ),
    [],
  );
  const notify = useCallback(
    (text: string, undo?: Toast["undo"], error = false) =>
      setToast({ id: ++toastId.current, text, undo, error }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(
      () => setToast(null),
      toast.error ? 10000 : toast.undo ? 8000 : 4000,
    );
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const update = () => setDay(localDate());
    const interval = setInterval(update, 30000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    if (!isTauri()) {
      setFatal("请使用 Windows 桌面应用打开。开发时运行 pnpm desktop。");
      return;
    }
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await listen<AppData>("data-changed", (e) => {
        if (!disposed) accept(e.payload);
      });
      if (disposed) {
        unsubscribe();
        return;
      }
      accept(await invoke<AppData>("get_state"));
    })()
      .catch((e) => {
        if (!disposed) setFatal(String(e));
      })
      .finally(() => {
        void invoke("frontend_ready");
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [accept]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        data?.settings.theme === "system"
          ? query.matches
            ? "dark"
            : "light"
          : data?.settings.theme || "light";
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [data?.settings.theme]);
  const act = useCallback(
    async (action: Action) => {
      setBusy((x) => x + 1);
      try {
        const value = await invoke<AppData>("dispatch", { action });
        accept(value);
        return value;
      } catch (e) {
        notify(String(e), undefined, true);
        return null;
      } finally {
        setBusy((x) => x - 1);
      }
    },
    [accept, notify],
  );
  return (
    <AppContext.Provider
      value={{
        data,
        fatal,
        busy,
        toast,
        day,
        act,
        accept,
        notify,
        dismiss: () => setToast(null),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("Missing provider");
  return ctx;
}
export const desktop = (action: string, target?: string) =>
  invoke<void>("window_action", { action, target });
