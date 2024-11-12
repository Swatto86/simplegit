use oauth2::{
    basic::BasicClient, AuthUrl, ClientId, ClientSecret, RedirectUrl, Scope,
    TokenUrl, AuthorizationCode, TokenResponse, CsrfToken,
};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::net::TcpListener;
use tauri::Window;
use tokio::io::{AsyncWriteExt, BufReader, AsyncBufReadExt};
use tokio::net::TcpStream;
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use std::borrow::Cow;
use crate::git_commands::RepositoryStats;

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct AuthState {
    pub access_token: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("OAuth error: {0}")]
    OAuth(String),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),
}

#[derive(Clone)]
pub struct GitHubAuth {
    oauth_client: Arc<BasicClient>,
    client: reqwest::Client,
    auth_state: Arc<Mutex<AuthState>>,
    pub is_authenticating: Arc<AtomicBool>,
}

impl GitHubAuth {
    pub fn new() -> Self {
        let client_id = ClientId::new(
            env::var("GITHUB_CLIENT_ID").expect("Missing GITHUB_CLIENT_ID environment variable"),
        );
        let client_secret = ClientSecret::new(
            env::var("GITHUB_CLIENT_SECRET").expect("Missing GITHUB_CLIENT_SECRET environment variable"),
        );

        let auth_url = AuthUrl::new("https://github.com/login/oauth/authorize".to_string())
            .expect("Invalid authorization endpoint URL");
        let token_url = TokenUrl::new("https://github.com/login/oauth/access_token".to_string())
            .expect("Invalid token endpoint URL");

        let redirect_url = RedirectUrl::new("http://localhost:3000/callback".to_string())
            .expect("Invalid redirect URL");

        let oauth_client = BasicClient::new(
            client_id,
            Some(client_secret),
            auth_url,
            Some(token_url),
        )
        .set_redirect_uri(redirect_url);

        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(USER_AGENT, HeaderValue::from_static("simplegit"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .expect("Failed to create HTTP client");

        Self {
            oauth_client: Arc::new(oauth_client),
            client,
            auth_state: Arc::new(Mutex::new(AuthState::default())),
            is_authenticating: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn set_access_token(&self, token: String) {
        if let Ok(mut state) = self.auth_state.lock() {
            state.access_token = Some(token);
            self.is_authenticating.store(false, Ordering::SeqCst);
        }
    }

    fn find_free_port() -> Option<u16> {
        for port in 3000..3010 {
            if TcpListener::bind(("127.0.0.1", port)).is_ok() {
                return Some(port);
            }
        }
        None
    }

    pub async fn start_login(&self, window: Window) -> Result<String, AuthError> {
        let port = Self::find_free_port().ok_or_else(|| 
            AuthError::OAuth("No available ports. Please try again in a moment.".to_string())
        )?;
        
        let listener = TcpListener::bind(("127.0.0.1", port))?;
        listener.set_nonblocking(true)?;
        
        let redirect_url = RedirectUrl::new(format!("http://localhost:{}/callback", port))
            .map_err(|e| AuthError::OAuth(e.to_string()))?;
        
        let csrf_token = CsrfToken::new_random();
        let (auth_url, _csrf_token) = self.oauth_client
            .authorize_url(|| csrf_token)
            .set_redirect_uri(Cow::Owned(redirect_url.clone()))
            .add_scope(Scope::new("repo".to_string()))
            .add_scope(Scope::new("user".to_string()))
            .add_extra_param("prompt", "select_account")
            .url();

        window.eval(&format!("window.open('{}', '_blank')", auth_url))?;

        let oauth_client = self.oauth_client.clone();
        let auth_state = self.auth_state.clone();
        let window_clone = window.clone();
        
        let timeout = tokio::time::sleep(tokio::time::Duration::from_secs(120));
        let auth_task = async move {
            loop {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let mut stream = TcpStream::from_std(stream)?;
                        let mut reader = BufReader::new(&mut stream);
                        let mut request_line = String::new();
                        
                        reader.read_line(&mut request_line).await?;
                        
                        if let Some(code) = request_line
                            .split_whitespace()
                            .nth(1)
                            .and_then(|path| path.split("code=").nth(1))
                            .map(|code| code.split('&').next().unwrap_or(code))
                        {
                            let token = oauth_client
                                .exchange_code(AuthorizationCode::new(code.to_string()))
                                .set_redirect_uri(Cow::Owned(redirect_url.clone()))
                                .request_async(oauth2::reqwest::async_http_client)
                                .await
                                .map_err(|e| AuthError::OAuth(e.to_string()))?;

                            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n\
                                <html><body><h1>Authentication successful!</h1><p>You can close this window now.</p></body></html>";
                            stream.write_all(response.as_bytes()).await?;
                            
                            if let Ok(mut state) = auth_state.lock() {
                                let token_secret = token.access_token().secret().clone();
                                state.access_token = Some(token_secret.clone());
                                window_clone.eval(&format!("localStorage.setItem('github_token', '{}')", token_secret)).ok();
                            }
                            window_clone.emit("auth-success", ()).map_err(|e| AuthError::Tauri(e))?;
                            return Ok(());
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                        continue;
                    }
                    Err(e) => {
                        return Err(AuthError::Io(e));
                    }
                }
            }
        };

        tokio::select! {
            result = auth_task => {
                match result {
                    Ok(_) => Ok("Authentication successful".to_string()),
                    Err(e) => {
                        window.emit("auth-error", e.to_string()).ok();
                        Err(e)
                    }
                }
            }
            _ = timeout => {
                window.emit("auth-timeout", "Authentication timed out").ok();
                Err(AuthError::OAuth("Authentication timed out".to_string()))
            }
        }
    }

    pub async fn handle_callback(
        &self,
        code: String,
    ) -> Result<(), AuthError> {
        let token = self.oauth_client
            .exchange_code(AuthorizationCode::new(code))
            .request_async(oauth2::reqwest::async_http_client)
            .await
            .map_err(|e| AuthError::OAuth(e.to_string()))?;

        if let Ok(mut state) = self.auth_state.lock() {
            state.access_token = Some(token.access_token().secret().clone());
        }
        Ok(())
    }

    pub async fn list_repositories(&self) -> Result<Vec<String>, AuthError> {
        let token = {
            let state = self.auth_state.lock().unwrap();
            state.access_token
                .clone()
                .ok_or_else(|| AuthError::OAuth("Not authenticated".to_string()))?
        };

        let response = self.client
            .get("https://api.github.com/user/repos")
            .header(
                "Authorization",
                format!("Bearer {}", token),
            )
            .send()
            .await?
            .json::<Vec<serde_json::Value>>()
            .await?;

        Ok(response
            .into_iter()
            .filter_map(|repo| repo["full_name"].as_str().map(String::from))
            .collect())
    }

    pub fn cancel_auth(&self) {
        self.is_authenticating.store(false, Ordering::SeqCst);
        if let Ok(mut state) = self.auth_state.lock() {
            state.access_token = None;
        }
        self.force_cleanup_port();
    }

    fn force_cleanup_port(&self) {
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("cmd")
                .args(&["/C", "for /f \"tokens=5\" %a in ('netstat -aon ^| findstr :3000') do taskkill /F /PID %a"])
                .output();
        }

        #[cfg(unix)]
        {
            let _ = std::process::Command::new("sh")
                .arg("-c")
                .arg("lsof -ti:3000 | xargs kill -9")
                .output();
        }
    }

    pub async fn get_repository_stats(&self, repo_full_name: &str) -> Result<RepositoryStats, AuthError> {
        let token = {
            let state = self.auth_state.lock().unwrap();
            state.access_token
                .clone()
                .ok_or_else(|| AuthError::OAuth("Not authenticated".to_string()))?
        };

        println!("Fetching stats with token: {}", token.chars().take(10).collect::<String>());
        println!("For repository: {}", repo_full_name);

        if !repo_full_name.contains('/') {
            return Err(AuthError::OAuth(format!(
                "Invalid repository name format. Expected 'owner/repo-name', got '{}'",
                repo_full_name
            )));
        }

        let client = &self.client;
        
        let repo_url = format!("https://api.github.com/repos/{}", repo_full_name);
        println!("Making request to: {}", repo_url);
        
        let repo_response = client
            .get(&repo_url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "simplegit")
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await?;

        println!("Response status: {}", repo_response.status());
        
        if !repo_response.status().is_success() {
            let error_text = repo_response.text().await?;
            println!("Error response: {}", error_text);
            return Err(AuthError::OAuth(format!("GitHub API error: {}", error_text)));
        }

        let repo_response = repo_response.json::<serde_json::Value>().await?;
        println!("Repo response: {}", serde_json::to_string_pretty(&repo_response).unwrap());

        let contributors_url = format!("https://api.github.com/repos/{}/contributors?per_page=1", repo_full_name);
        let contributors_response = client
            .get(&contributors_url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "simplegit")
            .send()
            .await?;
        
        let contributors = if let Some(count) = contributors_response.headers().get("link") {
            let link = count.to_str().unwrap_or("");
            if let Some(last_page) = link.split(",").find(|&l| l.contains("rel=\"last\"")) {
                if let Some(page_num) = last_page.split("&page=").nth(1) {
                    page_num.split(">").next().unwrap_or("0").parse().unwrap_or(0)
                } else {
                    0
                }
            } else {
                1
            }
        } else {
            0
        };

        Ok(RepositoryStats {
            commits: repo_response["default_branch"].as_str()
                .and_then(|_branch| repo_response["commits_url"].as_str())
                .map(|_| repo_response["size"].as_u64().unwrap_or(0) as usize)
                .unwrap_or(0),
            branches: repo_response["branches_url"].as_str()
                .map(|_| 1)
                .unwrap_or(0),
            contributors,
        })
    }

    pub async fn validate_token(&self, token: &str) -> Result<bool, AuthError> {
        if let Ok(mut state) = self.auth_state.lock() {
            state.access_token = Some(token.to_string());
        }
        
        // Try to make a test API call to validate the token
        let response = self.client
            .get("https://api.github.com/user")
            .header(
                "Authorization",
                format!("Bearer {}", token),
            )
            .send()
            .await?;
            
        Ok(response.status().is_success())
    }
}