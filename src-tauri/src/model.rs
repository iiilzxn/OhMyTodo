use chrono::{Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use uuid::Uuid;

pub fn now() -> String {
    Local::now().to_rfc3339()
}
pub fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}
pub fn id() -> String {
    Uuid::new_v4().to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CheckItem {
    pub id: String,
    pub title: String,
    pub done: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub notes: String,
    pub category: String,
    pub today: bool,
    pub starred: bool,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub repeat: String,
    pub items: Vec<CheckItem>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub generated_from: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Feature {
    pub id: String,
    pub title: String,
    pub notes: String,
    pub items: Vec<CheckItem>,
    pub accepted: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseStep {
    pub id: String,
    pub title: String,
    pub done: bool,
    pub required: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub id: String,
    pub project: String,
    pub version: String,
    pub date: String,
    pub notes: String,
    pub features: Vec<Feature>,
    pub steps: Vec<ReleaseStep>,
    pub status: String,
    pub remind: bool,
    pub created_at: String,
    pub released_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistTemplate {
    pub id: String,
    pub name: String,
    pub steps: Vec<ReleaseStep>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub notifications: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    pub schema_version: u32,
    pub revision: u64,
    pub tasks: Vec<Task>,
    pub releases: Vec<Release>,
    pub templates: Vec<ChecklistTemplate>,
    pub settings: Settings,
    #[serde(default)]
    pub calendar_marks: Vec<CalendarMark>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarMark {
    pub id: String,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub color: String,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn default_steps() -> Vec<ReleaseStep> {
    [
        "确认功能验收完成",
        "更新版本号与发布说明",
        "运行回归测试",
        "构建并验证安装包",
        "上传安装包并发布版本",
        "下载与启动冒烟验证",
    ]
    .iter()
    .map(|title| ReleaseStep {
        id: id(),
        title: title.to_string(),
        done: false,
        required: true,
    })
    .collect()
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            schema_version: 2,
            revision: 0,
            tasks: vec![],
            releases: vec![],
            calendar_marks: vec![],
            templates: vec![ChecklistTemplate {
                id: "desktop-release".into(),
                name: "桌面应用发布".into(),
                steps: default_steps(),
            }],
            settings: Settings {
                theme: "system".into(),
                notifications: true,
            },
        }
    }
}

fn title(value: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.chars().count() > 200 {
        Err("名称不能为空，且最多 200 个字符".into())
    } else {
        Ok(())
    }
}
fn date(value: &str) -> Result<(), String> {
    if value.len() != 10 || NaiveDate::parse_from_str(value, "%Y-%m-%d").is_err() {
        Err("日期格式不正确".into())
    } else {
        Ok(())
    }
}
fn unique<'a>(ids: impl Iterator<Item = &'a String>) -> Result<(), String> {
    let mut seen = HashSet::new();
    for id in ids {
        if id.is_empty() || id.len() > 128 || !seen.insert(id) {
            return Err("数据中存在无效或重复的标识".into());
        }
    }
    Ok(())
}
fn items(values: &[CheckItem]) -> Result<(), String> {
    if values.len() > 1000 {
        return Err("子项数量过多".into());
    }
    unique(values.iter().map(|x| &x.id))?;
    for x in values {
        title(&x.title)?;
    }
    Ok(())
}
pub fn validate(data: &AppData) -> Result<(), String> {
    if data.schema_version != 2 {
        return Err("备份版本不兼容".into());
    }
    if data.tasks.len() > 20000 || data.releases.len() > 2000 || data.templates.len() > 100 {
        return Err("数据数量超出上限".into());
    }
    unique(data.tasks.iter().map(|x| &x.id))?;
    unique(data.releases.iter().map(|x| &x.id))?;
    unique(data.templates.iter().map(|x| &x.id))?;
    if data.calendar_marks.len() > 20000 {
        return Err("日历标记数量超出上限".into());
    }
    unique(data.calendar_marks.iter().map(|x| &x.id))?;
    for mark in &data.calendar_marks {
        title(&mark.title)?;
        date(&mark.start_date)?;
        date(&mark.end_date)?;
        let start = NaiveDate::parse_from_str(&mark.start_date, "%Y-%m-%d").unwrap();
        let end = NaiveDate::parse_from_str(&mark.end_date, "%Y-%m-%d").unwrap();
        if start > end || (end - start).num_days() > 3659 {
            return Err("结束日期不能早于开始日期，单个标记最长 3660 天".into());
        }
        if mark.start_date.as_str() < "1900-01-01" || mark.end_date.as_str() > "2100-12-31" {
            return Err("日历支持 1900 至 2100 年".into());
        }
        if !["blue", "green", "amber", "rose", "violet", "cyan"].contains(&mark.color.as_str())
            || mark.notes.len() > 100_000
        {
            return Err("日历标记颜色无效或备注过长".into());
        }
        if chrono::DateTime::parse_from_rfc3339(&mark.created_at).is_err()
            || chrono::DateTime::parse_from_rfc3339(&mark.updated_at).is_err()
        {
            return Err("日历标记时间格式无效".into());
        }
    }
    if !["light", "dark", "system"].contains(&data.settings.theme.as_str()) {
        return Err("主题设置无效".into());
    }
    for t in &data.tasks {
        title(&t.title)?;
        items(&t.items)?;
        if t.notes.len() > 100_000 {
            return Err("备注过长".into());
        }
        if !["work", "life"].contains(&t.category.as_str())
            || !["none", "daily", "weekly"].contains(&t.repeat.as_str())
        {
            return Err("任务设置无效".into());
        }
        if let Some(d) = &t.due_date {
            date(d)?;
        }
        if let Some(time) = &t.due_time {
            if t.due_date.is_none()
                || time.len() != 5
                || chrono::NaiveTime::parse_from_str(time, "%H:%M").is_err()
            {
                return Err("提醒时间需要有效的日期和时间".into());
            }
        }
    }
    for r in &data.releases {
        title(&r.project)?;
        title(&r.version)?;
        date(&r.date)?;
        if r.notes.len() > 100_000 || r.features.len() > 1000 || r.steps.len() > 1000 {
            return Err("发布计划过大".into());
        }
        if !["planned", "released"].contains(&r.status.as_str()) {
            return Err("发布状态无效".into());
        }
        unique(r.features.iter().map(|x| &x.id))?;
        unique(r.steps.iter().map(|x| &x.id))?;
        for f in &r.features {
            title(&f.title)?;
            items(&f.items)?;
            if f.notes.len() > 100_000 {
                return Err("备注过长".into());
            }
            if f.accepted && f.items.iter().any(|x| !x.done) {
                return Err("请先完成所有功能子项，再确认验收".into());
            }
        }
        for s in &r.steps {
            title(&s.title)?;
        }
        if r.status == "released" && !release_ready(r) {
            return Err("还有未验收的 Feature 或未完成的必做流程".into());
        }
    }
    for t in &data.templates {
        title(&t.name)?;
        unique(t.steps.iter().map(|x| &x.id))?;
        if t.steps.len() > 1000 {
            return Err("模板步骤过多".into());
        }
        for s in &t.steps {
            title(&s.title)?;
        }
    }
    Ok(())
}

pub fn migrate(data: &mut AppData) -> Result<bool, String> {
    match data.schema_version {
        1 => {
            data.schema_version = 2;
            validate(data)?;
            Ok(true)
        }
        2 => {
            validate(data)?;
            Ok(false)
        }
        _ => Err("数据版本不兼容，请使用匹配或更新版本的应用".into()),
    }
}

pub fn release_ready(r: &Release) -> bool {
    r.features.iter().all(|x| x.accepted) && r.steps.iter().filter(|x| x.required).all(|x| x.done)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Action {
    UpsertCalendarMark {
        mark: CalendarMark,
        expected_updated_at: Option<String>,
    },
    DeleteCalendarMark {
        id: String,
        expected_updated_at: String,
    },
    AddTask {
        task: Task,
    },
    UpdateTask {
        id: String,
        patch: Value,
    },
    ToggleTask {
        id: String,
    },
    DeleteTask {
        id: String,
    },
    ToggleTaskItem {
        id: String,
        item_id: String,
    },
    AddRelease {
        release: Release,
    },
    UpdateRelease {
        id: String,
        patch: Value,
    },
    DeleteRelease {
        id: String,
    },
    UpsertFeature {
        release_id: String,
        feature: Feature,
    },
    RemoveFeature {
        release_id: String,
        feature_id: String,
    },
    ToggleFeatureItem {
        release_id: String,
        feature_id: String,
        item_id: String,
    },
    ToggleFeatureAccepted {
        release_id: String,
        feature_id: String,
    },
    ToggleReleaseStep {
        release_id: String,
        step_id: String,
    },
    ReleaseStatus {
        id: String,
        status: String,
    },
    SetSettings {
        settings: Settings,
    },
    UpsertTemplate {
        template: ChecklistTemplate,
    },
    DeleteTemplate {
        id: String,
    },
}

fn patch<T: Serialize + for<'de> Deserialize<'de>>(
    item: &mut T,
    value: Value,
    allowed: &[&str],
) -> Result<(), String> {
    let mut current = serde_json::to_value(&item).map_err(|e| e.to_string())?;
    let changes = value.as_object().ok_or("修改内容无效")?;
    for (key, value) in changes {
        if !allowed.contains(&key.as_str()) {
            return Err(format!("不允许修改字段：{key}"));
        }
        current[key] = value.clone();
    }
    *item = serde_json::from_value(current).map_err(|e| e.to_string())?;
    Ok(())
}
fn release_mut<'a>(data: &'a mut AppData, id: &str) -> Result<&'a mut Release, String> {
    let r = data
        .releases
        .iter_mut()
        .find(|x| x.id == id)
        .ok_or("发布计划不存在")?;
    if r.status == "released" {
        return Err("请先重新打开这个已发布版本，再修改内容".into());
    }
    Ok(r)
}

// Work on a copy: callers never observe a partially applied invalid action.
fn preserve_item_progress(proposed: &mut [CheckItem], current: &[CheckItem]) {
    for item in proposed {
        item.done = current
            .iter()
            .find(|old| old.id == item.id && old.title == item.title)
            .is_some_and(|old| old.done);
    }
}

pub fn apply(data: &AppData, action: Action) -> Result<AppData, String> {
    let mut next = data.clone();
    match action {
        Action::UpsertCalendarMark {
            mut mark,
            expected_updated_at,
        } => {
            mark.title = mark.title.trim().into();
            mark.updated_at = now();
            if let Some(current) = next.calendar_marks.iter_mut().find(|m| m.id == mark.id) {
                if expected_updated_at.as_deref() != Some(&current.updated_at) {
                    return Err("这条日历标记已在另一窗口修改，请重新打开后再保存".into());
                }
                mark.created_at = current.created_at.clone();
                *current = mark;
            } else {
                if expected_updated_at.is_some() {
                    return Err("这条日历标记已删除，请重新创建".into());
                }
                next.calendar_marks.push(mark);
            }
        }
        Action::DeleteCalendarMark {
            id,
            expected_updated_at,
        } => {
            let current = next
                .calendar_marks
                .iter()
                .find(|m| m.id == id)
                .ok_or("日历标记已不存在")?;
            if current.updated_at != expected_updated_at {
                return Err("日历标记已更改，请重新查看后再删除".into());
            }
            next.calendar_marks.retain(|m| m.id != id);
        }
        Action::AddTask { mut task } => {
            task.title = task.title.trim().into();
            next.tasks.push(task);
        }
        Action::UpdateTask { id, patch: changes } => {
            let t = next
                .tasks
                .iter_mut()
                .find(|x| x.id == id)
                .ok_or("待办不存在")?;
            let old_items = changes.get("items").map(|_| t.items.clone());
            patch(
                t,
                changes,
                &[
                    "title", "notes", "category", "today", "starred", "dueDate", "dueTime",
                    "repeat", "items",
                ],
            )?;
            if let Some(old) = old_items {
                preserve_item_progress(&mut t.items, &old);
            }
            t.title = t.title.trim().into();
            t.updated_at = now();
        }
        Action::ToggleTask { id: task_id } => {
            let index = next
                .tasks
                .iter()
                .position(|x| x.id == task_id)
                .ok_or("待办不存在")?;
            let was_done = next.tasks[index].completed_at.is_some();
            next.tasks[index].completed_at = if was_done { None } else { Some(now()) };
            next.tasks[index].updated_at = now();
            if was_done {
                next.tasks.retain(|x| {
                    !(x.generated_from.as_deref() == Some(&task_id)
                        && x.completed_at.is_none()
                        && x.created_at == x.updated_at)
                });
            } else if next.tasks[index].repeat != "none"
                && !next
                    .tasks
                    .iter()
                    .any(|x| x.generated_from.as_deref() == Some(&task_id))
            {
                let mut upcoming = next.tasks[index].clone();
                let baseline = upcoming
                    .due_date
                    .as_deref()
                    .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
                    .unwrap_or(Local::now().date_naive())
                    .max(Local::now().date_naive());
                upcoming.id = id();
                upcoming.generated_from = Some(task_id);
                upcoming.completed_at = None;
                upcoming.today = false;
                upcoming.due_date = Some(
                    (baseline + Duration::days(if upcoming.repeat == "weekly" { 7 } else { 1 }))
                        .to_string(),
                );
                upcoming.items.iter_mut().for_each(|i| {
                    i.id = id();
                    i.done = false;
                });
                upcoming.created_at = now();
                upcoming.updated_at = upcoming.created_at.clone();
                next.tasks.push(upcoming);
            }
        }
        Action::DeleteTask { id } => {
            next.tasks.retain(|x| x.id != id);
        }
        Action::ToggleTaskItem { id, item_id } => {
            let t = next
                .tasks
                .iter_mut()
                .find(|x| x.id == id)
                .ok_or("待办不存在")?;
            let item = t
                .items
                .iter_mut()
                .find(|x| x.id == item_id)
                .ok_or("子项不存在")?;
            item.done = !item.done;
            t.updated_at = now();
        }
        Action::AddRelease { release } => next.releases.push(release),
        Action::UpdateRelease { id, patch: changes } => {
            let r = release_mut(&mut next, &id)?;
            let old_steps = changes.get("steps").map(|_| r.steps.clone());
            patch(
                r,
                changes,
                &["project", "version", "date", "notes", "steps", "remind"],
            )?;
            if let Some(old) = old_steps {
                for step in &mut r.steps {
                    step.done = old
                        .iter()
                        .find(|s| s.id == step.id && s.title == step.title)
                        .is_some_and(|s| s.done);
                }
            }
        }
        Action::DeleteRelease { id } => {
            next.releases.retain(|x| x.id != id);
        }
        Action::UpsertFeature {
            release_id,
            mut feature,
        } => {
            let r = release_mut(&mut next, &release_id)?;
            feature.title = feature.title.trim().into();
            if let Some(f) = r.features.iter_mut().find(|x| x.id == feature.id) {
                preserve_item_progress(&mut feature.items, &f.items);
                feature.accepted = f.accepted
                    && f.title == feature.title
                    && f.notes == feature.notes
                    && f.items == feature.items;
                *f = feature;
            } else {
                feature.accepted = false;
                r.features.push(feature);
            }
        }
        Action::RemoveFeature {
            release_id,
            feature_id,
        } => {
            release_mut(&mut next, &release_id)?
                .features
                .retain(|x| x.id != feature_id);
        }
        Action::ToggleFeatureItem {
            release_id,
            feature_id,
            item_id,
        } => {
            let f = release_mut(&mut next, &release_id)?
                .features
                .iter_mut()
                .find(|x| x.id == feature_id)
                .ok_or("Feature 不存在")?;
            let item = f
                .items
                .iter_mut()
                .find(|x| x.id == item_id)
                .ok_or("功能子项不存在")?;
            item.done = !item.done;
            f.accepted = false;
        }
        Action::ToggleFeatureAccepted {
            release_id,
            feature_id,
        } => {
            let f = release_mut(&mut next, &release_id)?
                .features
                .iter_mut()
                .find(|x| x.id == feature_id)
                .ok_or("Feature 不存在")?;
            if !f.accepted && f.items.iter().any(|x| !x.done) {
                return Err("请先完成所有功能子项，再确认验收".into());
            }
            f.accepted = !f.accepted;
        }
        Action::ToggleReleaseStep {
            release_id,
            step_id,
        } => {
            let s = release_mut(&mut next, &release_id)?
                .steps
                .iter_mut()
                .find(|x| x.id == step_id)
                .ok_or("流程步骤不存在")?;
            s.done = !s.done;
        }
        Action::ReleaseStatus { id, status } => {
            let r = next
                .releases
                .iter_mut()
                .find(|x| x.id == id)
                .ok_or("发布计划不存在")?;
            if status == "released" && !release_ready(r) {
                return Err("请先验收全部 Feature，并完成所有必做流程".into());
            }
            r.status = status;
            r.released_at = if r.status == "released" {
                Some(now())
            } else {
                None
            };
        }
        Action::SetSettings { settings } => next.settings = settings,
        Action::UpsertTemplate { template } => {
            if let Some(current) = next.templates.iter_mut().find(|t| t.id == template.id) {
                *current = template;
            } else {
                next.templates.push(template);
            }
        }
        Action::DeleteTemplate { id } => next.templates.retain(|t| t.id != id),
    }
    validate(&next)?;
    next.revision = data.revision + 1;
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn task() -> Task {
        Task {
            id: id(),
            title: "待办".into(),
            notes: "".into(),
            category: "work".into(),
            today: true,
            starred: false,
            due_date: None,
            due_time: None,
            repeat: "none".into(),
            items: vec![],
            completed_at: None,
            created_at: now(),
            updated_at: now(),
            generated_from: None,
        }
    }
    fn release() -> Release {
        Release {
            id: id(),
            project: "NoteDesk".into(),
            version: "v1.0".into(),
            date: today(),
            notes: "".into(),
            features: vec![Feature {
                id: "f".into(),
                title: "搜索".into(),
                notes: "".into(),
                items: vec![CheckItem {
                    id: "i".into(),
                    title: "验收".into(),
                    done: false,
                }],
                accepted: false,
            }],
            steps: vec![ReleaseStep {
                id: "s".into(),
                title: "发布".into(),
                done: false,
                required: true,
            }],
            status: "planned".into(),
            remind: false,
            created_at: now(),
            released_at: None,
        }
    }
    #[test]
    fn incomplete_release_is_blocked() {
        let r = release();
        let rid = r.id.clone();
        let mut d = AppData::default();
        d.releases.push(r);
        assert!(apply(
            &d,
            Action::ReleaseStatus {
                id: rid.clone(),
                status: "released".into()
            }
        )
        .is_err());
        d = apply(
            &d,
            Action::ToggleFeatureItem {
                release_id: rid.clone(),
                feature_id: "f".into(),
                item_id: "i".into(),
            },
        )
        .unwrap();
        assert!(!release_ready(&d.releases[0]));
        d = apply(
            &d,
            Action::ToggleFeatureAccepted {
                release_id: rid.clone(),
                feature_id: "f".into(),
            },
        )
        .unwrap();
        d = apply(
            &d,
            Action::ToggleReleaseStep {
                release_id: rid.clone(),
                step_id: "s".into(),
            },
        )
        .unwrap();
        d = apply(
            &d,
            Action::ReleaseStatus {
                id: rid.clone(),
                status: "released".into(),
            },
        )
        .unwrap();
        assert!(apply(
            &d,
            Action::ToggleReleaseStep {
                release_id: rid,
                step_id: "s".into()
            }
        )
        .is_err());
    }
    #[test]
    fn edits_invalidate_acceptance() {
        let mut r = release();
        r.features[0].items[0].done = true;
        r.features[0].accepted = true;
        let mut d = AppData::default();
        let rid = r.id.clone();
        let mut feature = r.features[0].clone();
        feature.title = "修改搜索".into();
        d.releases.push(r);
        d = apply(
            &d,
            Action::UpsertFeature {
                release_id: rid,
                feature,
            },
        )
        .unwrap();
        assert!(!d.releases[0].features[0].accepted);
    }
    #[test]
    fn repeat_completion_and_undo() {
        let mut t = task();
        t.repeat = "weekly".into();
        let tid = t.id.clone();
        let d = apply(&AppData::default(), Action::AddTask { task: t }).unwrap();
        let d = apply(&d, Action::ToggleTask { id: tid.clone() }).unwrap();
        assert_eq!(d.tasks.len(), 2);
        assert_eq!(
            d.tasks[1].due_date.as_deref(),
            Some(
                (Local::now().date_naive() + Duration::days(7))
                    .to_string()
                    .as_str()
            )
        );
        let d = apply(&d, Action::ToggleTask { id: tid }).unwrap();
        assert_eq!(d.tasks.len(), 1);
        assert!(d.tasks[0].completed_at.is_none());
    }
    #[test]
    fn invalid_changes_are_atomic() {
        let t = task();
        let tid = t.id.clone();
        let d = apply(&AppData::default(), Action::AddTask { task: t }).unwrap();
        assert!(apply(
            &d,
            Action::UpdateTask {
                id: tid,
                patch: serde_json::json!({"title":""})
            }
        )
        .is_err());
        assert_eq!(d.tasks[0].title, "待办");
        let mut corrupt = d.clone();
        corrupt.tasks.push(d.tasks[0].clone());
        assert!(validate(&corrupt).is_err());
    }
    #[test]
    fn non_required_steps_do_not_block() {
        let mut r = release();
        r.features.clear();
        r.steps[0].required = false;
        assert!(release_ready(&r));
    }

    #[test]
    fn stale_editor_preserves_live_checkbox_progress() {
        let r = release();
        let rid = r.id.clone();
        let stale_steps = r.steps.clone();
        let mut stale_feature = r.features[0].clone();
        let mut data = AppData::default();
        data.releases.push(r);
        data = apply(
            &data,
            Action::ToggleFeatureItem {
                release_id: rid.clone(),
                feature_id: "f".into(),
                item_id: "i".into(),
            },
        )
        .unwrap();
        data = apply(
            &data,
            Action::ToggleReleaseStep {
                release_id: rid.clone(),
                step_id: "s".into(),
            },
        )
        .unwrap();
        stale_feature.notes = "主窗口仍在编辑".into();
        data = apply(
            &data,
            Action::UpsertFeature {
                release_id: rid.clone(),
                feature: stale_feature,
            },
        )
        .unwrap();
        data = apply(
            &data,
            Action::UpdateRelease {
                id: rid,
                patch: serde_json::json!({ "steps": stale_steps, "notes": "保存其他修改" }),
            },
        )
        .unwrap();
        assert!(data.releases[0].features[0].items[0].done);
        assert!(data.releases[0].steps[0].done);
        let mut t = task();
        let tid = t.id.clone();
        t.items.push(CheckItem {
            id: "child".into(),
            title: "子任务".into(),
            done: false,
        });
        let old_items = t.items.clone();
        data = apply(&data, Action::AddTask { task: t }).unwrap();
        data = apply(
            &data,
            Action::ToggleTaskItem {
                id: tid.clone(),
                item_id: "child".into(),
            },
        )
        .unwrap();
        data = apply(
            &data,
            Action::UpdateTask {
                id: tid,
                patch: serde_json::json!({ "items": old_items, "notes": "并发编辑" }),
            },
        )
        .unwrap();
        assert!(data.tasks[0].items[0].done);
    }
}
