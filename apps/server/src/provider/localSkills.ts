import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeFS from "node:fs/promises";
import type { ServerProviderSkill } from "@t3tools/contracts";

function normalizeSkillPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+$/, "");
}

function mergeSkillEntry(
  existing: ServerProviderSkill,
  next: ServerProviderSkill,
): ServerProviderSkill {
  return {
    ...existing,
    ...next,
    enabled: existing.enabled && next.enabled,
    displayName: existing.displayName ?? next.displayName,
    description: existing.description ?? next.description,
    shortDescription: existing.shortDescription ?? next.shortDescription,
    scope: existing.scope ?? next.scope,
  };
}

function skillIdentity(skill: Pick<ServerProviderSkill, "path">): string {
  return normalizeSkillPath(skill.path);
}

async function discoverSkillDirectories(
  rootDir: string,
  scope: "project" | "user",
): Promise<ServerProviderSkill[]> {
  try {
    const dirents = await NodeFS.readdir(rootDir, { withFileTypes: true });
    const discovered: ServerProviderSkill[] = [];

    for (const dirent of dirents) {
      if (!dirent.isDirectory()) continue;
      const skillDir = NodePath.join(rootDir, dirent.name);
      try {
        const skillDirEntries = await NodeFS.readdir(skillDir, { withFileTypes: true });
        const skillFile = skillDirEntries.find(
          (entry) => entry.isFile() && (entry.name === "SKILL.md" || entry.name === "SKILL.json"),
        );
        if (!skillFile) continue;
        discovered.push({
          name: dirent.name,
          path: NodePath.join(skillDir, skillFile.name),
          enabled: true,
          scope,
          shortDescription: scope === "project" ? "Project skill" : "User skill",
        });
      } catch {
        continue;
      }
    }

    return discovered;
  } catch {
    return [];
  }
}

export function mergeLocalProviderSkills(
  providerSkills: ReadonlyArray<ServerProviderSkill>,
  localSkills: ReadonlyArray<ServerProviderSkill>,
): ServerProviderSkill[] {
  const merged = new Map<string, ServerProviderSkill>();
  for (const skill of providerSkills) {
    merged.set(skillIdentity(skill), skill);
  }
  for (const skill of localSkills) {
    const existing = merged.get(skillIdentity(skill));
    merged.set(skillIdentity(skill), existing ? mergeSkillEntry(existing, skill) : skill);
  }
  return [...merged.values()];
}

export async function discoverLocalProviderSkills(cwd: string): Promise<ServerProviderSkill[]> {
  if (process.env.VITEST) {
    return [];
  }
  const roots = [
    { path: NodePath.join(cwd, ".agents", "skills"), scope: "project" as const },
    { path: NodePath.join(cwd, ".codex", "skills"), scope: "project" as const },
    { path: NodePath.join(NodeOS.homedir(), ".agents", "skills"), scope: "user" as const },
    { path: NodePath.join(NodeOS.homedir(), ".codex", "skills"), scope: "user" as const },
  ];

  const skills = await Promise.all(
    roots.map((root) => discoverSkillDirectories(root.path, root.scope)),
  );
  return skills.flat();
}
