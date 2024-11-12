import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GitBranch, GitMerge, Trash2, GitCommit } from "lucide-react";
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

export const BranchOperations: React.FC<OperationProps> = ({
  repoPath,
  localRepository,
  onMessage,
}) => {
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const showFeedback = (
    type: "success" | "error" | "info",
    message: string
  ) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
    onMessage(message);
  };

  const handleCreateBranch = async () => {
    if (!branchName) {
      showFeedback("error", "Please enter a branch name");
      return;
    }

    try {
      setIsCreatingBranch(true);
      const result = await invoke<string>("create_branch", {
        path: repoPath,
        branchName,
      });
      showFeedback("success", result);
      setShowCreateDialog(false);
      setBranchName("");
    } catch (error) {
      showFeedback("error", `Error creating branch: ${error}`);
    } finally {
      setIsCreatingBranch(false);
    }
  };

  const handleCheckout = async () => {
    if (!targetBranch) {
      showFeedback("error", "Please enter a branch name");
      return;
    }

    try {
      setIsCheckingOut(true);
      const result = await invoke<string>("checkout_branch", {
        path: repoPath,
        branchName: targetBranch,
      });
      showFeedback("success", result);
      setShowCheckoutDialog(false);
      setTargetBranch("");
    } catch (error) {
      showFeedback("error", `Error checking out branch: ${error}`);
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleMerge = async () => {
    if (!targetBranch) {
      showFeedback("error", "Please enter a branch name to merge");
      return;
    }

    try {
      setIsMerging(true);
      const result = await invoke<string>("merge_branch", {
        path: repoPath,
        branchName: targetBranch,
      });
      showFeedback("success", result);
      setShowMergeDialog(false);
      setTargetBranch("");
    } catch (error) {
      showFeedback("error", `Error merging branch: ${error}`);
    } finally {
      setIsMerging(false);
    }
  };

  const handleDeleteBranch = async () => {
    if (!targetBranch) {
      showFeedback("error", "Please enter a branch name to delete");
      return;
    }

    try {
      const result = await invoke<string>("delete_branch", {
        path: repoPath,
        branchName: targetBranch,
      });
      showFeedback("success", result);
      setTargetBranch("");
    } catch (error) {
      showFeedback("error", `Error deleting branch: ${error}`);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Branch Operations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  disabled={!repoPath || !localRepository}
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  Create Branch
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create a new version of your code to work on separately</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setShowCheckoutDialog(true)}
                  disabled={!repoPath || !localRepository}
                >
                  <GitCommit className="h-4 w-4 mr-2" />
                  Checkout
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Switch to a different branch to work on</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setShowMergeDialog(true)}
                  disabled={!repoPath || !localRepository}
                >
                  <GitMerge className="h-4 w-4 mr-2" />
                  Merge
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Combine changes from one branch into another</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={!repoPath || !localRepository}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Branch
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Permanently remove a branch that's no longer needed</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Branch</DialogTitle>
            <DialogDescription>
              Enter a name for your new branch
            </DialogDescription>
          </DialogHeader>
          <Input
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="Branch name"
          />
          <Button onClick={handleCreateBranch} disabled={isCreatingBranch}>
            {isCreatingBranch ? "Creating..." : "Create Branch"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showCheckoutDialog} onOpenChange={setShowCheckoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checkout Branch</DialogTitle>
            <DialogDescription>
              Enter the name of the branch to switch to
            </DialogDescription>
          </DialogHeader>
          <Input
            value={targetBranch}
            onChange={(e) => setTargetBranch(e.target.value)}
            placeholder="Branch name"
          />
          <Button onClick={handleCheckout} disabled={isCheckingOut}>
            {isCheckingOut ? "Switching..." : "Switch Branch"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Branch</DialogTitle>
            <DialogDescription>
              Enter the name of the branch to merge into the current branch
            </DialogDescription>
          </DialogHeader>
          <Input
            value={targetBranch}
            onChange={(e) => setTargetBranch(e.target.value)}
            placeholder="Branch to merge"
          />
          <Button onClick={handleMerge} disabled={isMerging}>
            {isMerging ? "Merging..." : "Merge Branch"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Branch</DialogTitle>
            <DialogDescription>
              Enter the name of the branch to delete. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={targetBranch}
            onChange={(e) => setTargetBranch(e.target.value)}
            placeholder="Branch name"
          />
          <Button variant="destructive" onClick={handleDeleteBranch}>
            Delete Branch
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
