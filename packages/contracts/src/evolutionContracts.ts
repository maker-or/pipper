import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/** A single entry in patch.md recording why a commit was made. */
export const PatchEntrySchema = Schema.Struct({
  commit: TrimmedNonEmptyString,
  files_changed: Schema.Array(TrimmedNonEmptyString),
  why: TrimmedNonEmptyString,
});
export type PatchEntry = typeof PatchEntrySchema.Type;

/** Status of the local evolution workspace. */
export const EvolutionWorkspaceStatusSchema = Schema.Struct({
  exists: Schema.Boolean,
  hasGit: Schema.Boolean,
  hasDependencies: Schema.Boolean,
  localVersion: Schema.NullOr(TrimmedNonEmptyString),
  workspaceRoot: TrimmedNonEmptyString,
});
export type EvolutionWorkspaceStatus = typeof EvolutionWorkspaceStatusSchema.Type;

/** Progress update during workspace setup. */
export const EvolutionSetupProgressSchema = Schema.Struct({
  step: Schema.Literals(["cloning", "installing", "initializing", "complete", "error"]),
  message: TrimmedNonEmptyString,
  /** 0..1 progress fraction, null if indeterminate */
  progress: Schema.NullOr(Schema.Number),
});
export type EvolutionSetupProgress = typeof EvolutionSetupProgressSchema.Type;

/** Result of checking for upstream updates. */
export const EvolutionUpdateCheckResultSchema = Schema.Struct({
  updateAvailable: Schema.Boolean,
  localVersion: Schema.NullOr(TrimmedNonEmptyString),
  latestVersion: Schema.NullOr(TrimmedNonEmptyString),
  manifestUrl: Schema.NullOr(TrimmedNonEmptyString),
});
export type EvolutionUpdateCheckResult = typeof EvolutionUpdateCheckResultSchema.Type;
