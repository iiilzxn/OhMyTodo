use crate::{model::*, store::Store};
use serde_json::json;

fn mark() -> CalendarMark {
    CalendarMark {
        id: id(),
        title: "休假规划".into(),
        start_date: "2026-09-28".into(),
        end_date: "2026-10-07".into(),
        color: "violet".into(),
        notes: "独立安排".into(),
        created_at: now(),
        updated_at: now(),
    }
}
fn task() -> Task {
    serde_json::from_value(json!({"id":"test-task","title":"保留的待办","notes":"不要改动","category":"work","today":true,"starred":false,"dueDate":null,"dueTime":null,"repeat":"none","items":[],"completedAt":null,"createdAt":now(),"updatedAt":now(),"generatedFrom":null})).unwrap()
}

#[test]
fn calendar_actions_do_not_mutate_todos_or_releases() {
    let mut data = AppData::default();
    data.tasks.push(task());
    let before =
        serde_json::to_value((&data.tasks, &data.releases, &data.templates, &data.settings))
            .unwrap();
    let value = mark();
    let id = value.id.clone();
    let next = apply(
        &data,
        Action::UpsertCalendarMark {
            mark: value,
            expected_updated_at: None,
        },
    )
    .unwrap();
    assert_eq!(
        before,
        serde_json::to_value((&next.tasks, &next.releases, &next.templates, &next.settings))
            .unwrap()
    );
    let updated = next.calendar_marks[0].updated_at.clone();
    let removed = apply(
        &next,
        Action::DeleteCalendarMark {
            id,
            expected_updated_at: updated,
        },
    )
    .unwrap();
    assert!(removed.calendar_marks.is_empty());
    assert_eq!(
        before,
        serde_json::to_value((
            &removed.tasks,
            &removed.releases,
            &removed.templates,
            &removed.settings
        ))
        .unwrap()
    );
}

#[test]
fn invalid_ranges_and_stale_edits_are_rejected_atomically() {
    let data = AppData::default();
    let mut bad = mark();
    bad.end_date = "2026-09-01".into();
    assert!(apply(
        &data,
        Action::UpsertCalendarMark {
            mark: bad,
            expected_updated_at: None
        }
    )
    .is_err());
    let mut bad = mark();
    bad.start_date = "2026-02-30".into();
    assert!(apply(
        &data,
        Action::UpsertCalendarMark {
            mark: bad,
            expected_updated_at: None
        }
    )
    .is_err());
    let mut bad = mark();
    bad.color = "url(x)".into();
    assert!(apply(
        &data,
        Action::UpsertCalendarMark {
            mark: bad,
            expected_updated_at: None
        }
    )
    .is_err());
    let next = apply(
        &data,
        Action::UpsertCalendarMark {
            mark: mark(),
            expected_updated_at: None,
        },
    )
    .unwrap();
    let mut draft = next.calendar_marks[0].clone();
    draft.title = "过期的编辑".into();
    assert!(apply(
        &next,
        Action::UpsertCalendarMark {
            mark: draft,
            expected_updated_at: Some("old-version".into())
        }
    )
    .is_err());
    assert_eq!(next.calendar_marks[0].title, "休假规划");
}

#[test]
fn legacy_database_migrates_with_backup_and_preserves_independent_marks() {
    let dir = std::env::temp_dir().join(format!("ohmytodo-test-{}", id()));
    {
        let store = Store::open(dir.clone()).unwrap();
        let mut old = AppData::default();
        old.tasks.push(task());
        let mut raw = serde_json::to_value(old).unwrap();
        raw["schemaVersion"] = json!(1);
        raw.as_object_mut().unwrap().remove("calendarMarks");
        store
            .connection
            .lock()
            .unwrap()
            .execute("UPDATE app_state SET data=?1 WHERE id=1", [raw.to_string()])
            .unwrap();
    }
    {
        let store = Store::open(dir.clone()).unwrap();
        let current = store.get().unwrap();
        assert_eq!(current.schema_version, 2);
        assert_eq!(current.tasks.len(), 1);
        assert!(current.calendar_marks.is_empty());
        assert!(std::fs::read_dir(dir.join("backups")).unwrap().any(|e| e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("before-calendar-upgrade-")));
        let next = store
            .act(Action::UpsertCalendarMark {
                mark: mark(),
                expected_updated_at: None,
            })
            .unwrap();
        crate::store::export(&next, &dir.join("new.json")).unwrap();
        assert_eq!(
            crate::store::import(&dir.join("new.json"))
                .unwrap()
                .calendar_marks
                .len(),
            1
        );
        store
            .act(Action::DeleteTask {
                id: "test-task".into(),
            })
            .unwrap();
        store.populate_empty(AppData::default()).unwrap();
        assert_eq!(store.get().unwrap().calendar_marks.len(), 1);
    }
    let resolved = dir.canonicalize().unwrap();
    assert!(resolved.starts_with(std::env::temp_dir().canonicalize().unwrap()));
    assert!(resolved
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with("ohmytodo-test-"));
    std::fs::remove_dir_all(resolved).unwrap();
}
