import { FolderGit2Icon, FolderGitIcon, FolderIcon } from "lucide-react";
import { memo, useMemo } from "react";

import {
  resolveCurrentWorkspaceLabel,
  resolveEnvModeLabel,
  resolveLockedWorkspaceLabel,
  type EnvMode,
} from "./BranchToolbar.logic";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "~/lib/utils";

interface BranchToolbarEnvModeSelectorProps {
  envLocked: boolean;
  effectiveEnvMode: EnvMode;
  activeWorktreePath: string | null;
  onEnvModeChange: (mode: EnvMode) => void;
  popupSide?: "top" | "bottom";
  variant?: "default" | "titlebar";
}

export const BranchToolbarEnvModeSelector = memo(function BranchToolbarEnvModeSelector({
  envLocked,
  effectiveEnvMode,
  activeWorktreePath,
  onEnvModeChange,
  popupSide,
  variant = "default",
}: BranchToolbarEnvModeSelectorProps) {
  const isTitlebarVariant = variant === "titlebar";
  const WorkspaceIcon =
    effectiveEnvMode === "worktree"
      ? FolderGit2Icon
      : activeWorktreePath
        ? FolderGitIcon
        : FolderIcon;
  const envModeItems = useMemo(
    () => [
      { value: "local", label: resolveCurrentWorkspaceLabel(activeWorktreePath) },
      { value: "worktree", label: resolveEnvModeLabel("worktree") },
    ],
    [activeWorktreePath],
  );

  if (envLocked) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 border border-transparent px-2 text-sm font-medium text-muted-foreground/70 sm:px-3",
          isTitlebarVariant && "px-0 sm:px-0",
        )}
      >
        <WorkspaceIcon className="size-3.5 shrink-0 text-muted-foreground/65" />
        {resolveLockedWorkspaceLabel(activeWorktreePath)}
      </span>
    );
  }

  return (
    <Select
      modal={false}
      value={effectiveEnvMode}
      onValueChange={(value) => onEnvModeChange(value as EnvMode)}
      items={envModeItems}
    >
      <SelectTrigger
        variant="ghost"
        size="sm"
        className={cn(
          "font-medium text-muted-foreground/70 hover:text-foreground/80",
          isTitlebarVariant &&
            "gap-1 px-0 text-sm hover:bg-transparent hover:text-foreground [&_[data-slot=select-icon]]:hidden",
        )}
        aria-label="Workspace"
      >
        <WorkspaceIcon className="size-3.5 shrink-0 text-muted-foreground/65" />
        <SelectValue />
      </SelectTrigger>
      <SelectPopup side={popupSide}>
        <SelectGroup>
          <SelectGroupLabel>Workspace</SelectGroupLabel>
          <SelectItem value="local">
            <span className="inline-flex items-center gap-1.5">
              {activeWorktreePath ? (
                <FolderGitIcon className="size-3" />
              ) : (
                <FolderIcon className="size-3" />
              )}
              {resolveCurrentWorkspaceLabel(activeWorktreePath)}
            </span>
          </SelectItem>
          <SelectItem value="worktree">
            <span className="inline-flex items-center gap-1.5">
              <FolderGit2Icon className="size-3" />
              {resolveEnvModeLabel("worktree")}
            </span>
          </SelectItem>
        </SelectGroup>
      </SelectPopup>
    </Select>
  );
});
