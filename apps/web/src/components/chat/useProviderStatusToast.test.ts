import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { ProviderDriverKind, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";

import { buildProviderStatusToastCopy, resolveProviderLabel } from "./useProviderStatusToast";

const decodeServerProvider = Schema.decodeUnknownSync(ServerProvider);

function makeProvider(overrides: Record<string, unknown>) {
  return decodeServerProvider({
    instanceId: ProviderInstanceId.make("opencode"),
    driver: ProviderDriverKind.make("openCode"),
    displayName: "OpenCode",
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-04-10T00:00:00.000Z",
    models: [],
    ...overrides,
  });
}

describe("resolveProviderLabel", () => {
  it("prefers the trimmed displayName when present", () => {
    const provider = makeProvider({ displayName: "  OpenCode Personal  " });
    expect(resolveProviderLabel(provider)).toBe("OpenCode Personal");
  });

  it("falls back to a humanized driver kind when no displayName is set", () => {
    const provider = makeProvider({
      displayName: undefined,
      instanceId: ProviderInstanceId.make("opencode_default"),
      driver: ProviderDriverKind.make("claudeCode"),
    });
    expect(resolveProviderLabel(provider)).toBe("Claude Code");
  });
});

describe("buildProviderStatusToastCopy", () => {
  it("returns null for ready providers", () => {
    expect(buildProviderStatusToastCopy(makeProvider({ status: "ready" }))).toBeNull();
  });

  it("returns null for disabled providers", () => {
    expect(buildProviderStatusToastCopy(makeProvider({ status: "disabled" }))).toBeNull();
  });

  it("surfaces the server message and uses an error toast for error status", () => {
    const provider = makeProvider({
      status: "error",
      message:
        "Failed to execute OpenCode CLI health check: Timed out waiting for OpenCode server start after 5000ms.",
    });
    expect(buildProviderStatusToastCopy(provider)).toEqual({
      type: "error",
      title: "OpenCode provider status",
      description:
        "Failed to execute OpenCode CLI health check: Timed out waiting for OpenCode server start after 5000ms.",
    });
  });

  it("falls back to a default message when the error has no message", () => {
    const provider = makeProvider({ status: "error", message: undefined });
    expect(buildProviderStatusToastCopy(provider)).toEqual({
      type: "error",
      title: "OpenCode provider status",
      description: "OpenCode provider is unavailable.",
    });
  });

  it("uses a warning toast with a limited-availability default message", () => {
    const provider = makeProvider({ status: "warning", message: undefined });
    expect(buildProviderStatusToastCopy(provider)).toEqual({
      type: "warning",
      title: "OpenCode provider status",
      description: "OpenCode provider has limited availability.",
    });
  });
});
