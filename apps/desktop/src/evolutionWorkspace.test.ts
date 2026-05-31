import * as ChildProcess from "node:child_process";
import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_EVOLUTION_REPO_URL,
  prepareEvolutionWorkspaceSource,
  resolveEvolutionRepoUrl,
} from "./evolutionWorkspace.ts";
import type { PrepareEvolutionWorkspaceSourceOptions } from "./evolutionWorkspace.ts";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    FS.rmSync(directory, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), "pipper-evolution-workspace-test-"));
  tempDirectories.push(directory);
  return directory;
}

function writeFile(filePath: string, contents = ""): void {
  FS.mkdirSync(Path.dirname(filePath), { recursive: true });
  FS.writeFileSync(filePath, contents, "utf8");
}

function cloneResult(
  overrides: Partial<ChildProcess.SpawnSyncReturns<string>> = {},
): ChildProcess.SpawnSyncReturns<string> {
  return {
    pid: 123,
    output: [null, "", ""],
    stdout: "",
    stderr: "",
    status: 0,
    signal: null,
    ...overrides,
  };
}

describe("evolutionWorkspace", () => {
  it("resolves the default repo URL unless PIPPER_REPO_URL is set", () => {
    expect(resolveEvolutionRepoUrl({})).toBe(DEFAULT_EVOLUTION_REPO_URL);
    expect(resolveEvolutionRepoUrl({ PIPPER_REPO_URL: "  https://example.com/repo.git  " })).toBe(
      "https://example.com/repo.git",
    );
  });

  it("copies a development source checkout while ignoring transient directories", () => {
    const sourceRoot = makeTempDir();
    const workspaceRoot = Path.join(makeTempDir(), "workspace");
    writeFile(Path.join(sourceRoot, "package.json"), "{}\n");
    writeFile(Path.join(sourceRoot, "src", "main.ts"), "export {};\n");
    writeFile(Path.join(sourceRoot, ".git", "config"), "[core]\n");
    writeFile(Path.join(sourceRoot, "node_modules", "pkg", "index.js"), "");
    writeFile(Path.join(sourceRoot, "releases", "release-1", "manifest.json"), "{}\n");

    const result = prepareEvolutionWorkspaceSource({
      workspaceRoot,
      sourceRoot,
      isPackaged: false,
      repoUrl: DEFAULT_EVOLUTION_REPO_URL,
    });

    expect(result).toEqual({ existed: false });
    expect(FS.existsSync(Path.join(workspaceRoot, "package.json"))).toBe(true);
    expect(FS.existsSync(Path.join(workspaceRoot, "src", "main.ts"))).toBe(true);
    expect(FS.existsSync(Path.join(workspaceRoot, ".git"))).toBe(false);
    expect(FS.existsSync(Path.join(workspaceRoot, "node_modules"))).toBe(false);
    expect(FS.existsSync(Path.join(workspaceRoot, "releases"))).toBe(false);
  });

  it("rejects non-empty development targets that are not Pipper workspaces", () => {
    const sourceRoot = makeTempDir();
    const workspaceRoot = makeTempDir();
    writeFile(Path.join(sourceRoot, "package.json"), "{}\n");
    writeFile(Path.join(workspaceRoot, "notes.txt"), "do not overwrite\n");

    expect(() =>
      prepareEvolutionWorkspaceSource({
        workspaceRoot,
        sourceRoot,
        isPackaged: false,
        repoUrl: DEFAULT_EVOLUTION_REPO_URL,
      }),
    ).toThrow(`${workspaceRoot} exists but is not a Pipper workspace.`);
  });

  it("clones packaged workspaces instead of copying from app.asar", () => {
    const workspaceRoot = Path.join(makeTempDir(), "pipper");
    const logs: Array<readonly [string, string]> = [];
    const spawnSync = vi.fn(
      (
        command: string,
        args: readonly string[],
        options: ChildProcess.SpawnSyncOptionsWithStringEncoding,
      ): ChildProcess.SpawnSyncReturns<string> => {
        expect(command).toBe("git");
        expect(args[0]).toBe("clone");
        expect(args[1]).toBe(DEFAULT_EVOLUTION_REPO_URL);
        const cloneTarget = args[2]!;
        expect(cloneTarget).not.toBe(workspaceRoot);
        expect(Path.dirname(cloneTarget)).toContain(`.${Path.basename(workspaceRoot)}-clone-`);
        expect(options.stdio).toBe("pipe");
        writeFile(Path.join(cloneTarget, "package.json"), "{}\n");
        return cloneResult({ stderr: "Cloning into workspace...\n" });
      },
    );

    const result = prepareEvolutionWorkspaceSource({
      workspaceRoot,
      sourceRoot: "/Applications/polarish (Alpha).app/Contents/Resources/app.asar",
      isPackaged: true,
      repoUrl: DEFAULT_EVOLUTION_REPO_URL,
      spawnSync: spawnSync as NonNullable<PrepareEvolutionWorkspaceSourceOptions["spawnSync"]>,
      log: (stream, output) => logs.push([stream, output]),
    });

    expect(result).toEqual({ existed: false });
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(logs).toEqual([["stderr", "Cloning into workspace...\n"]]);
    expect(FS.existsSync(Path.join(workspaceRoot, "package.json"))).toBe(true);
  });

  it("recreates invalid packaged workspace directories before cloning", () => {
    const workspaceRoot = Path.join(makeTempDir(), "pipper");
    writeFile(Path.join(workspaceRoot, "package.json"), "{}\n");
    writeFile(Path.join(workspaceRoot, "old.txt"), "stale\n");
    const spawnSync = vi.fn((_command: string, args: readonly string[]) => {
      const cloneTarget = args[2]!;
      writeFile(Path.join(cloneTarget, "package.json"), "{}\n");
      writeFile(Path.join(cloneTarget, ".git", "HEAD"), "ref: refs/heads/main\n");
      return cloneResult();
    });

    prepareEvolutionWorkspaceSource({
      workspaceRoot,
      sourceRoot: "/Applications/polarish (Alpha).app/Contents/Resources/app.asar",
      isPackaged: true,
      repoUrl: DEFAULT_EVOLUTION_REPO_URL,
      spawnSync: spawnSync as NonNullable<PrepareEvolutionWorkspaceSourceOptions["spawnSync"]>,
    });

    expect(FS.existsSync(Path.join(workspaceRoot, "old.txt"))).toBe(false);
    expect(FS.existsSync(Path.join(workspaceRoot, "package.json"))).toBe(true);
    expect(FS.existsSync(Path.join(workspaceRoot, ".git", "HEAD"))).toBe(true);
  });

  it("reuses packaged workspaces that already have package and git metadata", () => {
    const workspaceRoot = Path.join(makeTempDir(), "pipper");
    writeFile(Path.join(workspaceRoot, "package.json"), "{}\n");
    writeFile(Path.join(workspaceRoot, ".git", "HEAD"), "ref: refs/heads/main\n");
    const spawnSync = vi.fn(() => cloneResult());

    const result = prepareEvolutionWorkspaceSource({
      workspaceRoot,
      sourceRoot: "/Applications/polarish (Alpha).app/Contents/Resources/app.asar",
      isPackaged: true,
      repoUrl: DEFAULT_EVOLUTION_REPO_URL,
      spawnSync: spawnSync as NonNullable<PrepareEvolutionWorkspaceSourceOptions["spawnSync"]>,
    });

    expect(result).toEqual({ existed: true });
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("reports a clear error when git is unavailable", () => {
    const workspaceRoot = Path.join(makeTempDir(), "pipper");
    writeFile(Path.join(workspaceRoot, "old.txt"), "keep\n");
    const error = new Error("spawn git ENOENT") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    const spawnSync = vi.fn(() => cloneResult({ error, status: null }));

    expect(() =>
      prepareEvolutionWorkspaceSource({
        workspaceRoot,
        sourceRoot: "/Applications/polarish (Alpha).app/Contents/Resources/app.asar",
        isPackaged: true,
        repoUrl: DEFAULT_EVOLUTION_REPO_URL,
        spawnSync: spawnSync as NonNullable<PrepareEvolutionWorkspaceSourceOptions["spawnSync"]>,
      }),
    ).toThrow(
      "Git is required to create the Improve workspace, but the git executable was not found on PATH.",
    );
    expect(FS.readFileSync(Path.join(workspaceRoot, "old.txt"), "utf8")).toBe("keep\n");
  });
});
