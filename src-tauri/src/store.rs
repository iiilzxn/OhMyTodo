use crate::model::{self, Action, AppData};
use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

pub struct Store {
    pub connection: Mutex<Connection>,
    pub directory: PathBuf,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub format: String,
    pub version: u32,
    pub exported_at: String,
    pub data: AppData,
}

fn read_compatible(conn: &Connection) -> Result<(AppData, bool), String> {
    let json: String = conn
        .query_row("SELECT data FROM app_state WHERE id = 1", [], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;
    let mut data: AppData =
        serde_json::from_str(&json).map_err(|e| format!("本地数据无法读取：{e}"))?;
    let migrated = model::migrate(&mut data)?;
    Ok((data, migrated))
}
fn read(conn: &Connection) -> Result<AppData, String> {
    read_compatible(conn).map(|(data, _)| data)
}

fn write(conn: &mut Connection, data: &AppData) -> Result<(), String> {
    let json = serde_json::to_string(data).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO app_state (id, data) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET data = excluded.data", [json]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

impl Store {
    pub fn open(directory: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let mut conn =
            Connection::open(directory.join("ohmytodo.sqlite3")).map_err(|e| e.to_string())?;
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reminder_log (key TEXT PRIMARY KEY, sent_at TEXT NOT NULL);").map_err(|e| e.to_string())?;
        let integrity: String = conn
            .query_row("PRAGMA quick_check", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if integrity != "ok" {
            return Err("数据库校验失败。请保留数据库，并从 backups 文件夹恢复备份。".into());
        }
        let exists = conn
            .query_row("SELECT id FROM app_state WHERE id=1", [], |r| {
                r.get::<_, i32>(0)
            })
            .optional()
            .map_err(|e| e.to_string())?
            .is_some();
        if !exists {
            write(&mut conn, &AppData::default())?;
        }
        let (data, migrated) = read_compatible(&conn)?;
        if migrated {
            let backup_dir = directory.join("backups");
            fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
            let mut legacy = data.clone();
            legacy.schema_version = 1;
            export(
                &legacy,
                &backup_dir.join(format!(
                    "before-calendar-upgrade-{}.json",
                    Local::now().format("%Y%m%d-%H%M%S-%f")
                )),
            )?;
            write(&mut conn, &data)?;
        }
        let store = Self {
            connection: Mutex::new(conn),
            directory,
        };
        store.daily_backup(&data)?;
        Ok(store)
    }
    pub fn get(&self) -> Result<AppData, String> {
        read(&*self.connection.lock().map_err(|e| e.to_string())?)
    }
    pub fn act(&self, action: Action) -> Result<AppData, String> {
        let mut conn = self.connection.lock().map_err(|e| e.to_string())?;
        let old = read(&conn)?;
        let new = model::apply(&old, action)?;
        self.daily_backup(&old)?;
        write(&mut conn, &new)?;
        Ok(new)
    }
    pub fn replace(&self, mut data: AppData) -> Result<AppData, String> {
        model::validate(&data)?;
        let mut conn = self.connection.lock().map_err(|e| e.to_string())?;
        let old = read(&conn)?;
        self.backup_file(
            &old,
            &format!(
                "before-restore-{}.json",
                Local::now().format("%Y%m%d-%H%M%S-%f")
            ),
        )?;
        data.revision = old.revision + 1;
        write(&mut conn, &data)?;
        Ok(data)
    }
    pub fn populate_empty(&self, mut data: AppData) -> Result<AppData, String> {
        let mut conn = self.connection.lock().map_err(|e| e.to_string())?;
        let old = read(&conn)?;
        if !old.tasks.is_empty() || !old.releases.is_empty() {
            return Err("任务库已经有内容，未添加示例".into());
        }
        data.settings = old.settings;
        data.templates = old.templates;
        data.calendar_marks = old.calendar_marks;
        data.revision = old.revision + 1;
        model::validate(&data)?;
        write(&mut conn, &data)?;
        Ok(data)
    }
    fn daily_backup(&self, data: &AppData) -> Result<(), String> {
        let name = format!("daily-{}.json", model::today());
        if !self.directory.join("backups").join(&name).exists() {
            self.backup_file(data, &name)?;
        }
        // Only prune automatic daily snapshots, never user exports or restore snapshots.
        let mut daily: Vec<_> = fs::read_dir(self.directory.join("backups"))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .filter(|e| {
                e.file_name().to_string_lossy().starts_with("daily-")
                    && e.path().extension().is_some_and(|x| x == "json")
            })
            .collect();
        daily.sort_by_key(|e| e.file_name());
        let remove = daily.len().saturating_sub(14);
        for e in daily.into_iter().take(remove) {
            fs::remove_file(e.path()).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    fn backup_file(&self, data: &AppData, name: &str) -> Result<(), String> {
        let dir = self.directory.join("backups");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        export(data, &dir.join(name))
    }
    pub fn reminders(&self) -> Result<Vec<(String, String)>, String> {
        let conn = self.connection.lock().map_err(|e| e.to_string())?;
        let data = read(&conn)?;
        if !data.settings.notifications {
            return Ok(vec![]);
        }
        let now = Local::now().naive_local();
        let mut candidates = Vec::new();
        for t in data.tasks.iter().filter(|t| t.completed_at.is_none()) {
            if let (Some(date), Some(time)) = (&t.due_date, &t.due_time) {
                if let Ok(at) = chrono::NaiveDateTime::parse_from_str(
                    &format!("{date} {time}"),
                    "%Y-%m-%d %H:%M",
                ) {
                    if at <= now && now - at < Duration::days(1) {
                        candidates.push((
                            format!("task:{}:{date}:{time}", t.id),
                            format!("待办提醒：{}", t.title),
                        ));
                    }
                }
            }
        }
        for r in data
            .releases
            .iter()
            .filter(|r| r.status != "released" && r.remind)
        {
            if let Ok(date) = NaiveDate::parse_from_str(&r.date, "%Y-%m-%d") {
                for offset in [1, 0] {
                    let at = (date - Duration::days(offset))
                        .and_hms_opt(9, 0, 0)
                        .unwrap();
                    if at <= now && now - at < Duration::days(1) {
                        let remaining = r.steps.iter().filter(|s| s.required && !s.done).count();
                        candidates.push((
                            format!("release:{}:{}:{offset}", r.id, r.date),
                            format!(
                                "{} {} {}发布，还有 {} 项必做流程",
                                r.project,
                                r.version,
                                if offset == 1 { "明天" } else { "今天" },
                                remaining
                            ),
                        ));
                    }
                }
            }
        }
        let mut pending = Vec::new();
        for candidate in candidates {
            let exists = conn
                .query_row(
                    "SELECT key FROM reminder_log WHERE key = ?1",
                    [&candidate.0],
                    |r| r.get::<_, String>(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .is_some();
            if !exists {
                pending.push(candidate);
            }
        }
        Ok(pending)
    }
    pub fn mark_reminded(&self, key: &str) -> Result<(), String> {
        self.connection
            .lock()
            .map_err(|e| e.to_string())?
            .execute(
                "INSERT OR IGNORE INTO reminder_log(key, sent_at) VALUES (?1, ?2)",
                params![key, model::now()],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

pub fn export(data: &AppData, path: &Path) -> Result<(), String> {
    let backup = Backup {
        format: "ohmytodo-backup".into(),
        version: 1,
        exported_at: model::now(),
        data: data.clone(),
    };
    let bytes = serde_json::to_vec_pretty(&backup).map_err(|e| e.to_string())?;
    atomic_write(&bytes, path)
}

pub fn atomic_write(bytes: &[u8], path: &Path) -> Result<(), String> {
    // Create a sibling temporary file and sync it before replacing the destination.
    let temp = path.with_extension(format!("{}.tmp", model::id()));
    use std::io::Write;
    let mut file = fs::File::create(&temp).map_err(|e| e.to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(&temp, path).map_err(|e| {
        let _ = fs::remove_file(&temp);
        e.to_string()
    })
}

pub fn import(path: &Path) -> Result<AppData, String> {
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > 32 * 1024 * 1024 {
        return Err("备份文件不能超过 32 MB".into());
    }
    let mut backup: Backup = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|_| "这不是有效的待办备份文件".to_string())?;
    if backup.format != "ohmytodo-backup" || backup.version != 1 {
        return Err("不支持的备份格式".into());
    }
    model::migrate(&mut backup.data)?;
    Ok(backup.data)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sqlite_restart_and_restore_are_durable() {
        let dir = std::env::temp_dir().join(format!("ohmytodo-test-{}", model::id()));
        {
            let store = Store::open(dir.clone()).unwrap();
            let mut data = store.get().unwrap();
            data.settings.theme = "dark".into();
            store.replace(data).unwrap();
            export(&store.get().unwrap(), &dir.join("export.json")).unwrap();
            assert_eq!(
                import(&dir.join("export.json")).unwrap().settings.theme,
                "dark"
            );
        }
        assert_eq!(
            Store::open(dir.clone())
                .unwrap()
                .get()
                .unwrap()
                .settings
                .theme,
            "dark"
        );
        // Unique test-owned directory; no production data involved.
        let resolved = dir.canonicalize().unwrap();
        assert!(resolved.starts_with(std::env::temp_dir().canonicalize().unwrap()));
        assert!(resolved
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("ohmytodo-test-"));
        std::fs::remove_dir_all(resolved).unwrap();
    }

    #[test]
    fn concurrent_writes_do_not_lose_entities() {
        let dir = std::env::temp_dir().join(format!("ohmytodo-test-{}", model::id()));
        let store = std::sync::Arc::new(Store::open(dir.clone()).unwrap());
        let workers: Vec<_> = (0..12)
            .map(|index| {
                let shared = store.clone();
                std::thread::spawn(move || {
                    shared
                        .act(Action::UpsertTemplate {
                            template: model::ChecklistTemplate {
                                id: format!("test-{index}"),
                                name: format!("流程 {index}"),
                                steps: vec![],
                            },
                        })
                        .unwrap()
                })
            })
            .collect();
        for worker in workers {
            worker.join().unwrap();
        }
        let data = store.get().unwrap();
        assert_eq!(data.templates.len(), 13);
        assert_eq!(data.revision, 12);
        assert!(store.populate_empty(AppData::default()).is_ok());
        assert_eq!(store.get().unwrap().templates.len(), 13);
        drop(store);
        let resolved = dir.canonicalize().unwrap();
        assert!(resolved.starts_with(std::env::temp_dir().canonicalize().unwrap()));
        assert!(resolved
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("ohmytodo-test-"));
        std::fs::remove_dir_all(resolved).unwrap();
    }
}
