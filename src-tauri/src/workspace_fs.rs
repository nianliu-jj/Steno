use std::path::{Path, PathBuf};

pub fn build_document_path(root: &Path, title: &str) -> PathBuf {
    let trimmed = title.trim();
    let stem = if trimmed.is_empty() { "untitled" } else { trimmed };
    let sanitized = stem.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "-");
    root.join(format!("{sanitized}.md"))
}

pub fn write_markdown_file(path: &Path, content: &str) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, content)
}
