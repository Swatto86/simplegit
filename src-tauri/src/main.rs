#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod git_commands;
mod github_auth;

use git_commands::GitRepo;
use github_auth::GitHubAuth;
use std::sync::Arc;
use tauri::State;
use tauri::Manager;
use crate::git_commands::RepositoryStats;
use std::sync::atomic::Ordering;
use parking_lot::Mutex as PLMutex;
use tauri::{CustomMenuItem, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem};
use std::sync::Mutex;
use crate::git_commands::DiffEntry;
use dirs;
use std::path::PathBuf;

// Make RepoState thread-safe using parking_lot::Mutex
pub struct RepoState(Arc<PLMutex<Option<GitRepo>>>);

impl RepoState {
    fn new() -> Self {
        RepoState(Arc::new(PLMutex::new(None)))
    }
}

// Make RepoState Send + Sync
unsafe impl Send for RepoState {}
unsafe impl Sync for RepoState {}

// Define AuthState in main.rs
#[derive(Default)]
pub struct AuthState(Arc<PLMutex<Option<GitHubAuth>>>);

impl AuthState {
    fn new() -> Self {
        AuthState(Arc::new(PLMutex::new(Some(GitHubAuth::new()))))
    }
}

// Make AuthState Send + Sync
unsafe impl Send for AuthState {}
unsafe impl Sync for AuthState {}

// Add this near your other state management
#[derive(Default)]
struct WindowState {
    is_skip_taskbar: bool,
}

#[tauri::command]
async fn open_repository(path: String, state: State<'_, RepoState>) -> Result<String, String> {
    match GitRepo::open(&path, None) {
        Ok(repo) => {
            *state.0.lock() = Some(repo);
            Ok("Repository opened successfully".into())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn push_changes(_path: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_mut() {
        repo.push(false).map_err(|e| e.to_string())?;
        Ok("Changes pushed successfully".into())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn push_changes_remote(_repo_path: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_mut() {
        repo.push(true).map_err(|e| e.to_string())?;
        Ok("Changes pushed successfully".into())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn revert_commit(_path: String, commit_hash: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_mut() {
        repo.revert_commit(&commit_hash, false).map_err(|e| e.to_string())?;
        Ok("Commit reverted successfully".into())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn revert_commit_remote(_repo_path: String, commit_hash: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_mut() {
        repo.revert_commit(&commit_hash, true).map_err(|e| e.to_string())?;
        Ok("Commit reverted successfully. A new branch has been created.".into())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn github_auth(
    window: tauri::Window,
    state: State<'_, AuthState>,
) -> Result<String, String> {
    let auth = {
        let lock = state.0.lock();
        lock.as_ref()
            .ok_or_else(|| "Authentication not initialized".to_string())?
            .clone()
    }; // MutexGuard is dropped here
    auth.start_login(window).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn handle_auth_callback(
    code: String,
    state: State<'_, AuthState>,
) -> Result<(), String> {
    let auth = {
        let lock = state.0.lock();
        lock.as_ref()
            .ok_or_else(|| "Authentication not initialized".to_string())?
            .clone()
    }; // MutexGuard is dropped here
    auth.handle_callback(code).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_github_repos(
    state: State<'_, AuthState>,
) -> Result<Vec<String>, String> {
    let auth = {
        let lock = state.0.lock();
        lock.as_ref()
            .ok_or_else(|| "Authentication not initialized".to_string())?
            .clone()
    }; // MutexGuard is dropped here
    auth.list_repositories().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_repository_stats(path: String) -> Result<RepositoryStats, String> {
    let repo = GitRepo::open(&path, None).map_err(|e| e.to_string())?;
    repo.get_stats().map_err(|e| e.to_string())
}

#[tauri::command]
async fn github_logout(state: State<'_, AuthState>) -> Result<(), String> {
    let mut auth = state.0.lock();
    *auth = Some(GitHubAuth::new());
    Ok(())
}

#[tauri::command]
async fn github_cancel_auth(state: State<'_, AuthState>) -> Result<(), String> {
    let auth = state.0.lock();
    if let Some(auth) = auth.as_ref() {
        auth.cancel_auth();
    }
    Ok(())
}

#[tauri::command]
async fn check_auth_status(state: State<'_, AuthState>) -> Result<bool, String> {
    let auth = state.0.lock();
    if let Some(auth) = auth.as_ref() {
        Ok(auth.is_authenticating.load(Ordering::SeqCst))
    } else {
        Ok(false)
    }
}

#[tauri::command]
async fn get_remote_repository_stats(
    repo_name: String,
    state: State<'_, AuthState>,
) -> Result<RepositoryStats, String> {
    let auth = {
        let lock = state.0.lock();
        lock.as_ref()
            .ok_or_else(|| "Authentication not initialized".to_string())?
            .clone()
    };
    
    auth.get_repository_stats(&repo_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn pull_changes(_path: String, is_remote: bool, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_mut() {
        repo.pull(is_remote).map_err(|e| e.to_string())?;
        Ok("Changes pulled successfully".into())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn clone_repository(
    app_handle: tauri::AppHandle,
    repo_url: String, 
    state: State<'_, RepoState>
) -> Result<String, String> {
    let token = std::env::var("GITHUB_TOKEN")
        .map_err(|_| "GitHub token not found".to_string())?;

    let repo_name = repo_url
        .split('/')
        .last()
        .ok_or_else(|| "Invalid repository URL".to_string())?
        .trim_end_matches(".git");

    // Use the saved clone directory if available
    let clone_path = if let Ok(saved_dir) = get_saved_clone_directory(app_handle).await {
        PathBuf::from(saved_dir).join(repo_name)
    } else if let Ok(custom_dir) = std::env::var("CLONE_DIRECTORY") {
        PathBuf::from(custom_dir).join(repo_name)
    } else {
        get_exe_dir()?.join("repositories").join(repo_name)
    };

    // Check if directory exists and is not empty
    if clone_path.exists() {
        // Remove the directory and its contents
        std::fs::remove_dir_all(&clone_path)
            .map_err(|e| format!("Failed to remove existing directory: {}", e))?;
    }

    // Create parent directory if it doesn't exist
    if let Some(parent) = clone_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    // Validate token before attempting clone
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "simplegit")
        .send()
        .await
        .map_err(|e| format!("Failed to validate token: {}", e))?;

    if !response.status().is_success() {
        return Err("Invalid or expired GitHub token. Please re-authenticate.".to_string());
    }

    match GitRepo::clone(&repo_url, &clone_path) {
        Ok(repo) => {
            *state.0.lock() = Some(repo);
            Ok(format!("Repository cloned successfully to {}", clone_path.display()))
        }
        Err(e) => {
            // Clean up failed clone attempt
            if clone_path.exists() {
                let _ = std::fs::remove_dir_all(&clone_path);
            }
            Err(format!("Failed to clone repository: {}", e))
        }
    }
}

#[tauri::command]
async fn set_github_token(token: String, state: State<'_, AuthState>) -> Result<(), String> {
    std::env::set_var("GITHUB_TOKEN", &token);
    let auth = state.0.lock();
    if let Some(auth) = auth.as_ref() {
        auth.set_access_token(token);
    }
    Ok(())
}

#[tauri::command]
async fn cleanup_before_close(state: State<'_, AuthState>) -> Result<(), String> {
    let auth = state.0.lock();
    if let Some(auth) = auth.as_ref() {
        // Perform any necessary cleanup
        auth.cancel_auth();
    }
    Ok(())
}

#[tauri::command]
async fn validate_github_token(token: String, state: State<'_, AuthState>) -> Result<bool, String> {
    let auth = {
        let lock = state.0.lock();
        lock.as_ref()
            .ok_or_else(|| "Authentication not initialized".to_string())?
            .clone()
    };
    
    auth.validate_token(&token)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn stash_changes(_path: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_mut() {
        repo.stash_changes().map_err(|e| e.to_string())?;
        Ok("Changes stashed successfully".into())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn stash_pop(_path: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_mut() {
        repo.stash_pop().map_err(|e| e.to_string())?;
        Ok("Stashed changes applied successfully".into())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn create_tag(_path: String, tag_name: String, message: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_mut() {
        repo.create_tag(&tag_name, &message).map_err(|e| e.to_string())?;
        Ok(format!("Tag '{}' created successfully", tag_name))
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn reset_hard(_path: String, commit_hash: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_mut() {
        repo.reset_hard(&commit_hash).map_err(|e| e.to_string())?;
        Ok("Repository reset successfully".into())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn list_remotes(_path: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_ref() {
        let remotes = repo.list_remotes().map_err(|e| e.to_string())?;
        Ok(remotes.join(", "))
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn view_diff(path: String) -> Result<Vec<DiffEntry>, String> {
    println!("Debug - Received path in backend: {}", path);
    
    let repo = GitRepo::open(&path, None)
        .map_err(|e| e.to_string())?;
    
    repo.view_diff()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_repository_settings(_path: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_ref() {
        let settings = repo.get_repository_settings().map_err(|e| e.to_string())?;
        Ok(format!("Repository settings retrieved successfully: {}", settings))
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
fn get_home_dir() -> String {
    dirs::home_dir()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| String::from(""))
}

// Update the create_tray_menu function to take the current state
fn create_tray_menu(is_skip_taskbar: bool) -> SystemTrayMenu {
    let show = CustomMenuItem::new("show".to_string(), "Show Window");
    let hide = CustomMenuItem::new("hide".to_string(), "Hide Window");
    // Update the text based on the current state
    let toggle_taskbar = CustomMenuItem::new(
        "toggle_taskbar".to_string(),
        if is_skip_taskbar {
            "Show Taskbar Icon"
        } else {
            "Hide Taskbar Icon"
        },
    );
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    
    SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(toggle_taskbar)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit)
}

#[tauri::command]
async fn set_clone_directory(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    // Get config dir from app_handle
    let config_dir = app_handle.path_resolver()
        .app_config_dir()
        .ok_or_else(|| "Could not find config directory".to_string())?;
    
    // Ensure config directory exists
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    
    // Save to config file
    let config_file = config_dir.join("clone_directory.txt");
    std::fs::write(&config_file, &path)
        .map_err(|e| format!("Failed to save config: {}", e))?;
    
    // Also set environment variable for current session
    std::env::set_var("CLONE_DIRECTORY", path);
    Ok(())
}

#[tauri::command]
async fn get_saved_clone_directory(app_handle: tauri::AppHandle) -> Result<String, String> {
    let config_dir = app_handle.path_resolver()
        .app_config_dir()
        .ok_or_else(|| "Could not find config directory".to_string())?;
    
    let config_file = config_dir.join("clone_directory.txt");
    
    if config_file.exists() {
        std::fs::read_to_string(config_file)
            .map_err(|e| format!("Failed to read config: {}", e))
    } else {
        // Return default if no saved directory
        Ok(dirs::home_dir()
            .ok_or_else(|| "Could not find home directory".to_string())?
            .join(".simplegit")
            .to_string_lossy()
            .to_string())
    }
}

fn get_exe_dir() -> Result<PathBuf, String> {
    std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or_else(|| "Could not get executable directory".to_string())
        .map(|p| p.to_path_buf())
}

// Add this function near the top of the file, after the imports
fn check_required_env_vars() -> Result<(), String> {
    let required_vars = [
        ("GITHUB_CLIENT_ID", "GitHub Client ID"),
        ("GITHUB_CLIENT_SECRET", "GitHub Client Secret")
    ];

    let mut missing_vars = Vec::new();

    for (var, display_name) in required_vars.iter() {
        if std::env::var(var).is_err() {
            missing_vars.push(*display_name);
        }
    }

    if !missing_vars.is_empty() {
        let os_specific_instructions = if cfg!(target_os = "windows") {
            "1. Open System Properties (Win + Pause/Break)\n\
             2. Click 'Environment Variables'\n\
             3. Under 'User variables', click 'New'\n\
             4. Add each missing variable"
        } else if cfg!(target_os = "macos") {
            "1. Open Terminal\n\
             2. Edit ~/.zshrc or ~/.bash_profile\n\
             3. Add: export VARIABLE_NAME=value\n\
             4. Run: source ~/.zshrc (or ~/.bash_profile)"
        } else {
            "1. Open Terminal\n\
             2. Edit ~/.profile or ~/.bashrc\n\
             3. Add: export VARIABLE_NAME=value\n\
             4. Run: source ~/.profile (or ~/.bashrc)"
        };

        let error_message = format!(
            "Missing required environment variables:\n\n{}\n\n\
            How to set environment variables on your system:\n\n{}\n\n\
            After setting variables, restart the application.",
            missing_vars.join("\n"),
            os_specific_instructions
        );
        return Err(error_message);
    }

    Ok(())
}

#[tauri::command]
async fn stage_changes(_path: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_mut() {
        repo.stage_changes()
            .map_err(|e| e.to_string())?;
        Ok("Changes staged successfully".into())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn commit_changes(_path: String, message: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_mut() {
        repo.commit_changes(&message)
            .map_err(|e| e.to_string())?;
        Ok("Changes committed successfully".into())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn create_branch(_path: String, branch_name: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_ref() {
        repo.create_branch(&branch_name)
            .map_err(|e| e.to_string())?;
        Ok(format!("Branch '{}' created successfully", branch_name))
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn checkout_branch(_path: String, branch_name: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_ref() {
        repo.checkout_branch(&branch_name)
            .map_err(|e| e.to_string())?;
        Ok(format!("Switched to branch '{}'", branch_name))
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn merge_branch(_path: String, branch_name: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_ref() {
        repo.merge_branch(&branch_name)
            .map_err(|e| e.to_string())?;
        Ok(format!("Branch '{}' merged successfully", branch_name))
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn delete_branch(_path: String, branch_name: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_ref() {
        repo.delete_branch(&branch_name)
            .map_err(|e| e.to_string())?;
        Ok(format!("Branch '{}' deleted successfully", branch_name))
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn view_commit_log(_path: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_ref() {
        repo.view_commit_log()
            .map_err(|e| e.to_string())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn amend_commit(_path: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_mut() {
        repo.amend_commit()
            .map_err(|e| e.to_string())?;
        Ok("Commit amended successfully".into())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn get_current_branch(_path: String, state: State<'_, RepoState>) -> Result<String, String> {
    if let Some(repo) = state.0.lock().as_ref() {
        repo.get_current_branch()
            .map_err(|e| e.to_string())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn list_branches(_path: String, state: State<'_, RepoState>) -> Result<Vec<String>, String> {
    if let Some(repo) = state.0.lock().as_ref() {
        repo.list_branches()
            .map_err(|e| e.to_string())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn list_tags(_path: String, state: State<'_, RepoState>) -> Result<Vec<String>, String> {
    if let Some(repo) = state.0.lock().as_ref() {
        repo.list_tags()
            .map_err(|e| e.to_string())
    } else {
        Err("No repository opened".into())
    }
}

#[tauri::command]
async fn remove_local_repository(path: String, state: State<'_, RepoState>) -> Result<String, String> {
    let path_buf = PathBuf::from(&path);
    
    // Validate path is within allowed directories
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;
    
    if !path_buf.starts_with(&home_dir) {
        return Err("Cannot remove repositories outside of home directory".into());
    }

    // Check if the directory exists
    if !path_buf.exists() {
        return Ok("Repository directory already removed".into());
    }

    // Clear Git state if this is the current repository
    if let Some(current_repo) = state.0.lock().as_ref() {
        // Use a method to get the path instead of accessing the field directly
        if current_repo.get_path() == path_buf {
            *state.0.lock() = None;
        }
    }

    // Attempt to remove the directory and all its contents
    match std::fs::remove_dir_all(&path_buf) {
        Ok(_) => {
            // Verify removal
            if path_buf.exists() {
                return Err("Failed to verify repository removal".into());
            }
            Ok("Repository removed successfully".into())
        }
        Err(e) => Err(format!("Failed to remove repository: {}", e)),
    }
}

fn main() {
    // Load environment variables first
    dotenv::dotenv().ok();

    // Check required environment variables
    if let Err(error_message) = check_required_env_vars() {
        // Create a simple message dialog using native message box
        tauri::api::dialog::blocking::message(
            None::<&tauri::Window>,
            "Configuration Error",
            error_message
        );
        std::process::exit(1);
    }

    // Create the context first
    let context = tauri::generate_context!();
    
    // Load saved taskbar state from app config
    let window_state = WindowState {
        is_skip_taskbar: tauri::api::path::app_local_data_dir(&context.config())
            .and_then(|path| std::fs::read_to_string(path.join("taskbar_state.txt")).ok())
            .and_then(|state| state.trim().parse().ok())
            .unwrap_or(false), // Default to false if no saved state
    };
    
    let window_state = Mutex::new(window_state);
    
    // Create the tray menu first, getting the initial state
    let tray_menu = SystemTray::new().with_menu(
        create_tray_menu(window_state.lock().unwrap().is_skip_taskbar)
    );
    
    let _app = tauri::Builder::default()
        .manage(RepoState::new())
        .manage(AuthState::new())
        .manage(window_state)
        .system_tray(tray_menu)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick {..} | SystemTrayEvent::DoubleClick {..} => {
                if let Some(window) = app.get_window("main") {
                    // Toggle window visibility based on current state
                    match window.is_visible() {
                        Ok(visible) => {
                            if visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        Err(_) => {
                            // If we can't get visibility state, try to show window
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => {
                let window = app.get_window("main").unwrap();
                match id.as_str() {
                    "show" => {
                        // Always show and focus window regardless of taskbar state
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    "hide" => {
                        let _ = window.hide();
                    }
                    "toggle_taskbar" => {
                        let state = app.state::<Mutex<WindowState>>();
                        let mut state_guard = state.lock().unwrap();
                        state_guard.is_skip_taskbar = !state_guard.is_skip_taskbar;
                        let _ = window.set_skip_taskbar(state_guard.is_skip_taskbar);
                        
                        // Save the new state
                        if let Some(app_dir) = tauri::api::path::app_local_data_dir(&app.config()) {
                            let _ = std::fs::create_dir_all(&app_dir);
                            let _ = std::fs::write(
                                app_dir.join("taskbar_state.txt"),
                                state_guard.is_skip_taskbar.to_string()
                            );
                        }
                        
                        let tray_handle = app.tray_handle();
                        let _ = tray_handle.set_menu(create_tray_menu(state_guard.is_skip_taskbar));
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            open_repository,
            push_changes,
            push_changes_remote,
            revert_commit,
            revert_commit_remote,
            github_auth,
            handle_auth_callback,
            list_github_repos,
            get_repository_stats,
            github_logout,
            github_cancel_auth,
            check_auth_status,
            get_remote_repository_stats,
            pull_changes,
            clone_repository,
            set_github_token,
            cleanup_before_close,
            validate_github_token,
            stash_changes,
            stash_pop,
            create_tag,
            reset_hard,
            list_remotes,
            view_diff,
            get_repository_settings,
            get_home_dir,
            set_clone_directory,
            stage_changes,
            commit_changes,
            create_branch,
            checkout_branch,
            merge_branch,
            delete_branch,
            view_commit_log,
            amend_commit,
            get_current_branch,
            list_branches,
            list_tags,
            remove_local_repository,
        ])
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            window.set_decorations(true).unwrap();
            
            // Apply saved taskbar state on startup
            let state = app.state::<Mutex<WindowState>>();
            let state = state.lock().unwrap();
            window.set_skip_taskbar(state.is_skip_taskbar).unwrap();
            
            window.show().unwrap();
            window.set_focus().unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}