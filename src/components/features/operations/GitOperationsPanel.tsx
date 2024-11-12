import React from "react";
import { BasicOperations } from "./sections/BasicOperations";
import { BranchOperations } from "./sections/BranchOperations";
import { CommitOperations } from "./sections/CommitOperations";
import { AdvancedOperations } from "./sections/AdvancedOperations";
import type { OperationProps } from "./types";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBoundary } from "react-error-boundary";

export const GitOperationsPanel: React.FC<OperationProps> = (props) => {
  const { repoPath, localRepository } = props;
  
  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <div className="space-y-6">
        <Card className="bg-muted/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Current Repository:</span>
                  <span className="text-sm text-muted-foreground">
                    {repoPath || "No repository selected"}
                  </span>
                </div>
                {localRepository && (
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <span className="text-sm text-green-500">Cloned Locally</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <BasicOperations {...props} />
          <BranchOperations {...props} />
          <CommitOperations {...props} />
          <AdvancedOperations {...props} />
        </div>
      </div>
    </ErrorBoundary>
  );
};
