import React from "react";
import { Card } from "@/components/ui/card";
import { FileText, Plus, Minus, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

interface DiffViewerProps {
  diffs: DiffEntry[];
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diffs }) => {
  // Helper function to get human-readable status
  const getStatusDescription = (status: string) => {
    switch (status) {
      case "MODIFIED":
        return "Changed";
      case "NEW":
        return "Added";
      case "DELETED":
        return "Removed";
      case "RENAMED":
        return "Renamed";
      default:
        return status;
    }
  };

  // Helper function to get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "MODIFIED":
        return "text-blue-500";
      case "NEW":
        return "text-green-500";
      case "DELETED":
        return "text-red-500";
      case "RENAMED":
        return "text-purple-500";
      default:
        return "text-gray-500";
    }
  };

  return (
    <div className="space-y-4">
      {diffs.map((diff, index) => (
        <Card key={index} className="p-4">
          {/* File Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">
                {diff.new_path || diff.old_path}
              </span>
            </div>
            <div className={`px-2 py-1 rounded-full text-sm ${getStatusColor(diff.status)}`}>
              {getStatusDescription(diff.status)}
            </div>
          </div>

          {/* Changes Display */}
          <div className="text-sm overflow-x-auto bg-card p-4 rounded-md border">
            {diff.hunks.map((hunk, hunkIndex) => (
              <div key={hunkIndex} className="space-y-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-muted-foreground flex items-center gap-2 mb-2 p-1 bg-muted/30 rounded">
                      <AlertCircle className="h-4 w-4" />
                      <span>
                        Changes at lines {hunk.old_start}-{hunk.old_start + hunk.old_lines}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>This section shows the changes made to these specific lines</p>
                  </TooltipContent>
                </Tooltip>

                {hunk.content.split('\n').map((line, lineIndex) => {
                  if (!line && lineIndex === hunk.content.split('\n').length - 1) return null;
                  
                  let className = "whitespace-pre py-1 px-2 flex items-center gap-2";
                  let icon = null;
                  
                  if (line.startsWith('+') && diff.status === "NEW") {
                    className += " bg-green-500/20 text-green-500 font-medium";
                    icon = <Plus className="h-4 w-4" />;
                  } else if (line.startsWith('+')) {
                    className += " bg-green-500/10 text-green-500";
                    icon = <Plus className="h-4 w-4" />;
                  } else if (line.startsWith('-')) {
                    className += " bg-red-500/10 text-red-500";
                    icon = <Minus className="h-4 w-4" />;
                  }
                  
                  return (
                    <Tooltip key={lineIndex}>
                      <TooltipTrigger asChild>
                        <div className={className}>
                          {icon}
                          <span>{line.slice(1)}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {line.startsWith('+') 
                            ? "This line was added" 
                            : line.startsWith('-') 
                              ? "This line was removed" 
                              : "This line is unchanged"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      ))}
      {diffs.length === 0 && (
        <div className="text-center text-muted-foreground p-8">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No changes detected in your files</p>
          <p className="text-sm mt-1">All your files are up to date!</p>
        </div>
      )}
    </div>
  );
};
