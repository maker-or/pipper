export const PIPPER_EVOLUTION_WORKSPACE_ROOT = "~/Library/evolve/pipper";

export const PIPPER_EVOLUTION_HOME_RELATIVE_PATH = "Library/evolve/pipper";

export const PIPPER_EVOLUTION_RELEASES_DIRECTORY_NAME = "releases";

export const PIPPER_EVOLUTION_PATCH_FILENAME = "patch.md";
export const PIPPER_EVOLUTION_DESIGN_FILENAME = "DESIGN.md";
export const PIPPER_EVOLUTION_INSTRUCTIONS_FILENAME = "instructions.md";
export const PIPPER_EVOLUTION_AGENT_MEMORY_DIR = "agent-memory";
export const PIPPER_UPDATE_REGISTRY_BASE_URL = "https://pipper.ai/updates";

/**
 * Resolve the evolution workspace root on the server side.
 * On macOS/Linux: ~/Library/evolve/pipper
 * On Windows: %LOCALAPPDATA%/evolve/pipper
 * Falls back to the home-relative path when localAppData is unavailable.
 */
export function resolveEvolutionWorkspacePath(
  platform: "darwin" | "win32" | "linux" | string,
  homeDir: string,
  localAppData?: string | undefined,
): string {
  if (platform === "win32" && localAppData) {
    return `${localAppData}/evolve/pipper`;
  }
  return `${homeDir}/Library/evolve/pipper`;
}
