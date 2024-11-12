use git2::{
    Repository, PushOptions, FetchOptions, Cred, 
    RemoteCallbacks, StashFlags, BranchType, ResetType
};
use serde::{Serialize, Deserialize};
use std::path::{Path, PathBuf};
use std::error::Error;
use std::fmt;
use notify::{Watcher, RecursiveMode, Event};
use std::sync::mpsc::channel;
use std::thread;

#[derive(Debug)]
pub enum GitError {
    Git(git2::Error),
    Io(std::io::Error),
    Custom(String),
}

impl fmt::Display for GitError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            GitError::Git(e) => write!(f, "Git error: {}", e),
            GitError::Io(e) => write!(f, "IO error: {}", e),
            GitError::Custom(s) => write!(f, "{}", s),
        }
    }
}

impl Error for GitError {}

impl From<git2::Error> for GitError {
    fn from(err: git2::Error) -> GitError {
        GitError::Git(err)
    }
}

impl From<std::io::Error> for GitError {
    fn from(err: std::io::Error) -> GitError {
        GitError::Io(err)
    }
}

impl From<reqwest::Error> for GitError {
    fn from(err: reqwest::Error) -> GitError {
        GitError::Custom(err.to_string())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepositoryStats {
    pub commits: usize,
    pub branches: usize,
    pub contributors: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffHunk {
    pub old_start: u32,
    pub new_start: u32,
    pub old_lines: u32,
    pub new_lines: u32,
    pub content: String,
    pub line_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffEntry {
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub status: String,
    pub hunks: Vec<DiffHunk>,
}

pub struct GitRepo {
    repo: Repository,
    path: PathBuf,
    watcher: Option<Box<dyn Watcher + Send>>,
}

impl GitRepo {
    pub fn open(path: &str, _token: Option<String>) -> Result<Self, GitError> {
        let repo = Repository::open(path)?;
        let mut git_repo = GitRepo {
            repo,
            path: PathBuf::from(path),
            watcher: None,
        };
        git_repo.setup_watcher()?;
        Ok(git_repo)
    }

    fn setup_watcher(&mut self) -> Result<(), GitError> {
        let (tx, rx) = channel();
        
        // Create a new watcher
        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = tx.send(event);
            }
        }).map_err(|e| GitError::Custom(e.to_string()))?;

        // Watch the repository path
        watcher.watch(&self.path, RecursiveMode::Recursive)
            .map_err(|e| GitError::Custom(e.to_string()))?;
        // Store the watcher
        self.watcher = Some(Box::new(watcher));

        // Spawn a thread to handle file system events
        let _path = self.path.clone();
        thread::spawn(move || {
            while let Ok(event) = rx.recv() {
                match event.kind {
                    notify::EventKind::Create(_) |
                    notify::EventKind::Modify(_) |
                    notify::EventKind::Remove(_) => {
                        // You could emit an event here to notify the frontend
                        println!("File system event: {:?}", event);
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    pub fn clone(url: &str, path: &Path) -> Result<Self, GitError> {
        // Ensure parent directory exists with proper permissions
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| GitError::Custom(format!("Failed to create directory: {}", e)))?;
            
            // On Unix systems, set directory permissions
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = std::fs::metadata(parent)?.permissions();
                perms.set_mode(0o755); // rwxr-xr-x
                std::fs::set_permissions(parent, perms)?;
            }
        }

        let token = std::env::var("GITHUB_TOKEN")
            .map_err(|_| GitError::Custom("GitHub token not found".to_string()))?;

        let mut callbacks = RemoteCallbacks::new();
        callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
            Cred::userpass_plaintext("oauth2", &token)
        });

        let mut fetch_options = FetchOptions::new();
        fetch_options.remote_callbacks(callbacks);

        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_options);

        match builder.clone(url, path) {
            Ok(repo) => Ok(GitRepo {
                repo,
                path: path.to_path_buf(),
                watcher: None,
            }),
            Err(e) => {
                // Clean up failed clone attempt
                if path.exists() {
                    let _ = std::fs::remove_dir_all(path);
                }
                Err(GitError::Git(e))
            }
        }
    }

    pub fn push(&self, _is_remote: bool) -> Result<(), GitError> {
        let mut remote = self.repo.find_remote("origin")?;
        let mut callbacks = RemoteCallbacks::new();
        
        callbacks.credentials(|_url, username_from_url, _allowed_types| {
            Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
        });

        let mut push_options = PushOptions::new();
        push_options.remote_callbacks(callbacks);

        let head = self.repo.head()?;
        let branch_name = head.shorthand().ok_or(GitError::Custom("Cannot get branch name".into()))?;

        remote.push(
            &[&format!("refs/heads/{}", branch_name)],
            Some(&mut push_options),
        )?;

        Ok(())
    }

    pub fn pull(&self, _is_remote: bool) -> Result<(), GitError> {
        let mut remote = self.repo.find_remote("origin")?;
        let mut callbacks = RemoteCallbacks::new();
        
        callbacks.credentials(|_url, username_from_url, _allowed_types| {
            Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
        });

        let mut fetch_options = FetchOptions::new();
        fetch_options.remote_callbacks(callbacks);

        remote.fetch(&[] as &[&str], Some(&mut fetch_options), None)?;

        let head = self.repo.head()?;
        let branch_name = head.shorthand().ok_or(GitError::Custom("Cannot get branch name".into()))?;

        let remote_branch = self.repo.find_branch(&format!("origin/{}", branch_name), BranchType::Remote)?;
        let annotated_commit = self.repo.reference_to_annotated_commit(&remote_branch.into_reference())?;
        self.repo.merge(&[&annotated_commit], None, None)?;

        Ok(())
    }

    pub fn revert_commit(&mut self, commit_hash: &str, create_branch: bool) -> Result<(), GitError> {
        // First get the commit ID
        let oid = self.repo.revparse_single(commit_hash)?.id();
        
        // Get the commit message in a separate scope
        let message = {
            let commit = self.repo.find_commit(oid)?;
            commit.message().unwrap_or("").to_string()
        };
        
        // Handle branch creation if needed
        if create_branch {
            let branch_name = format!("revert-{}", &commit_hash[..7]);
            let head_commit = self.repo.head()?.peel_to_commit()?;
            self.repo.branch(&branch_name, &head_commit, false)?;
        }

        // Create signature before any operations that might need it
        let sig = self.repo.signature()?;

        // Do the revert operation in its own scope
        {
            let commit = self.repo.find_commit(oid)?;
            self.repo.revert(&commit, None)?;
        }
        
        // Prepare the tree and parent commit
        let tree_id = self.repo.index()?.write_tree()?;
        let tree = self.repo.find_tree(tree_id)?;
        let parent = self.repo.head()?.peel_to_commit()?;
        
        // Create the commit with all prepared data
        self.repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            &format!("Revert \"{}\"", message),
            &tree,
            &[&parent],
        )?;

        Ok(())
    }

    pub fn stash_changes(&mut self) -> Result<(), GitError> {
        let signature = self.repo.signature()?;
        self.repo.stash_save(&signature, "Stashed changes", Some(StashFlags::INCLUDE_UNTRACKED))?;
        Ok(())
    }

    pub fn stash_pop(&mut self) -> Result<(), GitError> {
        self.repo.stash_pop(0, None)?;
        Ok(())
    }

    pub fn get_stats(&self) -> Result<RepositoryStats, GitError> {
        let mut commits = 0;
        let mut contributors = std::collections::HashSet::new();

        let mut revwalk = self.repo.revwalk()?;
        revwalk.push_head()?;
        
        for commit_id in revwalk {
            let commit = self.repo.find_commit(commit_id?)?;
            commits += 1;
            let author_email = commit.author().email().map(|email| email.to_string());
            if let Some(email) = author_email {
                contributors.insert(email);
            }
        }

        let branches = self.repo.branches(None)?
            .count();

        Ok(RepositoryStats {
            commits,
            branches,
            contributors: contributors.len(),
        })
    }

    pub fn reset_hard(&mut self, commit_hash: &str) -> Result<(), GitError> {
        let oid = self.repo.revparse_single(commit_hash)?.id();
        let commit = self.repo.find_commit(oid)?;
        self.repo.reset(&commit.into_object(), ResetType::Hard, None)?;
        Ok(())
    }

    pub fn view_diff(&self) -> Result<Vec<DiffEntry>, GitError> {
        let mut diff_entries = Vec::new();
        let mut opts = git2::DiffOptions::new();
        
        // Get the diff between the index and working directory
        let diff = self.repo.diff_index_to_workdir(None, Some(&mut opts))?;
        
        let current_entry = std::cell::RefCell::new(None::<DiffEntry>);
        
        // Process regular diffs
        diff.foreach(
            &mut |delta, _| {
                if let Some(entry) = current_entry.borrow_mut().take() {
                    diff_entries.push(entry);
                }
                
                *current_entry.borrow_mut() = Some(DiffEntry {
                    old_path: delta.old_file().path().map(|p| p.to_string_lossy().into_owned()),
                    new_path: delta.new_file().path().map(|p| p.to_string_lossy().into_owned()),
                    status: format!("{:?}", delta.status()),
                    hunks: Vec::new(),
                });
                true
            },
            None,
            Some(&mut |_delta, hunk| {
                if let Some(entry) = &mut *current_entry.borrow_mut() {
                    entry.hunks.push(DiffHunk {
                        old_start: hunk.old_start(),
                        new_start: hunk.new_start(),
                        old_lines: hunk.old_lines(),
                        new_lines: hunk.new_lines(),
                        content: String::new(),
                        line_type: "header".to_string(),
                    });
                }
                true
            }),
            Some(&mut |_delta, _hunk, line| {
                if let Some(entry) = &mut *current_entry.borrow_mut() {
                    if let Some(last_hunk) = entry.hunks.last_mut() {
                        let content = String::from_utf8_lossy(line.content());
                        last_hunk.content.push_str(&format!("{}{}\n", 
                            line.origin() as char,
                            content.trim_end()
                        ));
                    }
                }
                true
            }),
        )?;

        if let Some(entry) = current_entry.into_inner() {
            diff_entries.push(entry);
        }

        // Add untracked files
        let untracked = self.get_untracked_files()?;
        for path in untracked {
            // Read the content of the new file
            let content = std::fs::read_to_string(self.path.join(&path))
                .map_err(GitError::Io)?;

            let hunk = DiffHunk {
                old_start: 0,
                new_start: 1,
                old_lines: 0,
                new_lines: content.lines().count() as u32,
                content: content.lines().map(|line| format!("+{}\n", line)).collect(),
                line_type: "header".to_string(),
            };

            diff_entries.push(DiffEntry {
                old_path: None,
                new_path: Some(path),
                status: "NEW".to_string(),
                hunks: vec![hunk],
            });
        }

        Ok(diff_entries)
    }

    pub fn create_tag(&self, tag_name: &str, message: &str) -> Result<(), GitError> {
        let obj = self.repo.head()?.peel(git2::ObjectType::Commit)?;
        let sig = self.repo.signature()?;
        self.repo.tag(tag_name, &obj, &sig, message, false)?;
        Ok(())
    }

    pub fn list_remotes(&self) -> Result<Vec<String>, GitError> {
        let remotes = self.repo.remotes()?;
        let remote_names = remotes.iter().filter_map(|name| name.map(String::from)).collect();
        Ok(remote_names)
    }

    pub fn get_repository_settings(&self) -> Result<String, GitError> {
        // Example: Return the repository's description if available
        let config = self.repo.config()?;
        let description = config.get_string("description").unwrap_or_else(|_| "No description".to_string());
        Ok(description)
    }

    pub fn get_untracked_files(&self) -> Result<Vec<String>, GitError> {
        let mut options = git2::StatusOptions::new();
        options.include_untracked(true);
        
        let statuses = self.repo.statuses(Some(&mut options))?;
        
        let untracked = statuses.iter()
            .filter(|entry| entry.status().is_wt_new())
            .filter_map(|entry| entry.path().map(String::from))
            .collect();
            
        Ok(untracked)
    }

    pub fn stage_changes(&mut self) -> Result<(), GitError> {
        let mut index = self.repo.index()?;
        
        // Stage all changes (equivalent to 'git add .')
        index.add_all(
            ["*"].iter(),
            git2::IndexAddOption::DEFAULT,
            None,
        )?;
        
        index.write()?;
        Ok(())
    }

    pub fn commit_changes(&mut self, message: &str) -> Result<(), GitError> {
        let mut index = self.repo.index()?;
        let tree_id = index.write_tree()?;
        let tree = self.repo.find_tree(tree_id)?;
        
        let signature = self.repo.signature()?;
        let parent_commit = self.repo.head()?.peel_to_commit()?;
        
        self.repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &[&parent_commit],
        )?;
        
        Ok(())
    }

    pub fn create_branch(&self, branch_name: &str) -> Result<(), GitError> {
        let head = self.repo.head()?;
        let commit = head.peel_to_commit()?;
        self.repo.branch(branch_name, &commit, false)?;
        Ok(())
    }

    pub fn checkout_branch(&self, branch_name: &str) -> Result<(), GitError> {
        let (object, reference) = self.repo.revparse_ext(branch_name)?;
        self.repo.checkout_tree(&object, None)?;
        
        match reference {
            Some(reference) => self.repo.set_head(reference.name().unwrap()),
            None => self.repo.set_head(&format!("refs/heads/{}", branch_name)),
        }?;
        
        Ok(())
    }

    pub fn merge_branch(&self, branch_name: &str) -> Result<(), GitError> {
        let reference = self.repo.find_reference(&format!("refs/heads/{}", branch_name))?;
        let annotated_commit = self.repo.reference_to_annotated_commit(&reference)?;
        
        let (analysis, _) = self.repo.merge_analysis(&[&annotated_commit])?;
        
        if analysis.is_up_to_date() {
            Ok(())
        } else if analysis.is_fast_forward() {
            let mut reference = self.repo.find_reference("HEAD")?;
            reference.set_target(annotated_commit.id(), "Fast-forward")?;
            self.repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;
            Ok(())
        } else {
            Err(GitError::Custom("Merge cannot be performed automatically".into()))
        }
    }

    pub fn delete_branch(&self, branch_name: &str) -> Result<(), GitError> {
        let mut branch = self.repo.find_branch(branch_name, BranchType::Local)?;
        branch.delete()?;
        Ok(())
    }

    pub fn view_commit_log(&self) -> Result<String, GitError> {
        let mut revwalk = self.repo.revwalk()?;
        revwalk.push_head()?;
        
        let mut log = String::new();
        for commit_id in revwalk {
            let commit = self.repo.find_commit(commit_id?)?;
            log.push_str(&format!(
                "Commit: {}\nAuthor: {}\nDate: {}\nMessage: {}\n\n",
                commit.id(),
                commit.author().name().unwrap_or("Unknown"),
                commit.time().seconds(),
                commit.message().unwrap_or("No message")
            ));
        }
        
        Ok(log)
    }

    pub fn amend_commit(&mut self) -> Result<(), GitError> {
        let head = self.repo.head()?;
        let head_commit = head.peel_to_commit()?;
        
        let tree_id = self.repo.index()?.write_tree()?;
        let tree = self.repo.find_tree(tree_id)?;
        
        let signature = self.repo.signature()?;
        let message = head_commit.message().unwrap_or("");
        
        self.repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &[],
        )?;
        
        Ok(())
    }

    pub fn get_current_branch(&self) -> Result<String, GitError> {
        let head = self.repo.head()?;
        let branch_name = head.shorthand()
            .ok_or_else(|| GitError::Custom("Not on a branch".into()))?;
        Ok(branch_name.to_string())
    }

    pub fn list_branches(&self) -> Result<Vec<String>, GitError> {
        let branches = self.repo.branches(Some(BranchType::Local))?;
        let branch_names: Result<Vec<_>, _> = branches
            .map(|b| {
                b.map(|(branch, _)| {
                    branch.name()
                        .map(|n| n.unwrap_or("").to_string())
                        .unwrap_or_default()
                })
            })
            .collect();
        
        branch_names.map_err(GitError::from)
    }

    pub fn list_tags(&self) -> Result<Vec<String>, GitError> {
        let tags: Vec<String> = self.repo.tag_names(None)?
            .iter()
            .filter_map(|name| name.map(String::from))
            .collect();
        Ok(tags)
    }

    pub fn get_path(&self) -> PathBuf {
        self.path.clone()
    }
}

impl Drop for GitRepo {
    fn drop(&mut self) {
        // Clean up the watcher when the GitRepo is dropped
        self.watcher = None;
    }
}