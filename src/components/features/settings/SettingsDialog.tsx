import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { dialog } from "@tauri-apps/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Moon, Sun, Sparkles, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: string;
  onThemeChange: (theme: string) => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
  theme,
  onThemeChange,
}) => {
  const [cloneDir, setCloneDir] = useState<string>("");

  // Load the current clone directory on component mount
  useEffect(() => {
    const loadCloneDir = async () => {
      try {
        const homeDir = await invoke<string>("get_home_dir");
        const savedDir = localStorage.getItem("clone_directory") || `${homeDir}/simplegit`;
        setCloneDir(savedDir);
      } catch (error) {
        console.error("Error loading clone directory:", error);
      }
    };
    loadCloneDir();
  }, []);

  const handleSelectDirectory = async () => {
    try {
      const selected = await dialog.open({
        directory: true,
        multiple: false,
      });

      if (selected && typeof selected === "string") {
        setCloneDir(selected);
        localStorage.setItem("clone_directory", selected);
        // Notify the backend of the new directory
        await invoke("set_clone_directory", { path: selected });
      }
    } catch (error) {
      console.error("Error selecting directory:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Clone Directory</h4>
            <div className="flex gap-2">
              <Input
                value={cloneDir}
                onChange={(e) => setCloneDir(e.target.value)}
                placeholder="Repository clone location"
                className="flex-1"
              />
              <Button onClick={handleSelectDirectory} variant="outline">
                <Folder className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium leading-none">Theme</h4>
            <Select value={theme} onValueChange={onThemeChange}>
              <SelectTrigger>
                <SelectValue>
                  <div className="flex items-center gap-2">
                    {theme === "dark" && <Moon className="h-4 w-4" />}
                    {theme === "light" && <Sun className="h-4 w-4" />}
                    {theme === "colourful" && <Sparkles className="h-4 w-4" />}
                    <span className="capitalize">{theme}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="colourful" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <span>Colourful</span>
                </SelectItem>
                <SelectItem value="dark" className="flex items-center gap-2">
                  <Moon className="h-4 w-4" />
                  <span>Dark</span>
                </SelectItem>
                <SelectItem value="light" className="flex items-center gap-2">
                  <Sun className="h-4 w-4" />
                  <span>Light</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
