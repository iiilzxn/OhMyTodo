use crate::model::CalendarMark;
use chrono::{Duration, NaiveDate, Utc};

fn escape(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\n', "\\n")
        .replace(';', "\\;")
        .replace(',', "\\,")
}
fn fold(text: &str) -> String {
    let mut result = String::new();
    let mut bytes = 0;
    for ch in text.chars() {
        let n = ch.len_utf8();
        if bytes + n > 75 {
            result.push_str("\r\n ");
            bytes = 1;
        }
        result.push(ch);
        bytes += n;
    }
    result
}
pub fn icalendar(marks: &[CalendarMark]) -> Result<String, String> {
    let mut lines = vec![
        "BEGIN:VCALENDAR".into(),
        "VERSION:2.0".into(),
        "PRODID:-//OhMyTodo//Independent Calendar//ZH-CN".into(),
        "CALSCALE:GREGORIAN".into(),
        "X-WR-CALNAME:我的规划日历".into(),
    ];
    for mark in marks {
        let start =
            NaiveDate::parse_from_str(&mark.start_date, "%Y-%m-%d").map_err(|e| e.to_string())?;
        let end = NaiveDate::parse_from_str(&mark.end_date, "%Y-%m-%d")
            .map_err(|e| e.to_string())?
            + Duration::days(1);
        lines.extend([
            "BEGIN:VEVENT".into(),
            format!("UID:{}@ohmytodo.local", escape(&mark.id)),
            format!("DTSTAMP:{}", Utc::now().format("%Y%m%dT%H%M%SZ")),
            format!("DTSTART;VALUE=DATE:{}", start.format("%Y%m%d")),
            format!("DTEND;VALUE=DATE:{}", end.format("%Y%m%d")),
            format!("SUMMARY:{}", escape(&mark.title)),
            format!("DESCRIPTION:{}", escape(&mark.notes)),
            "TRANSP:TRANSPARENT".into(),
            "END:VEVENT".into(),
        ]);
    }
    lines.push("END:VCALENDAR".into());
    Ok(lines
        .iter()
        .map(|line| fold(line))
        .collect::<Vec<_>>()
        .join("\r\n")
        + "\r\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_day_export_has_exclusive_end_and_safe_unicode_lines() {
        let mark = CalendarMark {
            id: "test".into(),
            title: "出差规划，上海;总结".repeat(10),
            start_date: "2026-09-28".into(),
            end_date: "2026-10-07".into(),
            color: "blue".into(),
            notes: "第一行\n第二行,注意\\备份".into(),
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        let text = icalendar(&[mark]).unwrap();
        assert!(text.contains("DTSTART;VALUE=DATE:20260928\r\n"));
        assert!(text.contains("DTEND;VALUE=DATE:20261008\r\n"));
        assert!(text.lines().all(|line| line.len() <= 75));
        assert!(text.contains("\\n第二行\\,注意\\\\备份"));
        assert!(!text.contains("BEGIN:VTODO"));
    }
}
