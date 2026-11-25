//! Ignore rules are exercised only in disposable repositories.
#![allow(non_snake_case)] // Test names separate context and expectation with double underscores.
mod common;

use common::{fixture, write};
use serde_json::Value;
use std::path::Path;

fn ignore(repo: &Path, target: &str, path: &str) -> (bool, Value) {
    let out = common::gitview()
        .args(["json", "ignore", "--repo"])
        .arg(repo)
        .args(["--target", target, "--", path])
        .output()
        .unwrap();
    (
        out.status.success(),
        serde_json::from_slice(&out.stdout).unwrap(),
    )
}

#[test]
fn ignore__checkout_root_disappears__does_not_touch_parent_repository() {
    // Ожидание: если каталог больше не корень рабочей копии, родительский .gitignore не изменится.
    let repo = fixture("ignore-missing-root");
    let former_root = repo.dir.join("former-worktree");
    std::fs::create_dir(&former_root).unwrap();
    let out = common::gitview()
        .args(["json", "ignore", "--repo"])
        .arg(former_root)
        .args([
            "--worktree-root",
            "--target",
            "gitignore",
            "--",
            "local.log",
        ])
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stdout).contains("not a Git worktree root"));
    assert!(!repo.dir.join(".gitignore").exists());
}

#[test]
fn gitignore__literal_path__preserves_existing_rules_and_deduplicates() {
    // Ожидание: сохраняются прежние правила, добавляется точный путь без повторов и расширения шаблона.
    let repo = fixture("ignore-literal");
    write(&repo.dir, ".gitignore", "# existing\nold");
    write(&repo.dir, "dir/a[1]*?.txt", "keep");
    write(&repo.dir, "dir/a1xx.txt", "also keep");
    let (ok, result) = ignore(&repo.dir, "gitignore", "dir/a[1]*?.txt");
    assert!(ok, "{result}");
    let rules = std::fs::read_to_string(repo.dir.join(".gitignore")).unwrap();
    assert!(rules.starts_with("# existing\nold\n"));
    assert!(ignore(&repo.dir, "gitignore", "dir/a[1]*?.txt").0);
    assert_eq!(
        std::fs::read_to_string(repo.dir.join(".gitignore")).unwrap(),
        rules
    );
    let check = |p: &str| {
        std::process::Command::new("git")
            .current_dir(&repo.dir)
            .args(["check-ignore", "--", p])
            .status()
            .unwrap()
            .success()
    };
    assert!(check("dir/a[1]*?.txt"));
    assert!(!check("dir/a1xx.txt"));
    assert_eq!(
        std::fs::read_to_string(repo.dir.join("dir/a[1]*?.txt")).unwrap(),
        "keep"
    );
}

#[test]
fn exclude__linked_worktree__uses_git_path_and_keeps_shared_gitignore() {
    // Ожидание: локальное правило попадает в настоящий info/exclude, а не в несуществующий .git-каталог worktree.
    let repo = fixture("ignore-worktree");
    let worktree = repo.dir.join("linked-ignore");
    let out = std::process::Command::new("git")
        .current_dir(&repo.dir)
        .args(["worktree", "add", "-b", "ignore-test"])
        .arg(&worktree)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    write(&worktree, "local.log", "private");
    let (ok, result) = ignore(&worktree, "exclude", "local.log");
    assert!(ok, "{result}");
    assert!(!worktree.join(".gitignore").exists());
    assert!(
        std::fs::read_to_string(repo.dir.join(".git/info/exclude"))
            .unwrap()
            .contains("/local.log\n")
    );
    assert_eq!(
        std::fs::read_to_string(worktree.join("local.log")).unwrap(),
        "private"
    );
}

#[test]
fn invalid_target_or_path__rejected__without_writing_rules() {
    // Ожидание: нельзя выйти из репозитория, записать несколько правил одним путём или выбрать произвольный файл правил.
    let repo = fixture("ignore-invalid");
    for path in ["../outside", "/outside", ".", ".git/config", "a\nb", "a\rb"] {
        assert!(!ignore(&repo.dir, "gitignore", path).0, "{path:?}");
    }
    assert!(!ignore(&repo.dir, "other", "safe.txt").0);
    assert!(!repo.dir.join(".gitignore").exists());
}

#[test]
fn tracked_file__ignore_rule__does_not_unstage_or_remove_file() {
    // Ожидание: правило не снимает существующий файл с учёта Git и не изменяет его содержимое.
    let repo = fixture("ignore-tracked");
    assert!(ignore(&repo.dir, "gitignore", "base.txt").0);
    let out = std::process::Command::new("git")
        .current_dir(&repo.dir)
        .args(["ls-files", "--error-unmatch", "--", "base.txt"])
        .output()
        .unwrap();
    assert!(out.status.success());
    assert!(repo.dir.join("base.txt").exists());
}

#[test]
fn folder_with_spaces__root_anchored__does_not_ignore_sibling_or_nested_names() {
    // Ожидание: правило игнорирует только выбранный каталог в корне, но не одноимённый вложенный каталог.
    let repo = fixture("ignore-folder");
    write(&repo.dir, "build dir/file", "keep");
    write(&repo.dir, "nested/build dir/file", "keep nested");
    assert!(ignore(&repo.dir, "gitignore", "build dir/").0);
    assert!(
        std::process::Command::new("git")
            .current_dir(&repo.dir)
            .args(["check-ignore", "--", "build dir/file"])
            .status()
            .unwrap()
            .success()
    );
    assert!(
        !std::process::Command::new("git")
            .current_dir(&repo.dir)
            .args(["check-ignore", "--", "nested/build dir/file"])
            .status()
            .unwrap()
            .success()
    );
}

#[test]
fn missing_info_directory__exclude__creates_rules_file() {
    // Ожидание: при отсутствии info операция создаёт каталог и добавляет локальное правило.
    let repo = fixture("ignore-info-missing");
    std::fs::remove_dir_all(repo.dir.join(".git/info")).unwrap();
    assert!(ignore(&repo.dir, "exclude", "local.log").0);
    assert_eq!(
        std::fs::read_to_string(repo.dir.join(".git/info/exclude")).unwrap(),
        "/local.log\n"
    );
}

#[cfg(unix)]
#[test]
fn symlinked_gitignore__refused__target_unchanged() {
    // Ожидание: символьная ссылка вместо файла правил не приводит к записи в посторонний файл.
    let repo = fixture("ignore-symlink");
    write(&repo.dir, "outside", "do not touch");
    std::os::unix::fs::symlink("outside", repo.dir.join(".gitignore")).unwrap();
    assert!(!ignore(&repo.dir, "gitignore", "safe.txt").0);
    assert_eq!(
        std::fs::read_to_string(repo.dir.join("outside")).unwrap(),
        "do not touch"
    );
}
