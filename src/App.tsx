import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/dialog";
import { Check, Upload, LogOut, Settings } from "lucide-react";
import { Button } from "./components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "./components/ui/tooltip";
import "./styles/globals.css";
import { listen } from "@tauri-apps/api/event";
import { RepositoryDashboard } from "./components/features/repository/dashboard";
import { Repository, LocalRepository } from "./types/repository";
import { RepositoryStats } from "./types/repositoryStats";
import { GitOperationsPanel } from "@/components/features/operations/GitOperationsPanel";
import { SettingsDialog } from "./components/features/settings/SettingsDialog";
import { LoadingSpinner } from "./components/ui/loading-spinner";

// Helper functions for pinned repositories
const savePinnedRepos = (repos: string[]) => {
  localStorage.setItem("pinnedRepos", JSON.stringify(repos));
};

// Load pinned repositories from localStorage
const loadPinnedRepos = (): string[] => {
  const saved = localStorage.getItem("pinnedRepos");
  return saved ? JSON.parse(saved) : [];
};

// Helper functions for state persistence
const saveState = (key: string, value: any) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const loadState = (key: string) => {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : null;
};

// Main App component
function App() {
  const [repoPath, setRepoPath] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [theme, setTheme] = useState<string>(() => {
    const savedTheme = loadState("theme");
    return savedTheme || "colourful"; // Default to "colourful" if no saved theme
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [localRepository, setLocalRepository] = useState<
    LocalRepository | undefined
  >();
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    document.documentElement.className = theme;
    document.body.className = theme;
    document.body.style.backgroundColor =
      theme === "colourful"
        ? "#1a1626"
        : window
            .getComputedStyle(document.documentElement)
            .getPropertyValue("--background");
  }, [theme]);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setupListeners = async () => {
      const handleUnload = () => {
        if (isAuthenticating) {
          invoke("github_cancel_auth").catch(console.error);
        }
      };

      const handleVisibilityChange = () => {
        if (document.hidden && isAuthenticating) {
          invoke("github_cancel_auth").catch(console.error);
          setIsAuthenticating(false);
          setMessage("Authentication cancelled - browser window closed");
        }
      };

      window.addEventListener("unload", handleUnload);
      document.addEventListener("visibilitychange", handleVisibilityChange);

      unlisteners.push(
        await listen("auth-success", () => {
          setIsAuthenticated(true);
          setIsAuthenticating(false);
          setMessage("Authentication successful");
        }),

        await listen("auth-error", (event: any) => {
          setIsAuthenticated(false);
          setIsAuthenticating(false);
          setMessage(`Authentication failed: ${event.payload}`);
        }),

        await listen("auth-timeout", () => {
          setIsAuthenticated(false);
          setIsAuthenticating(false);
          setMessage("Authentication timed out. Please try again.");
        }),

        () => {
          window.removeEventListener("unload", handleUnload);
          document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange
          );
        }
      );
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [isAuthenticating]);

  const handleSelectLocal = async () => {
    setIsLoading(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected && typeof selected === "string") {
        const result = await invoke<string>("open_repository", {
          path: selected,
        });

        // Get the repository name from the last part of the path
        const name = selected.split(/[\\/]/).pop() || selected;

        // Get initial stats for the local repository
        const stats = await invoke<RepositoryStats>("get_repository_stats", {
          path: selected,
        });

        setLocalRepository({
          path: selected,
          name,
          stats,
          isLocal: true,
        });

        setRepoPath(selected);
        setMessage(result);
      }
    } catch (error) {
      setMessage(`Error: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRepository = (repo: Repository) => {
    setRepoPath(repo.path);
    setMessage(`Selected repository: ${repo.name}`);
  };

  useEffect(() => {
    // Set theme
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    document.documentElement.classList.toggle("dark", prefersDark);

    // Add loaded class once content is ready
    document.getElementById("root")?.classList.add("loaded");
  }, []);

  const handleGithubAuth = async () => {
    setIsLoading(true);
    try {
      setMessage("Opening authentication window...");
      const result = await invoke<string>("github_auth");

      if (result === "Authentication successful") {
        setIsAuthenticated(true);

        // Get the token from the auth state
        const token = localStorage.getItem("github_token");
        if (token) {
          await invoke("set_github_token", { token });
        }

        // Fetch repositories again after successful authentication
        try {
          const githubRepos = await invoke<string[]>("list_github_repos");
          const pinnedRepos = loadPinnedRepos();

          const repositories: Repository[] = githubRepos.map((repoName) => ({
            name: repoName.split("/").pop() || repoName,
            path: repoName,
            isPinned: pinnedRepos.includes(repoName),
            stats: {
              commits: 0,
              branches: 0,
              contributors: 0,
            },
          }));

          setRepositories(repositories);
          setMessage("Successfully connected to GitHub");
        } catch (error) {
          console.error("Failed to fetch repositories:", error);
          setMessage(
            "Authentication successful but failed to fetch repositories"
          );
        }
      }
    } catch (error) {
      console.error("Auth error:", error);
      setMessage(`Error: ${error}. Click to try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await invoke("github_logout");
      setIsAuthenticated(false);
      setRepositories([]);
      setMessage("Login to see remote repositories");
    } catch (error) {
      setMessage(`Error logging out: ${error}`);
    }
  };

  // Add cleanup on component unmount
  useEffect(() => {
    return () => {
      if (isAuthenticating) {
        invoke("github_cancel_auth").catch(console.error);
      }
    };
  }, []);

  const handlePinRepository = (repo: Repository) => {
    const updatedRepositories = repositories.map((r) => {
      if (r.path === repo.path) {
        return {
          ...r,
          isPinned: !r.isPinned,
        };
      }
      return r;
    });

    // Save pinned repos to localStorage
    const pinnedRepos = updatedRepositories
      .filter((r) => r.isPinned)
      .map((r) => r.path);
    savePinnedRepos(pinnedRepos);

    setRepositories(updatedRepositories);
    setMessage(`${repo.name} ${repo.isPinned ? "unpinned" : "pinned"}`);
  };

  // Add a handler for removing local repository
  const handleRemoveLocal = async () => {
    if (localRepository) {
      try {
        // Attempt to remove the repository files
        await invoke("remove_local_repository", {
          path: localRepository.path
        });
        
        // Clear the local repository state
        setLocalRepository(undefined);
        setRepoPath("");
        setMessage("Local repository removed successfully");
        
        // Force close context menus
        document.body.click();
      } catch (error) {
        setMessage(`Error removing repository: ${error}`);
      }
    }
  };

  const handleRepositoryCloned = () => {
    setLocalRepository({
      path: repoPath,
      name: repoPath.split("/").pop() || repoPath,
      stats: { commits: 0, branches: 0, contributors: 0 },
      isLocal: true,
    });
  };

  useEffect(() => {
    saveState("repoPath", repoPath);
  }, [repoPath]);

  useEffect(() => {
    saveState("theme", theme);
  }, [theme]);

  useEffect(() => {
    saveState("isAuthenticated", isAuthenticated);
  }, [isAuthenticated]);

  useEffect(() => {
    saveState("repositories", repositories);
  }, [repositories]);

  const checkAuth = async () => {
    const token = localStorage.getItem("github_token");
    if (token) {
      try {
        const isValid = await invoke<boolean>("validate_github_token", {
          token,
        });
        if (isValid) {
          await invoke("set_github_token", { token });
          setIsAuthenticated(true);

          // Fetch repositories after successful auth
          try {
            const githubRepos = await invoke<string[]>("list_github_repos");
            const pinnedRepos = loadPinnedRepos();

            const repositories: Repository[] = githubRepos.map((repoName) => ({
              name: repoName.split("/").pop() || repoName,
              path: repoName,
              isPinned: pinnedRepos.includes(repoName),
              stats: {
                commits: 0,
                branches: 0,
                contributors: 0,
              },
            }));

            setRepositories(repositories);
          } catch (error) {
            console.error("Failed to fetch repositories:", error);
          }
        } else {
          localStorage.removeItem("github_token");
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        localStorage.removeItem("github_token");
        setIsAuthenticated(false);
      }
    }
  };

  // First useEffect that uses checkAuth
  useEffect(() => {
    checkAuth();
  }, []);

  // Second useEffect that also uses checkAuth
  useEffect(() => {
    // Restore all saved state on mount
    const savedTheme = loadState("theme");
    if (savedTheme) setTheme(savedTheme);

    const savedRepos = loadState("repositories");
    if (savedRepos) setRepositories(savedRepos);

    const lastAuthState = loadState("lastAuthState");
    if (lastAuthState) {
      checkAuth();
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      // Save all important state
      saveState("theme", theme);
      saveState("repositories", repositories);
      if (isAuthenticated) {
        saveState("lastAuthState", true);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [theme, repositories, isAuthenticated]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (localRepository) {
        invoke("cleanup_repository", { path: localRepository.path }).catch(
          console.error
        );
      }
    };
  }, [localRepository]);

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-background overflow-hidden">
        {/* Sidebar */}
        <aside className="min-w-[350px] border-r border-border bg-card">
          <div className="flex flex-col h-screen">
            {/* Header */}
            <div className="h-[73px] p-6 border-b border-border shrink-0">
              <div className="flex justify-center items-center relative">
                <h1 className="text-3xl font-bold text-primary">SimpleGit</h1>
                {isAuthenticated && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleLogout}
                        className="h-8 w-8 absolute right-0"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Logout</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Repository List */}
            <div className="flex-1 overflow-y-auto">
              <RepositoryDashboard
                repositories={repositories}
                localRepository={localRepository}
                onSelect={(repo) => {
                  if ("isLocal" in repo) {
                    if (
                      !localRepository ||
                      repo.path !== localRepository.path
                    ) {
                      handleSelectLocal();
                    } else {
                      setRepoPath(repo.path);
                      setMessage(`Selected repository: ${repo.name}`);
                    }
                  } else {
                    handleSelectRepository(repo);
                  }
                }}
                onPin={handlePinRepository}
                onUpdateRepositories={setRepositories}
                onMessage={setMessage}
                activeRepository={repoPath}
                onRemoveLocal={handleRemoveLocal}
                isLoading={isLoading}
              />
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col h-screen relative">
          {/* Settings button */}
          <div className="absolute top-6 right-6 z-10">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSettings(true)}
                  className="w-10 h-10"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Settings</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Settings Dialog */}
          <SettingsDialog
            open={showSettings}
            onOpenChange={setShowSettings}
            theme={theme}
            onThemeChange={setTheme}
          />

          {/* Top Actions Section */}
          <div className="h-[73px] p-6 flex justify-start gap-4 border-b border-border">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleSelectLocal}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-5 w-5" />
                  Select Local Repository
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Select a local repository to work with</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleGithubAuth}
                  className="flex items-center gap-2"
                  disabled={isAuthenticated}
                >
                  <Upload className="h-5 w-5" />
                  {isAuthenticated
                    ? "Connected to GitHub"
                    : "Select Remote Repository"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {isAuthenticated
                    ? "Select a remote repository from GitHub"
                    : "Login and select a GitHub repository"}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto relative">
            {isLoading && (
              <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-10">
                <LoadingSpinner />
              </div>
            )}
            <div className="p-8 w-full">
              <div className="text-center mb-8">
                <h1 className="text-4xl font-bold text-primary">
                  Git Operations
                </h1>
                <div className="mt-2 h-1 w-32 bg-primary/30 mx-auto rounded-full" />
              </div>
              <GitOperationsPanel
                repoPath={repoPath}
                localRepository={localRepository || null}
                onMessage={setMessage}
                onRepositoryCloned={handleRepositoryCloned}
              />
            </div>
          </div>

          {/* Status bar */}
          <footer className="h-10 border-t border-border bg-card px-6 flex items-center justify-between shrink-0">
            <span className="text-sm text-muted-foreground">
              {repoPath
                ? `Current repository: ${repoPath}`
                : message || "No repository selected"}
            </span>
            {isAuthenticated && (
              <span className="text-sm text-green-500">
                <Check className="h-4 w-4 inline-block mr-2" />
                GitHub Connected
              </span>
            )}
          </footer>
        </main>
      </div>
    </TooltipProvider>
  );
}

export default App;
