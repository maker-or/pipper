import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const UpdateRegistryLatestSchema = Schema.Struct({
  version: TrimmedNonEmptyString,
});
export type UpdateRegistryLatest = typeof UpdateRegistryLatestSchema.Type;

export const UpdateManifestSchema = Schema.Struct({
  version: TrimmedNonEmptyString,
  pr_url: TrimmedNonEmptyString,
  files_changed: Schema.Array(TrimmedNonEmptyString),
});
export type UpdateManifest = typeof UpdateManifestSchema.Type;
