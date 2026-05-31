**Plan Of Action**

1. **Lock Hackathon Scope**
   - macOS only.
   - Hardcode evolution runtime path to `~/Library/evolve/pipper`.
   - Assume cloned repo already contains `DESIGN.md` and `patch.md`.
   - Do not create `instructions.md`.
   - Focus demo flow: **Improve Space → agent changes app → Run preview → approve → commit → Port → DMG opens**.

2. **Runtime Path Cleanup**
   - Replace current lowercase `~/library/evolve/pipper` usage with `~/Library/evolve/pipper`.
   - Centralize it in one constant/helper so web, desktop, and server use the same path.
   - Update Codex special instruction detection to match this path.

3. **Improve Space Initialization**
   - On Improve open:
     - check `~/Library/evolve/pipper`
     - if missing, clone/copy repo there
     - run dependency install if needed
     - register it as a project
     - open a new agent thread in that workspace
   - For hackathon, skip advanced corruption recovery and show a clear failure message if clone/install fails.

4. **Run Preview**
   - Keep the existing `Run desktop` button concept.
   - It should run from `~/Library/evolve/pipper`:
     ```bash
     bun run dev:desktop
     ```
   - Launch the evolved app as a separate Improve/dev instance.
   - This gives the jury the visible “the app is running from its evolved source” moment.

5. **Approval + Commit Flow**
   - Add an explicit **Approve Changes** button in Improve Space.
   - On click:
     - verify working tree has changes
     - run required checks if time allows:
       ```bash
       bun fmt
       bun lint
       bun typecheck
       ```
     - create local commit
     - update `patch.md` with:
       - commit hash
       - files changed
       - user intent / summary
   - No push, no remote creation.

6. **Port Feature**
   - Add a **Port** button available only after approved commit.
   - On click, run the existing macOS build command inside `~/Library/evolve/pipper`.
   - Recommended command:
     ```bash
     bun run dist:desktop:dmg
     ```
   - If we want host-specific builds:
     ```bash
     bun run dist:desktop:dmg:arm64
     ```
     or
     ```bash
     bun run dist:desktop:dmg:x64
     ```

7. **Release Folder Handling**
   - After build, locate the generated `.dmg`.
   - Copy or move it into:
     ```text
     ~/Library/evolve/pipper/releases/release-N/
     ```
   - Write a simple manifest:
     ```json
     {
       "releaseId": "release-1",
       "commit": "...",
       "createdAt": "...",
       "dmgPath": "...",
       "platform": "macos"
     }
     ```
   - Never overwrite old releases.

8. **Open DMG Installer**
   - After the `.dmg` is placed in the release folder, open it programmatically:
     ```bash
     open /path/to/release-N/Pipper.dmg
     ```
   - This should mount the DMG and show the installer Finder window.

9. **Current App Replacement**
   - I would not auto-delete the running app directly during the hackathon demo. Deleting the currently running app from `/Applications` is risky and can fail depending on whether the app is launched from there.
   - Safer demo behavior:
     - open the DMG
     - let Finder show the app + Applications shortcut
     - user manually drags/replaces
   - If we must automate deletion:
     - ask for confirmation
     - move old app to Trash, not permanent delete
     - skip if the current running app path equals the target app path
     - show a message: “Quit Pipper before replacing the installed app.”

10. **UI Needed**

- Improve Space header:
  - runtime status
  - Run Preview button
  - Approve Changes button
  - Port button
- Port status states:
  - idle
  - building
  - copying DMG
  - opening installer
  - failed
  - done

11. **Implementation Order**
1. Fix hardcoded path to `~/Library/evolve/pipper`.
1. Add desktop IPC for `portEvolutionRelease`.
1. Implement build command runner.
1. Locate/copy `.dmg` into `releases/release-N`.
1. Open `.dmg` with `open`.
1. Add Port button UI.
1. Add basic release manifest.
1. Add commit/patch flow if not already wired.
1. Run `bun fmt`, `bun lint`, `bun typecheck`.

For the hackathon demo, the most important piece is: **the jury sees a customized local Pipper build produce a real macOS DMG and open the installer window.**
