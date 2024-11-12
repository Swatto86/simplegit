import React from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { Upload, Download, GitFork } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { OperationProps } from "../types";
import { FeedbackToast } from "@/components/ui/feedback-toast";

export const BasicOperations: React.FC<OperationProps> = ({
  repoPath,
  localRepository,
  onMessage,
  onRepositoryCloned,
}) => {
  const [isPushing, setIsPushing] = React.useState(false);
  const [isPulling, setIsPulling] = React.useState(false);
  const [isCloning, setIsCloning] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const showFeedback = (
    type: "success" | "error" | "info",
    message: string
  ) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
    onMessage(message);
  };

  const handleClone = async () => {
    if (!repoPath) {
      showFeedback("error", "Error: Please select a repository first");
      return;
    }

    try {
      setIsCloning(true);
      showFeedback("info", "Cloning repository...");

      const token = localStorage.getItem("github_token");
      if (!token) {
        showFeedback(
          "error",
          "Not authenticated with GitHub. Please login first."
        );
        return;
      }

      await invoke("set_github_token", { token });

      const customDir = localStorage.getItem("clone_directory");
      const repoName = repoPath.split("/").pop();
      const localPath = customDir
        ? `${customDir}/${repoName}`
        : `${await invoke<string>("get_home_dir")}/simplegit/${repoName}`;

      const result = await invoke<string>("clone_repository", {
        repoUrl: `https://github.com/${repoPath}.git`,
        path: localPath,
      });

      if (onRepositoryCloned) {
        onRepositoryCloned({
          path: localPath,
          name: repoName || repoPath,
        });
      }

      showFeedback("success", result);
    } catch (error) {
      console.error("Clone error:", error);
      showFeedback("error", `Error cloning repository: ${error}`);
    } finally {
      setIsCloning(false);
    }
  };

  const handlePush = async () => {
    if (!repoPath) {
      showFeedback("error", "Error: Please select a repository first");
      return;
    }

    if (!localRepository) {
      showFeedback("error", "Error: Please clone the repository first");
      return;
    }

    try {
      setIsPushing(true);
      showFeedback("info", "Pushing changes...");
      const isLocal = localRepository && localRepository.path === repoPath;
      const result = await invoke<string>(
        isLocal ? "push_changes" : "push_changes_remote",
        { path: repoPath }
      );
      showFeedback("success", result);
    } catch (error) {
      showFeedback("error", `Error pushing changes: ${error}`);
    } finally {
      setIsPushing(false);
    }
  };

  const handlePull = async () => {
    if (!repoPath) {
      showFeedback("error", "Error: Please select a repository first");
      return;
    }

    if (!localRepository) {
      showFeedback("error", "Error: Please clone the repository first");
      return;
    }

    try {
      setIsPulling(true);
      const result = await invoke<string>("pull_changes", {
        path: repoPath,
        isRemote: !localRepository,
      });
      showFeedback("success", result);
    } catch (error) {
      showFeedback("error", `Error pulling changes: ${error}`);
    } finally {
      setIsPulling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Operations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleClone} disabled={isCloning || !repoPath}>
                <GitFork className="h-4 w-4 mr-2" />
                {isCloning ? "Cloning..." : "Clone"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Download a copy of this repository to your computer</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handlePush}
                disabled={isPushing || !repoPath || !localRepository}
              >
                <Upload className="h-4 w-4 mr-2" />
                {isPushing ? "Pushing..." : "Push"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Send your saved work to GitHub so others can see it</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handlePull}
                disabled={isPulling || !repoPath || !localRepository}
              >
                <Download className="h-4 w-4 mr-2" />
                {isPulling ? "Pulling..." : "Pull"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Get the latest work that others have shared on GitHub</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
      {feedback && (
        <FeedbackToast
          type={feedback.type}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}
    </Card>
  );
};
