import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Archive, Tag, RotateCw, Network, GitCompare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { OperationProps } from "../types";
import { FeedbackToast } from "@/components/ui/feedback-toast";
import { DiffViewer } from "@/components/features/diff/DiffViewer";

interface DiffHunk {
  content: string;
  line_type: string;
  old_start: number;
  new_start: number;
  old_lines: number;
  new_lines: number;
}

interface DiffEntry {
  old_path: string | null;
  new_path: string | null;
  status: string;
  hunks: DiffHunk[];
}

export const AdvancedOperations: React.FC<OperationProps> = ({
  repoPath,
  localRepository,
  onMessage,
}) => {
  const [isStashing, setIsStashing] = useState(false);
  const [isTagging, setIsTagging] = useState(false);
  const [tagName, setTagName] = useState("");
  const [tagMessage, setTagMessage] = useState("");
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetCommitHash, setResetCommitHash] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [diffData, setDiffData] = useState<DiffEntry[]>([]);
  const [showDiffDialog, setShowDiffDialog] = useState(false);

  const showFeedback = (
    type: "success" | "error" | "info",
    message: string
  ) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
    onMessage(message);
  };

  const handleStash = async () => {
    try {
      setIsStashing(true);
      const result = await invoke<string>("stash_changes", {
        path: repoPath,
      });
      showFeedback("success", result);
    } catch (error) {
      showFeedback("error", `Error stashing changes: ${error}`);
    } finally {
      setIsStashing(false);
    }
  };

  const handleStashPop = async () => {
    try {
      const result = await invoke<string>("stash_pop", {
        path: repoPath,
      });
      showFeedback("success", result);
    } catch (error) {
      showFeedback("error", `Error applying stash: ${error}`);
    }
  };

  const handleCreateTag = async () => {
    if (!tagName) {
      showFeedback("error", "Please enter a tag name");
      return;
    }

    try {
      setIsTagging(true);
      const result = await invoke<string>("create_tag", {
        path: repoPath,
        tagName,
        message: tagMessage,
      });
      showFeedback("success", result);
      setShowTagDialog(false);
      setTagName("");
      setTagMessage("");
    } catch (error) {
      showFeedback("error", `Error creating tag: ${error}`);
    } finally {
      setIsTagging(false);
    }
  };

  const handleReset = async () => {
    if (!resetCommitHash) {
      showFeedback("error", "Please enter a commit hash");
      return;
    }

    try {
      setIsResetting(true);
      const result = await invoke<string>("reset_hard", {
        path: repoPath,
        commitHash: resetCommitHash,
      });
      showFeedback("success", result);
      setShowResetDialog(false);
      setResetCommitHash("");
    } catch (error) {
      showFeedback("error", `Error resetting repository: ${error}`);
    } finally {
      setIsResetting(false);
    }
  };

  const handleListRemotes = async () => {
    try {
      const result = await invoke<string>("list_remotes", {
        path: repoPath,
      });
      showFeedback("info", result);
    } catch (error) {
      showFeedback("error", `Error listing remotes: ${error}`);
    }
  };

  const handleDiff = async () => {
    if (!localRepository) {
      showFeedback("error", "Please clone the repository first");
      return;
    }

    try {
      const result = await invoke<DiffEntry[]>("view_diff", {
        path: localRepository.path,
      });

      if (result.length === 0) {
        showFeedback("info", "No changes detected");
        return;
      }

      setDiffData(result);
      setShowDiffDialog(true);
    } catch (error) {
      console.error("Diff error:", error);
      showFeedback("error", `Error viewing diff: ${error}`);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Advanced Operations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleStash}
                  disabled={!repoPath || !localRepository || isStashing}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  {isStashing ? "Stashing..." : "Stash"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Save your current changes temporarily without committing them
                </p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleStashPop}
                  disabled={!repoPath || !localRepository}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Apply Stash
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Restore your previously saved temporary changes</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setShowTagDialog(true)}
                  disabled={!repoPath || !localRepository}
                >
                  <Tag className="h-4 w-4 mr-2" />
                  Tag
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Create a named reference to mark an important point in your
                  project's history
                </p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  onClick={() => setShowResetDialog(true)}
                  disabled={!repoPath || !localRepository}
                >
                  <RotateCw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Reset your working directory to a specific commit (Warning:
                  this will discard all uncommitted changes)
                </p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleListRemotes}
                  disabled={!repoPath || !localRepository}
                >
                  <Network className="h-4 w-4 mr-2" />
                  Remotes
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  View and manage connections to other copies of your repository
                </p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleDiff}
                  disabled={!repoPath || !localRepository}
                >
                  <GitCompare className="h-4 w-4 mr-2" />
                  Diff
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View all current changes in your working directory</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Tag</DialogTitle>
            <DialogDescription>
              Enter a name and optional message for your tag
            </DialogDescription>
          </DialogHeader>
          <Input
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            placeholder="Tag name"
          />
          <Input
            value={tagMessage}
            onChange={(e) => setTagMessage(e.target.value)}
            placeholder="Tag message (optional)"
          />
          <Button onClick={handleCreateTag} disabled={isTagging}>
            {isTagging ? "Creating..." : "Create Tag"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Repository</DialogTitle>
            <DialogDescription>
              Enter the commit hash to reset to. This will discard all changes
              after this commit. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={resetCommitHash}
            onChange={(e) => setResetCommitHash(e.target.value)}
            placeholder="Commit hash"
          />
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={isResetting}
          >
            {isResetting ? "Resetting..." : "Reset"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showDiffDialog} onOpenChange={setShowDiffDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>File Changes</DialogTitle>
            <DialogDescription>
              Review your uncommitted changes
            </DialogDescription>
          </DialogHeader>
          <DiffViewer diffs={diffData} />
        </DialogContent>
      </Dialog>

      {feedback && (
        <FeedbackToast
          type={feedback.type}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}
    </>
  );
};
