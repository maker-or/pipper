/**
 * EvolutionService — Server-side operations for the Pipper Evolution workspace.
 *
 * Provides workspace status inspection, patch entry I/O, upstream update
 * checking, and release ID generation.  Pure functions only — no classes,
 * no Effect wrappers.
 *
 * @module EvolutionService
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  PIPPER_EVOLUTION_HOME_RELATIVE_PATH,
  PIPPER_EVOLUTION_RELEASES_DIRECTORY_NAME,
} from "@t3tools/shared/evolution";

// ---------------------------------------------------------------------------
// Constants — not yet exported from shared/evolution; kept local until they are
// ---------------------------------------------------------------------------

/** Filename for the cumulative patch log inside the workspace root. */
const PATCH_FILENAME = "patch.md";

/** Base URL for the Pipper update registry. */
const UPDATE_REGISTRY_BASE_URL = "https://pipper.ai/updates";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWorkspaceRoot(): string {
  return path.join(os.homedir(), PIPPER_EVOLUTION_HOME_RELATIVE_PATH);
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EvolutionWorkspaceStatus {
  exists: boolean;
  hasGit: boolean;
  hasDependencies: boolean;
  localVersion: string | null;
  workspaceRoot: string;
}

export interface PatchEntry {
  commit: string;
  files_changed: string[];
  why: string;
}

export interface EvolutionUpdateCheckResult {
  updateAvailable: boolean;
  localVersion: string | null;
  latestVersion: string | null;
  manifestUrl: string | null;
}

// ---------------------------------------------------------------------------
// Workspace status
// ---------------------------------------------------------------------------

/**
 * Check whether the evolution workspace exists and inspect its current state.
 */
export function getWorkspaceStatus(): EvolutionWorkspaceStatus {
  const root = resolveWorkspaceRoot();
  const rootExists = fs.existsSync(root);
  const hasGit = rootExists && fs.existsSync(path.join(root, ".git"));
  const hasPackageJson = rootExists && fs.existsSync(path.join(root, "package.json"));
  const hasDependencies = rootExists && fs.existsSync(path.join(root, "node_modules"));

  let localVersion: string | null = null;
  if (hasPackageJson) {
    try {
      const raw = fs.readFileSync(path.join(root, "package.json"), "utf-8");
      const pkg = JSON.parse(raw) as { version?: string };
      localVersion = pkg.version ?? null;
    } catch {
      // Malformed package.json — treat version as unknown.
    }
  }

  return {
    exists: rootExists && hasGit && hasPackageJson,
    hasGit,
    hasDependencies,
    localVersion,
    workspaceRoot: root,
  };
}

// ---------------------------------------------------------------------------
// Patch entries
// ---------------------------------------------------------------------------

/**
 * Read all patch entries from `patch.md`.
 *
 * Each entry is expected to be a JSON object inside a fenced ` ```json ` block.
 */
export function readPatchEntries(): PatchEntry[] {
  const patchPath = path.join(resolveWorkspaceRoot(), PATCH_FILENAME);

  if (!fs.existsSync(patchPath)) {
    return [];
  }

  let content: string;
  try {
    content = fs.readFileSync(patchPath, "utf-8");
  } catch {
    return [];
  }

  const entries: PatchEntry[] = [];
  const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n\s*```/g;
  let match: RegExpExecArray | null;

  while ((match = jsonBlockRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]!) as Record<string, unknown>;
      if (
        typeof parsed.commit === "string" &&
        Array.isArray(parsed.files_changed) &&
        typeof parsed.why === "string"
      ) {
        entries.push(parsed as unknown as PatchEntry);
      }
    } catch {
      // Skip malformed entries.
    }
  }

  return entries;
}

/**
 * Append a new patch entry to `patch.md`.
 *
 * **Call only after a successful commit** — this function does not validate
 * the commit hash against the repository.
 */
export function appendPatchEntry(entry: PatchEntry): void {
  const patchPath = path.join(resolveWorkspaceRoot(), PATCH_FILENAME);
  const block = `\n\n\`\`\`json\n${JSON.stringify(entry, null, 2)}\n\`\`\`\n`;
  fs.appendFileSync(patchPath, block, "utf-8");
}

// ---------------------------------------------------------------------------
// Update checking
// ---------------------------------------------------------------------------

/**
 * Check for upstream updates from the Pipper update registry.
 *
 * Returns whether an update is available, the local and latest versions, and
 * the manifest URL when an update exists.  Network or parse failures are
 * silently swallowed and result in `updateAvailable: false`.
 */
export async function checkForUpdate(): Promise<EvolutionUpdateCheckResult> {
  const { localVersion } = getWorkspaceStatus();

  try {
    const response = await fetch(`${UPDATE_REGISTRY_BASE_URL}/latest.json`);

    if (!response.ok) {
      return { updateAvailable: false, localVersion, latestVersion: null, manifestUrl: null };
    }

    const data = (await response.json()) as { version?: string };
    const latestVersion = typeof data.version === "string" ? data.version : null;
    const updateAvailable =
      localVersion !== null && latestVersion !== null && latestVersion !== localVersion;

    return {
      updateAvailable,
      localVersion,
      latestVersion,
      manifestUrl: updateAvailable
        ? `${UPDATE_REGISTRY_BASE_URL}/${latestVersion}/manifest.json`
        : null,
    };
  } catch {
    return { updateAvailable: false, localVersion, latestVersion: null, manifestUrl: null };
  }
}

// ---------------------------------------------------------------------------
// Release ID generation
// ---------------------------------------------------------------------------

/**
 * Determine the next sequential release ID by inspecting the releases
 * directory.  Returns `"release-v1"` when no prior releases exist.
 */
export function getNextReleaseId(): string {
  const releasesDir = path.join(resolveWorkspaceRoot(), PIPPER_EVOLUTION_RELEASES_DIRECTORY_NAME);

  if (!fs.existsSync(releasesDir)) {
    return "release-v1";
  }

  let dirEntries: fs.Dirent[];
  try {
    dirEntries = fs.readdirSync(releasesDir, { withFileTypes: true });
  } catch {
    return "release-v1";
  }

  const versions = dirEntries
    .filter((e) => e.isDirectory() && e.name.startsWith("release-v"))
    .map((e) => {
      const num = parseInt(e.name.replace("release-v", ""), 10);
      return Number.isFinite(num) ? num : 0;
    });

  const maxVersion = versions.length > 0 ? Math.max(...versions) : 0;
  return `release-v${maxVersion + 1}`;
}
