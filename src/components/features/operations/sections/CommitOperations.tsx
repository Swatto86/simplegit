import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Save, History, RotateCcw, Check } from "lucide-react";
import { OperationProps } from "../types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FeedbackToast } from "@/components/ui/feedback-toast";

export const CommitOperations: React.FC<OperationProps> = ({
  repoPath,
  localRepository,
  onMessage,
}) => {
  const [isCommitting, setIsCommitting] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitHash, setCommitHash] = useState("");
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [showRevertDialog, setShowRevertDialog] = useState(false);
  const [feedback, setFeedback] = useState<{
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

  const handleStage = async () => {
    try {
      const result = await invoke<string>("stage_changes", { path: repoPath });
      showFeedback("success", result);
    } catch (error) {
      showFeedback("error", `Error staging changes: ${error}`);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage) {
      showFeedback("error", "Please enter a commit message");
      return;
    }

    try {
      setIsCommitting(true);
      const result = await invoke<string>("commit_changes", {
        path: repoPath,
        message: commitMessage,
      });
      showFeedback("success", result);
      setShowCommitDialog(false);
      setCommitMessage("");
    } catch (error) {
      showFeedback("error", `Error committing changes: ${error}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleRevert = async () => {
    if (!commitHash) {
      showFeedback("error", "Please enter a commit hash");
      return;
    }

    try {
      setIsReverting(true);
      const result = await invoke<string>(
        localRepository ? "revert_commit" : "revert_commit_remote",
        {
          path: repoPath,
          commitHash,
        }
      );
      showFeedback("success", result);
      setShowRevertDialog(false);
      setCommitHash("");
    } catch (error) {
      showFeedback("error", `Error reverting commit: ${error}`);
    } finally {
      setIsReverting(false);
    }
  };

  const handleViewLog = async () => {
    try {
      const result = await invoke<string>("view_commit_log", {
        path: repoPath,
      });
      showFeedback("info", result);
    } catch (error) {
      showFeedback("error", `Error viewing commit log: ${error}`);
    }
  };

  const handleAmend = async () => {
    try {
      const result = await invoke<string>("amend_commit", { path: repoPath });
      showFeedback("success", result);
    } catch (error) {
      showFeedback("error", `Error amending commit: ${error}`);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Commit Operations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleStage}
                  disabled={!repoPath || !localRepository}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Stage
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Mark files to be saved in your next commit</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setShowCommitDialog(true)}
                  disabled={!repoPath || !localRepository}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Commit
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Save your changes with a description message</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleViewLog}
                  disabled={!repoPath || !localRepository}
                >
                  <History className="h-4 w-4 mr-2" />
                  Log
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View the history of all saved changes</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setShowRevertDialog(true)}
                  disabled={!repoPath || !localRepository}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Revert
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Undo a previous commit while keeping history</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleAmend}
                  disabled={!repoPath || !localRepository}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Amend
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Update your most recent commit with new changes</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCommitDialog} onOpenChange={setShowCommitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Commit Changes</DialogTitle>
            <DialogDescription>
              Enter a message describing your changes
            </DialogDescription>
          </DialogHeader>
          <Input
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message"
          />
          <Button onClick={handleCommit} disabled={isCommitting}>
            {isCommitting ? "Committing..." : "Commit"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showRevertDialog} onOpenChange={setShowRevertDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revert Commit</DialogTitle>
            <DialogDescription>
              Enter the hash of the commit you want to revert
            </DialogDescription>
          </DialogHeader>
          <Input
            value={commitHash}
            onChange={(e) => setCommitHash(e.target.value)}
            placeholder="Commit hash"
          />
          <Button onClick={handleRevert} disabled={isReverting}>
            {isReverting ? "Reverting..." : "Revert"}
          </Button>
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
