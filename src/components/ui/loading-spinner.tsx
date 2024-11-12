import React from 'react';

export const LoadingSpinner: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={`flex justify-center items-center ${className}`}>
      <div className="relative">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <div className="absolute top-0 left-0 h-8 w-8 rounded-full border-2 border-primary opacity-30" />
      </div>
    </div>
  );
}; 