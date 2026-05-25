use std::path::{Path, PathBuf};
use std::time::SystemTime;

use walkdir::WalkDir;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkspaceFsEntryKind {
    Folder,
    Document,
}

#[derive(Debug, Clone)]
pub struct WorkspaceFsEntry {
    pub kind: WorkspaceFsEntryKind,
    pub title: String,
    pub path: PathBuf,
    pub parent_path: Option<PathBuf>,
    pub content: String,
    pub byte_size: i64,
    pub modified_at: Option<SystemTime>,
}

pub fn build_document_path(root: &Path, title: &str) -> PathBuf {
    let trimmed = title.trim();
    let stem = if trimmed.is_empty() {
        "untitled"
    } else {
        trimmed
    };
    let sanitized = stem.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "-");
    root.join(format!("{sanitized}.md"))
}

pub fn write_markdown_file(path: &Path, content: &str) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, content)
}

pub fn scan_workspace(root: &Path) -> Result<Vec<WorkspaceFsEntry>, std::io::Error> {
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let mut entries = Vec::new();

    for entry in WalkDir::new(&root)
        .min_depth(1)
        .sort_by_file_name()
        .into_iter()
    {
        let entry = entry.map_err(std::io::Error::other)?;
        let file_type = entry.file_type();
        let path = entry.path().to_path_buf();
        let metadata = entry.metadata().ok();
        let parent_path = path
            .parent()
            .filter(|parent| *parent != root.as_path())
            .map(Path::to_path_buf);

        if file_type.is_dir() {
            entries.push(WorkspaceFsEntry {
                kind: WorkspaceFsEntryKind::Folder,
                title: path_title(&path, false),
                path,
                parent_path,
                content: String::new(),
                byte_size: 0,
                modified_at: metadata.and_then(|value| value.modified().ok()),
            });
            continue;
        }

        if file_type.is_file() && is_document_path(&path) {
            let content = std::fs::read_to_string(&path).unwrap_or_default();
            let byte_size = metadata
                .as_ref()
                .map(|value| value.len() as i64)
                .unwrap_or_else(|| content.as_bytes().len() as i64);
            entries.push(WorkspaceFsEntry {
                kind: WorkspaceFsEntryKind::Document,
                title: path_title(&path, true),
                path,
                parent_path,
                content,
                byte_size,
                modified_at: metadata.and_then(|value| value.modified().ok()),
            });
        }
    }

    Ok(entries)
}

fn is_document_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "txt"
            )
        })
        .unwrap_or(false)
}

fn path_title(path: &Path, prefer_stem: bool) -> String {
    let candidate = if prefer_stem {
        path.file_stem().or_else(|| path.file_name())
    } else {
        path.file_name()
    };

    candidate
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "未命名".to_string())
}
