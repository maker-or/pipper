# Pipper Evolution Architecture

## Vision

Pipper is a local-first, self-improving agentic development environment.

Unlike traditional software, Pipper allows users to evolve their own local descendant of the application through autonomous coding agents. Instead of waiting for the organization to release features, users can modify, extend, and personalize the application directly.

The system is designed around:

- Local-first evolution
- Git-based ancestry and history
- Agent-driven customization
- Semantic change tracking
- Upstream reconciliation
- Continuous evolution instead of software replacement

---

# High-Level Architecture

```text
                PIPPER ORGANIZATION

                    Base Repo
                         │
                         ▼
                 Update Registry
                         │
                         ▼

 ┌──────────────────────────────────────────┐
 │          USER PIPPER INSTALLATION         │
 └──────────────────────────────────────────┘

            Main Pipper Application
                         │
                         ▼

                  New Space
                         │
                         ▼

                Evolution Space
                         │
                         ▼

      ~/Library/evolve/pipper (macOS)
      %LOCALAPPDATA%/evolve/pipper (Windows)

                         │
                         ▼

                Local Git Repository
                         │
                         ▼

                 Agent Evolution
                         │
                         ▼

             patch.md + Commit History
                         │
                         ▼

               Local Release Builds
```

---

# Core Components

## Main Pipper Application

Purpose:

- Stable shell
- Navigation
- Settings
- Agent orchestration
- Update notifications
- Release management

The main application remains relatively stable.

The evolving runtime lives inside the Evolution Space.

---

## Evolution Space

Purpose:

A dedicated environment where autonomous agents can evolve Pipper.

Characteristics:

- Separate UI
- No project sidebar
- Dedicated runtime mode
- Direct source code access
- Agent-first workflow

This is where all mutations occur.

---

## Local Runtime Directory

### macOS

```text
~/Library/evolve/pipper
```

### Windows

```text
%LOCALAPPDATA%/evolve/pipper
```

Structure:

```text
pipper/
├── .git/
├── src/
├── releases/
├── agent-memory/
├── DESIGN.md
├── instructions.md
└── patch.md
```

---

# First-Time Initialization

```text
User enters Evolution Space
          │
          ▼
Check if runtime exists
          │
     ┌────┴────┐
     │         │
     ▼         ▼

 Exists      Missing
     │         │
     ▼         ▼

 Open      Clone Repo
 Runtime        │
                ▼
         Install Dependencies
                │
                ▼
         Create Manifest
                │
                ▼
           Launch Space
```

---

# Agent Runtime

## Responsibilities

- Modify source code
- Add features
- Improve workflows
- Refactor code
- Inspect diffs
- Update DESIGN.md
- Maintain patch.md
- Create local commits

## Restrictions

- Never push code
- Never create remotes
- Never sync externally
- Never overwrite history

All commits are local evolutionary checkpoints.

---

# Design System

File:

```text
DESIGN.md
```

Purpose:

Canonical visual language for the application.

Rules:

- Follow existing design conventions
- Explain major design deviations before implementing them
- Update DESIGN.md only after user approval
- Preserve design consistency

---

# Evolution Memory

File:

```text
patch.md
```

Purpose:

Track semantic differences between the current descendant and the upstream application.

Git stores:

- What changed

patch.md stores:

- Why it changed
- User preferences
- Workflow motivations
- Evolution intent

Example:

```json
{
  "commit": "abc123",
  "files_changed": ["src/components/sidebar.tsx"],
  "why": "User prefers terminal-first workflows"
}
```

Important:

patch.md should represent current deviations from upstream rather than becoming an infinitely growing history log.

---

# Development Workflow

```text
User Request
      │
      ▼

Agent Changes Code
      │
      ▼

User Clicks Run
      │
      ▼

Preview Environment
      │
      ▼

User Approves
      │
      ▼

git commit
      │
      ▼

Update patch.md
```

Rules:

- No commit before approval
- No patch.md update before commit
- No push operations

---

# Release Generation

After approval:

```text
User Clicks Port
```

Flow:

```text
Commit
   │
   ▼

Build Electron App
   │
   ▼

Store In Releases
```

Example:

```text
releases/
├── release-v1/
├── release-v2/
└── release-v43/
```

Rules:

- Never overwrite releases
- Append-only storage
- Allow rollback
- Preserve lineage

---

# Update Architecture

Traditional software:

```text
Download Installer
Replace App
```

Pipper:

```text
Review Changes
Reconcile Changes
Preserve Descendant
```

---

# Update Registry

Purpose:

Provide a centralized source of truth that informs local descendants that a newer upstream version exists.

Example:

```json
{
  "latest": "1.4.0",
  "type": "security",
  "updateBundle": "..."
}
```

The registry contains metadata only.

It does not contain:

- User code
- User history
- User descendants

---

# Update Bundle

Example:

```text
update-1.4.0/
├── manifest.json
├── changed-files/
├── migration.md
└── release-notes.md
```

Contains:

- Changed file snapshots
- Migration information
- Security updates
- Update intent

---

# Update Flow

```text
Startup
   │
   ▼

Check Registry
   │
   ▼

Update Available
   │
   ▼

User Clicks Review
   │
   ▼

Download Update Bundle
   │
   ▼

Agent Analysis
```

Agent receives:

- Local codebase
- patch.md
- Update bundle

The agent performs:

```text
Reconciliation
```

not:

```text
Reimplementation
```

---

# Reconciliation Flow

Agent compares:

- Current local state
- Upstream changed files
- patch.md intent

Questions:

- What changed upstream?
- What changed locally?
- Which user adaptations must be preserved?
- Which upstream changes are critical?

Result:

- Security fixes applied
- User customizations preserved
- New baseline established

---

# Long-Term Philosophy

Git becomes:

```text
Ancestry
```

patch.md becomes:

```text
Intent Memory
```

Update Registry becomes:

```text
Organization Intent
```

Agent becomes:

```text
Reconciliation Engine
```

The system is not based on software replacement.

It is based on continuous evolution where each user's installation becomes an independently evolving descendant capable of inheriting improvements from its upstream ancestor while preserving its own identity.
