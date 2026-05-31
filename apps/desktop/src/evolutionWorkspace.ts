import * as ChildProcess from "node:child_process";
import * as FS from "node:fs";
import * as Path from "node:path";

import { PIPPER_EVOLUTION_RELEASES_DIRECTORY_NAME } from "@t3tools/shared/evolution";

export const DEFAULT_EVOLUTION_REPO_URL = "https://github.com/maker-or/pipper";

type CloneSpawnSync = (
  command: string,
  args: readonly string[],
  options: ChildProcess.SpawnSyncOptionsWithStringEncoding,
) => ChildProcess.SpawnSyncReturns<string>;

type EvolutionCloneLogStream = "stdout" | "stderr";

export interface PrepareEvolutionWorkspaceSourceOptions {
  readonly workspaceRoot: string;
  readonly sourceRoot: string;
  readonly isPackaged: boolean;
  readonly repoUrl: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly spawnSync?: CloneSpawnSync;
  readonly log?: (stream: EvolutionCloneLogStream, output: string) => void;
}

export interface PrepareEvolutionWorkspaceSourceResult {
  readonly existed: boolean;
}

export function resolveEvolutionRepoUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.PIPPER_REPO_URL?.trim() || DEFAULT_EVOLUTION_REPO_URL;
}

function isPathInsideAsar(path: string): boolean {
  return path.split(Path.sep).some((segment) => segment.endsWith(".asar"));
}

function shouldCloneEvolutionWorkspace(
  options: Pick<PrepareEvolutionWorkspaceSourceOptions, "isPackaged" | "sourceRoot">,
): boolean {
  return options.isPackaged || isPathInsideAsar(options.sourceRoot);
}

function hasValidEvolutionWorkspace(workspaceRoot: string, requiresGitMetadata: boolean): boolean {
  if (!FS.existsSync(Path.join(workspaceRoot, "package.json"))) {
    return false;
  }
  return !requiresGitMetadata || FS.existsSync(Path.join(workspaceRoot, ".git"));
}

export function copyEvolutionSourceFallback(sourceRoot: string, targetRoot: string): void {
  if (isPathInsideAsar(sourceRoot)) {
    throw new Error("Cannot seed the Improve workspace by copying from a packaged app archive.");
  }

  const ignoredNames = new Set([
    ".git",
    ".turbo",
    "node_modules",
    "release",
    PIPPER_EVOLUTION_RELEASES_DIRECTORY_NAME,
  ]);
  FS.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    filter: (source) => !source.split(Path.sep).some((segment) => ignoredNames.has(segment)),
  });
}

function readCommandOutput(value: string | Buffer | null | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return "";
}

function formatCommandFailureDetails(output: string): string {
  const trimmedOutput = output.trim();
  return trimmedOutput ? `\n${trimmedOutput}` : "";
}

export function cloneEvolutionWorkspace(
  workspaceRoot: string,
  repoUrl: string,
  options: Pick<PrepareEvolutionWorkspaceSourceOptions, "env" | "log" | "spawnSync"> = {},
): void {
  FS.mkdirSync(Path.dirname(workspaceRoot), { recursive: true });
  const cloneParent = FS.mkdtempSync(
    Path.join(Path.dirname(workspaceRoot), `.${Path.basename(workspaceRoot)}-clone-`),
  );
  const cloneRoot = Path.join(cloneParent, Path.basename(workspaceRoot));
  const cleanupCloneParent = () => {
    FS.rmSync(cloneParent, { recursive: true, force: true });
  };

  const spawnSync = options.spawnSync ?? ChildProcess.spawnSync;
  const cloneResult = spawnSync("git", ["clone", repoUrl, cloneRoot], {
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: "pipe",
  });
  const stdout = readCommandOutput(cloneResult.stdout);
  const stderr = readCommandOutput(cloneResult.stderr);

  if (stdout.length > 0) {
    options.log?.("stdout", stdout);
  }
  if (stderr.length > 0) {
    options.log?.("stderr", stderr);
  }

  if (cloneResult.error) {
    const error = cloneResult.error as NodeJS.ErrnoException;
    cleanupCloneParent();
    if (error.code === "ENOENT") {
      throw new Error(
        "Git is required to create the Improve workspace, but the git executable was not found on PATH.",
      );
    }
    throw new Error(`Failed to start git clone for the Improve workspace: ${error.message}`);
  }

  if (cloneResult.signal) {
    cleanupCloneParent();
    throw new Error(`git clone for the Improve workspace was terminated by ${cloneResult.signal}.`);
  }

  if (cloneResult.status !== 0) {
    cleanupCloneParent();
    throw new Error(
      `Failed to clone Improve workspace from ${repoUrl}.${formatCommandFailureDetails(
        stderr || stdout,
      )}`,
    );
  }

  FS.rmSync(workspaceRoot, { recursive: true, force: true });
  FS.renameSync(cloneRoot, workspaceRoot);
  cleanupCloneParent();
}

export function prepareEvolutionWorkspaceSource(
  options: PrepareEvolutionWorkspaceSourceOptions,
): PrepareEvolutionWorkspaceSourceResult {
  const packageJsonPath = Path.join(options.workspaceRoot, "package.json");
  const shouldClone = shouldCloneEvolutionWorkspace(options);
  const existed = hasValidEvolutionWorkspace(options.workspaceRoot, shouldClone);

  if (existed) {
    return { existed };
  }

  if (FS.existsSync(options.workspaceRoot)) {
    const stats = FS.statSync(options.workspaceRoot);
    if (!stats.isDirectory()) {
      throw new Error(`${options.workspaceRoot} exists but is not a directory.`);
    }

    if (!shouldClone && FS.readdirSync(options.workspaceRoot).length > 0) {
      throw new Error(`${options.workspaceRoot} exists but is not a Pipper workspace.`);
    }
  }

  if (shouldClone) {
    cloneEvolutionWorkspace(options.workspaceRoot, options.repoUrl, options);
    if (!FS.existsSync(packageJsonPath)) {
      throw new Error(
        `Failed to create the Improve workspace at ${options.workspaceRoot}: package.json was not found.`,
      );
    }
    return { existed };
  }

  FS.mkdirSync(Path.dirname(options.workspaceRoot), { recursive: true });
  FS.rmSync(options.workspaceRoot, { recursive: true, force: true });
  copyEvolutionSourceFallback(options.sourceRoot, options.workspaceRoot);
  if (!FS.existsSync(packageJsonPath)) {
    throw new Error(
      `Failed to create the Improve workspace at ${options.workspaceRoot}: package.json was not found.`,
    );
  }
  return { existed };
}
