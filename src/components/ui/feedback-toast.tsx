import React from "react";
import { AlertCircle, CheckCircle, XCircle, X } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "./alert";

interface FeedbackToastProps {
  type: "success" | "error" | "info";
  message: string;
  onDismiss?: () => void;
}

export const FeedbackToast: React.FC<FeedbackToastProps> = ({
  type,
  message,
  onDismiss,
}) => {
  const icons = {
    success: <CheckCircle className="h-4 w-4" />,
    error: <XCircle className="h-4 w-4" />,
    info: <AlertCircle className="h-4 w-4" />,
  };

  return (
    <Alert
      className={`
        fixed bottom-4 right-4 max-w-sm transition-opacity duration-300
        ${type === "success" ? "bg-green-50 text-green-900" : ""}
        ${type === "error" ? "bg-red-50 text-red-900" : ""}
        ${type === "info" ? "bg-blue-50 text-blue-900" : ""}
      `}
    >
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/10"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="flex items-center gap-2">
        {icons[type]}
        <AlertTitle className="text-sm font-medium">
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </AlertTitle>
      </div>
      <AlertDescription className="mt-2 text-sm">{message}</AlertDescription>
    </Alert>
  );
};
