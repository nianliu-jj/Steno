//! 笔记导出服务。
//!
//! ## 导出格式
//! - **Markdown**：含 YAML frontmatter（标题/标签/时间）+ 正文，写 `.md` 文件
//! - **HTML**：独立 HTML 文档（内联样式 + `pulldown-cmark` 渲染的 body）
//! - **PDF**：MVP 不支持 — 返回 `ExportError::PdfUnavailable`，
//!   前端展示"请使用浏览器打印/外部工具"提示
//!
//! ## 输出路径策略
//! `commands.rs` 把 `<data_dir>/exports/` 作为 base dir，
//! 文件名由 `sanitize_title(note) + 短 id` 拼成。
//! 前端只需拿到返回的完整路径展示给用户。
//!
//! ## 错误处理
//! 导出失败时不动原数据，仅向调用方返回 `io::Error` / `ExportError`。

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use base64::Engine;

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

/// 把笔记导出成自包含文件夹：`<bundle_dir>/<filename>.md` + `<bundle_dir>/assets/<图片>`。
///
/// 正文中引用的本地图片（`steno-asset:` 协议、`~/.steno/`、`file://`、本地绝对路径）会被
/// 复制进 `assets/` 并把引用改成相对路径；`data:` 内联与 `http(s)` 外链原样保留。
/// 返回写入的 `.md` 文件完整路径。
pub fn export_markdown_bundle(
    note: &Note,
    data_dir: &Path,
    bundle_dir: &Path,
) -> Result<PathBuf, ExportError> {
    std::fs::create_dir_all(bundle_dir)?;
    let assets_dir = bundle_dir.join("assets");
    let content = copy_images_and_rewrite(&note.content, data_dir, &assets_dir)?;
    let body = render_markdown_with(note, &content);
    let md_path = bundle_dir.join(format!("{}.md", default_filename(note)));
    std::fs::write(&md_path, body)?;
    Ok(md_path)
}

/// 判断正文是否引用了至少一张「存在的本地图片」—— 用于决定导出 Markdown 时
/// 是否需要打包成文件夹（无本地图片时退化为单文件导出，不必多一层目录）。
pub fn has_local_images(content: &str, data_dir: &Path) -> bool {
    let mut found = false;
    rewrite_markdown_images(content, |url| {
        if !found {
            if let Some(src) = resolve_local_image(url, data_dir) {
                if src.is_file() {
                    found = true;
                }
            }
        }
        None
    });
    found
}

/// 扫描正文图片引用，把本地图片复制进 `assets_dir`，返回改写后的正文。
fn copy_images_and_rewrite(
    content: &str,
    data_dir: &Path,
    assets_dir: &Path,
) -> Result<String, ExportError> {
    let mut copied: HashMap<PathBuf, String> = HashMap::new();
    let mut used: HashSet<String> = HashSet::new();
    let mut assets_ready = false;
    let mut io_err: Option<std::io::Error> = None;

    let rewritten = rewrite_markdown_images(content, |url| {
        if io_err.is_some() {
            return None;
        }
        let src = resolve_local_image(url, data_dir)?;
        if !src.is_file() {
            return None;
        }
        if let Some(rel) = copied.get(&src) {
            return Some(rel.clone());
        }
        if !assets_ready {
            if let Err(e) = std::fs::create_dir_all(assets_dir) {
                io_err = Some(e);
                return None;
            }
            assets_ready = true;
        }
        let base = src
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "image".to_string());
        let name = unique_asset_name(&base, &used);
        if let Err(e) = std::fs::copy(&src, assets_dir.join(&name)) {
            io_err = Some(e);
            return None;
        }
        used.insert(name.clone());
        let rel = format!("assets/{name}");
        copied.insert(src, rel.clone());
        Some(rel)
    });

    if let Some(e) = io_err {
        return Err(e.into());
    }
    Ok(rewritten)
}

/// 把图片引用 URL 解析为本地文件绝对路径；外链 / 内联 / 非本地一律返回 `None`。
fn resolve_local_image(url: &str, data_dir: &Path) -> Option<PathBuf> {
    let url = url.trim();
    if url.is_empty()
        || url.starts_with("data:")
        || url.starts_with("http://")
        || url.starts_with("https://")
    {
        return None;
    }
    if let Some(rel) = url.strip_prefix("steno-asset:") {
        return safe_data_relative(rel, data_dir);
    }
    if let Some(rel) = url
        .strip_prefix("~/.steno/")
        .or_else(|| url.strip_prefix("～/.steno/"))
    {
        return safe_data_relative(rel, data_dir);
    }
    if let Some(rest) = url.strip_prefix("file://") {
        let path = rest.strip_prefix("localhost").unwrap_or(rest);
        return Some(PathBuf::from(path));
    }
    let path = Path::new(url);
    if path.is_absolute() {
        return Some(path.to_path_buf());
    }
    None
}

/// 校验相对路径安全（无越级 / 反斜杠 / 绝对），再拼到 `data_dir` 下。
fn safe_data_relative(rel: &str, data_dir: &Path) -> Option<PathBuf> {
    if rel.is_empty() || rel.starts_with('/') || rel.contains("..") || rel.contains('\\') {
        return None;
    }
    Some(data_dir.join(rel))
}

/// 为 `assets/` 内的图片取不冲突的文件名：basename 已占用时追加 `-1` / `-2`…
fn unique_asset_name(base: &str, used: &HashSet<String>) -> String {
    if !used.contains(base) {
        return base.to_string();
    }
    let (stem, ext) = match base.rfind('.') {
        Some(i) if i > 0 => (&base[..i], &base[i..]),
        _ => (base, ""),
    };
    let mut n = 1;
    loop {
        let candidate = format!("{stem}-{n}{ext}");
        if !used.contains(&candidate) {
            return candidate;
        }
        n += 1;
    }
}

/// 手写扫描 `![alt](url)` 并按 `map_url` 改写 url（返回 `None` 表示保留原样）。
///
/// 仅按 ASCII 字节 `!` `[` `]` `(` `)` 与空白定位标记 —— UTF-8 多字节字符的每个
/// 字节都 ≥ 0x80，绝不会与这些 ASCII 标记冲突，故按字节切片对中文安全。
/// 规则与前端 `MARKDOWN_IMAGE_RE` 一致：alt 不含 `]`，url 到首个 `)` 或空白为止。
fn rewrite_markdown_images(
    content: &str,
    mut map_url: impl FnMut(&str) -> Option<String>,
) -> String {
    let bytes = content.as_bytes();
    let n = bytes.len();
    let mut out = String::with_capacity(n);
    let mut last = 0;
    let mut i = 0;
    while i + 1 < n {
        if bytes[i] == b'!' && bytes[i + 1] == b'[' {
            if let Some((url_start, url_end)) = parse_image_url_span(bytes, i) {
                let url = &content[url_start..url_end];
                if let Some(new_url) = map_url(url) {
                    out.push_str(&content[last..url_start]);
                    out.push_str(&new_url);
                    last = url_end;
                }
                i = url_end;
                continue;
            }
        }
        i += 1;
    }
    out.push_str(&content[last..]);
    out
}

/// 从 `![` 起点（`excl_start` 指向 `!`）解析 url 在 `bytes` 中的 `[start, end)`，
/// `end` 指向闭合的 `)`。形如 `![](url "title")` 的 title 形式不支持（与前端一致）。
fn parse_image_url_span(bytes: &[u8], excl_start: usize) -> Option<(usize, usize)> {
    let n = bytes.len();
    let mut j = excl_start + 2;
    while j < n && bytes[j] != b']' {
        j += 1;
    }
    if j >= n || j + 1 >= n || bytes[j + 1] != b'(' {
        return None;
    }
    let url_start = j + 2;
    let mut k = url_start;
    while k < n && bytes[k] != b')' && !bytes[k].is_ascii_whitespace() {
        k += 1;
    }
    if k >= n || bytes[k] != b')' || k == url_start {
        return None;
    }
    Some((url_start, k))
}

pub fn export_html(note: &Note, data_dir: &Path, output_path: &Path) -> Result<(), ExportError> {
    let body = render_html(note, data_dir);
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
    render_markdown_with(note, &note.content)
}

/// 与 [`render_markdown`] 相同，但正文用传入的 `content`
/// （导出为文件夹时正文里的图片引用已被改写为相对路径）。
fn render_markdown_with(note: &Note, content: &str) -> String {
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
    buf.push_str(content);
    if !content.ends_with('\n') {
        buf.push('\n');
    }
    buf
}

fn render_html(note: &Note, data_dir: &Path) -> String {
    let title = html_escape(&note.title);
    let body = inline_html_images(&note.html_content, data_dir);
    format!(
        "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>{title}</title>\n<style>body{{font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;line-height:1.65;max-width:760px;margin:40px auto;padding:0 20px;color:#242424;}}main{{display:block;}}img{{max-width:100%;height:auto;}}</style>\n</head>\n<body>\n<main>\n<h1>{title}</h1>\n{}\n</main>\n</body>\n</html>\n",
        body
    )
}

/// 把 HTML 正文里引用的本地图片内联为 base64 data URL，使导出的 `.html` 自包含、双击即见图。
fn inline_html_images(html: &str, data_dir: &Path) -> String {
    rewrite_html_img_src(html, |url| inline_local_image(url, data_dir))
}

/// 读取本地图片并编码成 base64 data URL；外链 / 内联 / 读取失败返回 `None`（保留原 src）。
fn inline_local_image(url: &str, data_dir: &Path) -> Option<String> {
    let src = resolve_local_image(url, data_dir)?;
    let bytes = std::fs::read(&src).ok()?;
    let mime = image_mime_from_path(&src);
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{mime};base64,{encoded}"))
}

fn image_mime_from_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        _ => "application/octet-stream",
    }
}

/// 扫描 HTML 里所有 `src="..."`（pulldown-cmark 输出的双引号格式），按 `map` 改写。
/// 仅按 ASCII 字节扫描 —— HTML 属性值里的 `"` 已被实体转义、不会裸现，且 UTF-8
/// 多字节字符不与这些 ASCII 标记冲突，故对中文文件名安全。
fn rewrite_html_img_src(html: &str, mut map: impl FnMut(&str) -> Option<String>) -> String {
    const NEEDLE: &[u8] = b"src=\"";
    let bytes = html.as_bytes();
    let n = bytes.len();
    let mut out = String::with_capacity(n);
    let mut last = 0;
    let mut i = 0;
    while i + NEEDLE.len() <= n {
        if &bytes[i..i + NEEDLE.len()] == NEEDLE {
            let val_start = i + NEEDLE.len();
            if let Some(val_end) = find_byte(bytes, val_start, b'"') {
                let url = &html[val_start..val_end];
                if let Some(new_url) = map(url) {
                    out.push_str(&html[last..val_start]);
                    out.push_str(&new_url);
                    last = val_end;
                }
                i = val_end + 1;
                continue;
            }
        }
        i += 1;
    }
    out.push_str(&html[last..]);
    out
}

fn find_byte(bytes: &[u8], from: usize, target: u8) -> Option<usize> {
    bytes[from..]
        .iter()
        .position(|&b| b == target)
        .map(|pos| from + pos)
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
            is_draft: false,
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
        export_html(&make_note(), &std::env::temp_dir(), &tmp).expect("write html");
        let content = std::fs::read_to_string(&tmp).expect("read html");
        assert!(content.contains("<!doctype html>"));
        assert!(content.contains("<title>笔记标题</title>"));
        assert!(content.contains("<main>"));
        assert!(content.contains("<p>...</p>"));
        assert!(content.contains("</html>"));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn export_html_inlines_local_images_as_base64() {
        let tmp = std::env::temp_dir().join(format!("steno-html-{}", uuid::Uuid::new_v4()));
        let data_dir = tmp.join("data");
        let img = data_dir.join("images/x.png");
        std::fs::create_dir_all(img.parent().unwrap()).unwrap();
        std::fs::write(&img, b"PNGDATA").unwrap();

        let mut note = make_note();
        note.html_content =
            "<p><img src=\"steno-asset:images/x.png\" alt=\"a\"></p><p><img src=\"https://e.com/y.png\"></p>"
                .into();

        let out = tmp.join("out.html");
        export_html(&note, &data_dir, &out).expect("write html");
        let html = std::fs::read_to_string(&out).unwrap();

        // 本地图片内联为 base64 data URL，原 steno-asset: 引用消失
        assert!(html.contains("src=\"data:image/png;base64,"));
        assert!(!html.contains("steno-asset:"));
        // 外链原样保留
        assert!(html.contains("https://e.com/y.png"));

        std::fs::remove_dir_all(&tmp).ok();
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

    #[test]
    fn export_markdown_bundle_copies_images_and_rewrites_relative_paths() {
        let tmp = std::env::temp_dir().join(format!("steno-bundle-{}", uuid::Uuid::new_v4()));
        let data_dir = tmp.join("data");
        let img_abs = data_dir.join("images/2026-05-28/paste.png");
        std::fs::create_dir_all(img_abs.parent().unwrap()).unwrap();
        std::fs::write(&img_abs, b"PNGDATA").unwrap();

        let mut note = make_note();
        note.content = "![截图](steno-asset:images/2026-05-28/paste.png)\n\n![外链](https://example.com/x.png)\n\n![内联](data:image/png;base64,AAAA)".into();

        let bundle_dir = tmp.join("out");
        let md_path = export_markdown_bundle(&note, &data_dir, &bundle_dir).expect("bundle");

        // 本地图片复制进 assets/，正文引用改为相对路径
        assert!(bundle_dir.join("assets").join("paste.png").exists());
        let md = std::fs::read_to_string(&md_path).unwrap();
        assert!(md.contains("](assets/paste.png)"));
        assert!(!md.contains("steno-asset:"));
        // 外链与 data: 内联原样保留
        assert!(md.contains("](https://example.com/x.png)"));
        assert!(md.contains("](data:image/png;base64,AAAA)"));

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn export_markdown_bundle_deduplicates_same_basename() {
        let tmp = std::env::temp_dir().join(format!("steno-bundle-{}", uuid::Uuid::new_v4()));
        let data_dir = tmp.join("data");
        let a = data_dir.join("images/a/pic.png");
        let b = data_dir.join("images/b/pic.png");
        std::fs::create_dir_all(a.parent().unwrap()).unwrap();
        std::fs::create_dir_all(b.parent().unwrap()).unwrap();
        std::fs::write(&a, b"AAA").unwrap();
        std::fs::write(&b, b"BBB").unwrap();

        let mut note = make_note();
        note.content = "![1](steno-asset:images/a/pic.png) ![2](steno-asset:images/b/pic.png)".into();

        let bundle_dir = tmp.join("out");
        let md_path = export_markdown_bundle(&note, &data_dir, &bundle_dir).expect("bundle");
        let md = std::fs::read_to_string(&md_path).unwrap();

        // 同名 basename 不互相覆盖：第二个被改名
        assert!(bundle_dir.join("assets").join("pic.png").exists());
        assert!(bundle_dir.join("assets").join("pic-1.png").exists());
        assert!(md.contains("](assets/pic.png)"));
        assert!(md.contains("](assets/pic-1.png)"));

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn has_local_images_detects_existing_local_assets_only() {
        let tmp = std::env::temp_dir().join(format!("steno-has-{}", uuid::Uuid::new_v4()));
        let data_dir = tmp.join("data");
        let img = data_dir.join("images/x.png");
        std::fs::create_dir_all(img.parent().unwrap()).unwrap();
        std::fs::write(&img, b"P").unwrap();

        // 存在的本地图片 → true
        assert!(has_local_images("![a](steno-asset:images/x.png)", &data_dir));
        // 仅外链 / 内联 → false
        assert!(!has_local_images(
            "![a](https://e.com/x.png) ![b](data:image/png;base64,AA)",
            &data_dir
        ));
        // 无图片 → false
        assert!(!has_local_images("纯文本，没有任何图片", &data_dir));
        // 引用的本地图片不存在（已丢） → false，不必创建空文件夹
        assert!(!has_local_images("![a](steno-asset:images/missing.png)", &data_dir));

        std::fs::remove_dir_all(&tmp).ok();
    }
}
