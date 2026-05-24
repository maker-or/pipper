import { scopeThreadRef } from "@t3tools/client-runtime";
import {
  type EnvironmentId,
  type ProjectId,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";

const TERMINAL_WORKSPACE_THREAD_ID_PREFIX = "terminal-workspace:";

export function isTerminalWorkspaceThreadId(threadId: string): boolean {
  return threadId.startsWith(TERMINAL_WORKSPACE_THREAD_ID_PREFIX);
}

export function terminalWorkspaceThreadId(input: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}): ThreadId {
  return `${TERMINAL_WORKSPACE_THREAD_ID_PREFIX}${input.environmentId}:${input.projectId}` as ThreadId;
}

export function terminalWorkspaceThreadRef(input: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}): ScopedThreadRef {
  return scopeThreadRef(input.environmentId, terminalWorkspaceThreadId(input));
}
