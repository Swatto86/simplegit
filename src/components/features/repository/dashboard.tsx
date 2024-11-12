import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import {
  Star,
  Search,
  GitBranch,
  Users,
  History,
  ExternalLink,
  Folder,
  Github,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { Repository } from "../../../types/repository";
import { RepositoryStats } from "../../../types/repositoryStats";
import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/shell";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../../components/ui/context-menu";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { confirm } from "@tauri-apps/api/dialog";

interface LocalRepository {
  path: string;
  name: string;
  stats: RepositoryStats;
  isLocal: true;
}

export const RepositoryDashboard: React.FC<{
  repositories: Repository[];
  localRepository?: LocalRepository;
  onSelect: (repo: Repository | LocalRepository) => void;
  onPin: (repo: Repository) => void;
  onUpdateRepositories?: (repos: Repository[]) => void;
  onMessage?: (message: string) => void;
  activeRepository?: string;
  onRemoveLocal?: () => void;
  isLoading?: boolean;
}> = ({
  repositories,
  localRepository,
  onSelect,
  onPin,
  onUpdateRepositories,
  onMessage,
  activeRepository,
  onRemoveLocal,
  isLoading = false,
}) => {
  const [search, setSearch] = React.useState("");
  const [isLoadingStats, setIsLoadingStats] = React.useState(false);

  const filteredRepos = repositories.filter((repo) =>
    repo.name.toLowerCase().includes(search.toLowerCase())
  );

  // Sort repositories to put active one first
  const sortedRepos = React.useMemo(() => {
    const sorted = [...filteredRepos].sort((a, b) => {
      // First, sort by active status
      if (a.path === activeRepository) return -1;
      if (b.path === activeRepository) return 1;
      
      // Then, sort by pinned status
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      
      return 0;
    });

    // Only add local repository to top if it's active
    if (
      localRepository &&
      !search &&
      localRepository.path === activeRepository
    ) {
      return [localRepository, ...sorted];
    } else if (localRepository && !search) {
      return [...sorted, localRepository];
    }

    return sorted;
  }, [filteredRepos, activeRepository, localRepository, search]);

  const fetchRemoteStats = async (repo: Repository) => {
    if (!repo.stats.commits && !repo.stats.branches && !repo.stats.contributors) {
      setIsLoadingStats(true);
      try {
        const repoPath = repo.path.includes("/") ? repo.path : repo.name;
        console.log(`Fetching stats for ${repoPath}`);
        const stats = await invoke<RepositoryStats>("get_remote_repository_stats", {
          repoName: repoPath,
        });
        console.log(`Received stats:`, stats);
        return {
          ...repo,
          stats,
        };
      } catch (error) {
        console.error("Failed to fetch remote stats:", error);
        onMessage?.(`Error fetching stats: ${error}`);
        return repo;
      } finally {
        setIsLoadingStats(false);
      }
    }
    return repo;
  };

  React.useEffect(() => {
    const updateStats = async () => {
      const updatedRepos = await Promise.all(
        repositories.map((repo) => fetchRemoteStats(repo))
      );
      if (
        JSON.stringify(updatedRepos) !== JSON.stringify(repositories) &&
        onUpdateRepositories
      ) {
        onUpdateRepositories(updatedRepos);
      }
    };

    updateStats();
  }, [repositories, onUpdateRepositories]);

  const handleRemoveLocal = async () => {
    const confirmed = await confirm(
      "Are you sure you want to remove this repository?",
      "This will delete the local copy of the repository. This action cannot be undone."
    );
    
    if (confirmed) {
      onRemoveLocal?.();
    }
  };

  const renderRepositoryCard = (repo: Repository | LocalRepository) => {
    const isLocal = "isLocal" in repo;
    const isActive = repo.path === activeRepository;

    const card = (
      <Card
        key={repo.path}
        className={`
          hover:border-primary transition-all duration-300 cursor-pointer group
          transform hover:scale-[1.02] hover:shadow-lg
          ${isActive ? 'border-primary bg-primary/10 shadow-lg scale-[1.02]' : 'border-border'}
          ${isLocal ? 'border-dashed bg-muted/20' : ''}
          ${!isLocal && !isActive ? 'opacity-85' : ''}
        `}
        onClick={() => {
          if (isLocal && repo.path === localRepository?.path) {
            onSelect(repo);
          } else if (!isLocal) {
            onSelect(repo);
          }
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-1">
            {isLocal ? (
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-primary" />
                <span className="text-xs text-primary font-medium px-1.5 py-0.5 rounded-md bg-primary/10">
                  LOCAL
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Github className="h-4 w-4 text-muted-foreground" />
                {localRepository?.path === repo.path && (
                  <span className="text-xs text-green-500 font-medium px-1.5 py-0.5 rounded-md bg-green-500/10">
                    CLONED
                  </span>
                )}
              </div>
            )}
            <CardTitle
              className={`text-base font-medium truncate flex-1 mr-4 transition-colors
              ${isActive ? "text-primary" : "group-hover:text-primary"}`}
            >
              {repo.name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {!isLocal && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        open(`https://github.com/${repo.path}`);
                      }}
                      className="w-8 h-8 p-0 flex items-center justify-center hover:text-primary transition-colors"
                      aria-label="Open in browser"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View this project on GitHub's website</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPin(repo as Repository);
                      }}
                      className={`w-8 h-8 p-0 flex items-center justify-center transition-colors
                        ${repo.isPinned ? 'text-primary' : 'hover:text-primary'}`}
                      aria-label={
                        repo.isPinned
                          ? "Remove from favorites"
                          : "Add to favorites"
                      }
                    >
                      <Star
                        className="h-4 w-4"
                        fill={repo.isPinned ? "currentColor" : "none"}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {repo.isPinned
                        ? "Remove from your favorites"
                        : "Add to your favorites for quick access"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between text-sm text-muted-foreground mb-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-help">
                  <History className="h-4 w-4" />
                  {repo.stats.commits ?? 0}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Number of saved changes made to this project</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-help">
                  <GitBranch className="h-4 w-4" />
                  {repo.stats.branches ?? 0}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Different versions of this project</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-help">
                  <Users className="h-4 w-4" />
                  {repo.stats.contributors ?? 0}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>People who have helped with this project</p>
              </TooltipContent>
            </Tooltip>
          </div>
          {isLocal && (
            <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
              <span className="flex-shrink-0">Path:</span>
              <span className="truncate">{repo.path}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );

    // Wrap local repository card with context menu
    if (isLocal) {
      return (
        <ContextMenu>
          <ContextMenuTrigger>{card}</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem 
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRemoveLocal();
              }}
            >
              Remove Local Repository
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
    }

    return card;
  };

  return (
    <div className="min-w-[250px] max-w-[400px] w-full h-full overflow-y-auto p-6">
      <div className="space-y-6">
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Input
              icon={<Search className="h-4 w-4" />}
              placeholder="Search repositories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        {repositories.length === 0 && !localRepository ? (
          <Card>
            {isLoading || isLoadingStats ? (
              <CardContent className="pt-6">
                <LoadingSpinner />
              </CardContent>
            ) : (
              <CardContent className="pt-6 text-center text-muted-foreground">
                Login to see remote repositories
              </CardContent>
            )}
          </Card>
        ) : (
          <div className="grid gap-4">
            {(isLoading || isLoadingStats) && (
              <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-10">
                <LoadingSpinner />
              </div>
            )}
            {sortedRepos.map(renderRepositoryCard)}
          </div>
        )}
      </div>
    </div>
  );
};
