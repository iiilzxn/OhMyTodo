mod calendar;
#[cfg(test)]
mod calendar_tests;
mod model;
mod store;
use model::{Action, AppData};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use store::Store;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, ShortcutState};
use tauri_plugin_notification::NotificationExt;

struct RuntimeInfo {
    warnings: Mutex<Vec<String>>,
    main_ready: AtomicBool,
    background: bool,
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}
fn show_widget(app: &AppHandle, toggle: bool) {
    if let Some(w) = app.get_webview_window("widget") {
        if toggle && w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.unminimize();
        }
    }
}

#[tauri::command]
fn get_state(store: State<Store>) -> Result<AppData, String> {
    store.get()
}

#[tauri::command]
fn dispatch(app: AppHandle, store: State<Store>, action: Action) -> Result<AppData, String> {
    let data = store.act(action)?;
    // Revision numbers protect clients when events from parallel commands arrive out of order.
    let _ = app.emit("data-changed", &data);
    Ok(data)
}

#[tauri::command]
fn frontend_ready(window: tauri::WebviewWindow, runtime: State<RuntimeInfo>) {
    if window.label() == "main"
        && !runtime.main_ready.swap(true, Ordering::SeqCst)
        && !runtime.background
    {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn window_action(app: AppHandle, action: String, target: Option<String>) -> Result<(), String> {
    match action.as_str() {
        "widget" => show_widget(&app, false),
        "toggle_widget" => show_widget(&app, true),
        "main" => {
            show_main(&app);
            if let Some(target) = target {
                app.emit_to("main", "navigate", target)
                    .map_err(|e| e.to_string())?;
            }
        }
        "new_task" => {
            show_main(&app);
            app.emit_to("main", "quick-add", ())
                .map_err(|e| e.to_string())?;
        }
        "quit" => app.exit(0),
        _ => return Err("未知窗口操作".into()),
    }
    Ok(())
}

#[tauri::command]
fn get_info(store: State<Store>, runtime: State<RuntimeInfo>) -> serde_json::Value {
    serde_json::json!({ "dataPath": store.directory.to_string_lossy(), "version": env!("CARGO_PKG_VERSION"), "warnings": runtime.warnings.lock().unwrap().clone() })
}

#[tauri::command]
fn open_data_directory(store: State<Store>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(&store.directory)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn export_backup(store: State<Store>, path: String) -> Result<(), String> {
    store::export(&store.get()?, &PathBuf::from(path))
}

#[tauri::command]
fn export_calendar(store: State<Store>, path: String) -> Result<(), String> {
    let data = store.get()?;
    let content = calendar::icalendar(&data.calendar_marks)?;
    store::atomic_write(content.as_bytes(), &PathBuf::from(path))
}

#[tauri::command]
fn open_holiday_source(year: i32) -> Result<(), String> {
    let url = match year {
        2025 => "https://www.gov.cn/zhengce/zhengceku/202411/content_6986383.htm",
        2026 => "https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm",
        _ => return Err("这个年份尚未收录官方安排".into()),
    };
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn preview_backup(path: String) -> Result<AppData, String> {
    store::import(&PathBuf::from(path))
}

#[tauri::command]
fn restore_backup(app: AppHandle, store: State<Store>, path: String) -> Result<AppData, String> {
    let data = store.replace(store::import(&PathBuf::from(path))?)?;
    let _ = app.emit("data-changed", &data);
    Ok(data)
}

#[tauri::command]
fn add_examples(app: AppHandle, store: State<Store>) -> Result<AppData, String> {
    let mut data = store.get()?;
    if !data.tasks.is_empty() || !data.releases.is_empty() {
        return Err("示例仅可添加到空的任务库".into());
    }
    let now = model::now();
    let today = model::today();
    for (index, title) in [
        "整理今天的工作安排",
        "回复待处理邮件",
        "整理下载文件夹",
        "查看今日安排",
        "整理桌面文件",
    ]
    .iter()
    .enumerate()
    {
        data.tasks.push(model::Task {
            id: model::id(),
            title: (*title).into(),
            notes: "这是体验示例，可随时编辑或删除。".into(),
            category: "work".into(),
            today: true,
            starred: index == 0,
            due_date: Some(today.clone()),
            due_time: None,
            repeat: "none".into(),
            items: vec![],
            completed_at: if index >= 3 { Some(now.clone()) } else { None },
            created_at: now.clone(),
            updated_at: now.clone(),
            generated_from: None,
        });
    }
    let titles = [
        (
            "全局搜索",
            vec![
                "搜索标题与正文",
                "键盘上下选择",
                "Enter 打开结果",
                "空结果与中文输入法验收",
            ],
        ),
        (
            "Markdown 导出",
            vec!["导出正文", "保留图片引用", "验证文件名"],
        ),
        ("自动备份", vec!["设置备份目录", "定时备份", "恢复验证"]),
    ];
    let features = titles
        .iter()
        .enumerate()
        .map(|(index, (title, items))| model::Feature {
            id: model::id(),
            title: (*title).into(),
            notes: if index == 0 {
                "确认中文输入法组合输入与空结果提示。".into()
            } else {
                "".into()
            },
            items: items
                .iter()
                .enumerate()
                .map(|(i, name)| model::CheckItem {
                    id: model::id(),
                    title: (*name).into(),
                    done: index > 0 || i < 3,
                })
                .collect(),
            accepted: index > 0,
        })
        .collect();
    let mut steps = model::default_steps();
    steps.iter_mut().skip(1).take(2).for_each(|s| s.done = true);
    data.releases.push(model::Release {
        id: model::id(),
        project: "NoteDesk".into(),
        version: "v1.4.0".into(),
        date: (chrono::Local::now().date_naive() + chrono::Duration::days(2)).to_string(),
        notes: "体验示例：三个 Feature 和一份独立的发版检查清单。".into(),
        features,
        steps,
        status: "planned".into(),
        remind: false,
        created_at: now,
        released_at: None,
    });
    let result = store.populate_empty(data)?;
    let _ = app.emit("data-changed", &result);
    Ok(result)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::Builder::new().args(["--background"]).build())
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(tauri_plugin_window_state::StateFlags::POSITION).build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| {
            if event.state != ShortcutState::Pressed { return; }
            if shortcut.matches(Modifiers::CONTROL | Modifiers::ALT, Code::KeyN) {
                show_main(app); let _ = app.emit_to("main", "quick-add", ());
            } else { show_widget(app, true); }
        }).build())
        .setup(|app| {
            let directory = std::env::var_os("OHMYTODO_DATA_DIR").map(PathBuf::from).unwrap_or(app.path().app_local_data_dir()?);
            let store = match Store::open(directory) {
                Ok(store) => store,
                Err(error) => {
                    app.dialog().message(format!("无法打开本地任务库。\n{error}\n\n原数据已保留，请检查磁盘空间或从备份恢复。"))
                        .title("待办无法启动").kind(tauri_plugin_dialog::MessageDialogKind::Error).blocking_show();
                    return Err(error.into());
                }
            };
            app.manage(store);
            let mut warnings = Vec::new();
            for key in ["Ctrl+Alt+N", "Ctrl+Alt+Space"] {
                if let Err(error) = app.global_shortcut().register(key) { warnings.push(format!("快捷键 {key} 注册失败，可能已被其他程序占用：{error}")); }
            }
            app.manage(RuntimeInfo { warnings: Mutex::new(warnings), main_ready: AtomicBool::new(false), background: std::env::args().any(|x| x == "--background") });
            use tauri::{menu::{Menu, MenuItem, PredefinedMenuItem}, tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState}};
            let open = MenuItem::with_id(app, "main", "打开待办", true, None::<&str>)?;
            let widget = MenuItem::with_id(app, "widget", "显示 / 隐藏悬浮窗", true, None::<&str>)?;
            let quick = MenuItem::with_id(app, "quick", "快速添加    Ctrl+Alt+N", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出待办", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &widget, &quick, &separator, &quit])?;
            TrayIconBuilder::with_id("ohmytodo-tray").tooltip("待办 · OhMyTodo")
                .icon(app.default_window_icon().unwrap().clone()).menu(&menu).show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "main" => show_main(app), "widget" => show_widget(app, true),
                    "quick" => { show_main(app); let _ = app.emit_to("main", "quick-add", ()); },
                    "quit" => app.exit(0), _ => (),
                })
                .on_tray_icon_event(|tray, event| if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event { show_main(tray.app_handle()); })
                .build(app)?;
            // WebViews can execute IPC as soon as they are created. Build them only
            // after Store and RuntimeInfo are managed, including on a warm start.
            for config in &app.config().app.windows {
                let mut builder = tauri::WebviewWindowBuilder::from_config(app, config)?;
                // Settings changed after NavigationStarting can apply only to the
                // next navigation. Suppress the first document's menu as well.
                builder = builder.initialization_script(
                    "window.addEventListener('contextmenu', (event) => event.preventDefault(), { capture: true });"
                );
                if let Some(test_dir) = std::env::var_os("OHMYTODO_DATA_DIR") {
                    builder = builder.data_directory(PathBuf::from(test_dir).join("webview"));
                }
                let window = builder.build()?;
                #[cfg(target_os = "windows")]
                {
                    let handle = app.handle().clone();
                    let label = window.label().to_string();
                    window.with_webview(move |webview| {
                        // Tauri runs this callback on the WebView's owning UI thread.
                        // Disable the browser menu at the native layer, including
                        // right-click, keyboard context-menu keys, and long press.
                        // Standard text-editing keyboard shortcuts are unaffected.
                        let result = unsafe {
                            webview.controller().CoreWebView2()
                                .and_then(|view| view.Settings())
                                .and_then(|settings| settings.SetAreDefaultContextMenusEnabled(false))
                        };
                        if let Err(error) = result {
                            if let Ok(mut warnings) = handle.state::<RuntimeInfo>().warnings.lock() {
                                warnings.push(format!("关闭网页右键菜单失败（{label}）：{error}"));
                            }
                        }
                    })?;
                }
            }
            if !app.state::<RuntimeInfo>().background {
                show_main(app.handle());
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(30));
                let store = handle.state::<Store>();
                if let Ok(reminders) = store.reminders() {
                    for (key, body) in reminders {
                        if handle.notification().builder().title("待办 · OhMyTodo").body(&body).show().is_ok() { let _ = store.mark_reminded(&key); }
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); }
        })
        .invoke_handler(tauri::generate_handler![get_state, dispatch, frontend_ready, window_action, get_info, open_data_directory, export_backup, export_calendar, open_holiday_source, preview_backup, restore_backup, add_examples])
        .run(tauri::generate_context!())
        .expect("OhMyTodo runtime failed");
}
