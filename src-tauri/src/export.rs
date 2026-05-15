// 导出服务。Plan Task 8.4 / spec search-export-settings。
//
// Markdown 导出：把 note 的 title/正文/标签/创建时间/更新时间渲染成
// `.md` 文件并写盘。失败时不动原数据，向调用方返回 io::Error。
//
// PDF 导出：MVP 没有跨平台 PDF 排版器；这里返回 ExportError::PdfUnavailable，
// 让前端展示"请使用浏览器打印/外部工具"提示。未来可在此切到 wkhtmltopdf /
// chromiumoxide / 系统 print API 适配器。
//
// 输出路径策略（避免引入 tauri-plugin-dialog 依赖）：
// commands.rs 在调用本模块时把 `<data_dir>/exports/` 作为 base dir，
// 文件名由 sanitize_title(note) + 短 id 拼成。
// 前端只需要拿到返回的完整路径展示给用户。

use std::path::{Path, PathBuf};

use crate::models::Note;

#[derive(Debug, thiserror::Error)]
pub enum ExportError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error(
        "PDF 适配器在当前平台不可用：MVP 仅支持 Markdown 导出，PDF 请通过浏览器打印或外部工具完成。"
    )]
    PdfUnavailable,
}

pub fn export_markdown(note: &Note, output_path: &Path) -> Result<(), ExportError> {
    let body = render_markdown(note);
    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(output_path, body)?;
    Ok(())
}

pub fn export_html(note: &Note, output_path: &Path) -> Result<(), ExportError> {
    let body = render_html(note);
    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(output_path, body)?;
    Ok(())
}

#[allow(dead_code)]
pub fn export_pdf(_note: &Note, _output_path: &Path) -> Result<(), ExportError> {
    Err(ExportError::PdfUnavailable)
}

/// 根据 note 标题构造一个安全文件名（去掉 OS 不允许的字符），加上短 id
/// 避免重名覆盖。后缀由调用方追加（".md" / ".pdf"）。
pub fn default_filename(note: &Note) -> String {
    let mut base = sanitize_title(&note.title);
    if base.is_empty() {
        base = "untitled".to_string();
    }
    let short_id = note.id.chars().take(8).collect::<String>();
    format!("{base}-{short_id}")
}

fn sanitize_title(title: &str) -> String {
    // Windows 保留字符：< > : " / \ | ? *
    // 同时去掉控制字符；连续空白折叠为 _，避免 shell 不友好。
    let mut out = String::with_capacity(title.len());
    for c in title.chars() {
        if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
            continue;
        }
        if c.is_control() {
            continue;
        }
        if c.is_whitespace() {
            out.push('_');
            continue;
        }
        out.push(c);
    }
    let trimmed = out.trim_matches(|c: char| c == '.' || c == '_').to_string();
    trimmed.chars().take(48).collect()
}

/// 构造 `<exports_dir>/<filename>.<ext>` 完整路径。
pub fn build_output_path(exports_dir: &Path, note: &Note, ext: &str) -> PathBuf {
    exports_dir.join(format!("{}.{ext}", default_filename(note)))
}

/// 生成包含 frontmatter（标题/标签/时间）+ 正文的 Markdown 文档。
/// frontmatter 用 YAML 风格，便于第三方工具识别。
fn render_markdown(note: &Note) -> String {
    let mut buf = String::new();
    buf.push_str("---\n");
    buf.push_str(&format!("title: {}\n", yaml_escape(&note.title)));
    if !note.tags.is_empty() {
        buf.push_str("tags:\n");
        for t in &note.tags {
            buf.push_str(&format!("  - {}\n", yaml_escape(t)));
        }
    }
    buf.push_str(&format!("createdAt: {}\n", note.created_at));
    buf.push_str(&format!("updatedAt: {}\n", note.updated_at));
    buf.push_str("---\n\n");
    if !note.title.is_empty() {
        buf.push_str(&format!("# {}\n\n", note.title));
    }
    buf.push_str(&note.content);
    if !note.content.ends_with('\n') {
        buf.push('\n');
    }
    buf
}

fn render_html(note: &Note) -> String {
    let title = html_escape(&note.title);
    format!(
        "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>{title}</title>\n<style>body{{font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;line-height:1.65;max-width:760px;margin:40px auto;padding:0 20px;color:#242424;}}main{{display:block;}}</style>\n</head>\n<body>\n<main>\n<h1>{title}</h1>\n{}\n</main>\n</body>\n</html>\n",
        note.html_content
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// YAML scalar 简易转义：含特殊字符时加双引号并转义反斜杠/引号。
fn yaml_escape(s: &str) -> String {
    let needs_quote = s
        .chars()
        .any(|c| matches!(c, ':' | '#' | '"' | '\'' | '\n' | '\r' | '\t'));
    if !needs_quote && !s.is_empty() && !s.starts_with(' ') && !s.ends_with(' ') {
        return s.to_string();
    }
    let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Note;

    fn make_note() -> Note {
        Note {
            id: "abcdef1234567890".into(),
            title: "笔记标题".into(),
            content: "正文一\n正文二".into(),
            html_content: "<p>...</p>".into(),
            tags: vec!["rust".into(), "笔记".into()],
            is_pinned: false,
            pinned_window_config: None,
            canvas_position: None,
            created_at: "2026-05-01T10:00:00Z".into(),
            updated_at: "2026-05-12T12:00:00Z".into(),
            word_count: 6,
        }
    }

    #[test]
    fn render_markdown_includes_frontmatter_and_body() {
        let md = render_markdown(&make_note());
        assert!(md.starts_with("---\n"));
        assert!(md.contains("title: 笔记标题"));
        assert!(md.contains("- rust"));
        assert!(md.contains("- 笔记"));
        assert!(md.contains("createdAt: 2026-05-01T10:00:00Z"));
        assert!(md.contains("updatedAt: 2026-05-12T12:00:00Z"));
        assert!(md.contains("# 笔记标题"));
        assert!(md.contains("正文一\n正文二"));
        assert!(md.ends_with('\n'));
    }

    #[test]
    fn export_markdown_writes_file() {
        let tmp = std::env::temp_dir().join(format!("steno-export-{}.md", uuid::Uuid::new_v4()));
        export_markdown(&make_note(), &tmp).expect("write");
        let content = std::fs::read_to_string(&tmp).expect("read");
        assert!(content.contains("笔记标题"));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn export_html_writes_full_html_document() {
        let tmp = std::env::temp_dir().join(format!("steno-export-{}.html", uuid::Uuid::new_v4()));
        export_html(&make_note(), &tmp).expect("write html");
        let content = std::fs::read_to_string(&tmp).expect("read html");
        assert!(content.contains("<!doctype html>"));
        assert!(content.contains("<title>笔记标题</title>"));
        assert!(content.contains("<main>"));
        assert!(content.contains("<p>...</p>"));
        assert!(content.contains("</html>"));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn export_pdf_reports_unavailable() {
        let res = export_pdf(&make_note(), Path::new("/tmp/x.pdf"));
        assert!(matches!(res, Err(ExportError::PdfUnavailable)));
    }

    #[test]
    fn yaml_escape_handles_special_chars() {
        assert_eq!(yaml_escape("hello"), "hello");
        assert_eq!(yaml_escape("has: colon"), "\"has: colon\"");
        assert_eq!(yaml_escape("has \"quote\""), "\"has \\\"quote\\\"\"");
    }

    #[test]
    fn sanitize_title_strips_reserved_chars() {
        assert_eq!(sanitize_title("a/b\\c:d*e"), "abcde");
        assert_eq!(sanitize_title("  hello world  "), "hello_world");
        assert_eq!(sanitize_title("中文 标题"), "中文_标题");
    }

    #[test]
    fn default_filename_combines_title_and_short_id() {
        let name = default_filename(&make_note());
        assert_eq!(name, "笔记标题-abcdef12");
    }

    #[test]
    fn default_filename_falls_back_to_untitled() {
        let mut note = make_note();
        note.title = "".to_string();
        let name = default_filename(&note);
        assert!(name.starts_with("untitled-"));
    }

    #[test]
    fn build_output_path_joins_dir_and_filename() {
        let path = build_output_path(Path::new("/tmp/exports"), &make_note(), "md");
        assert_eq!(
            path.file_name().and_then(|s| s.to_str()),
            Some("笔记标题-abcdef12.md")
        );
        assert_eq!(path.parent(), Some(Path::new("/tmp/exports")));
    }
}
