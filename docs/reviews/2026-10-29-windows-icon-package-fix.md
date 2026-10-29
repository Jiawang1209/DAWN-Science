# Windows application icon packaging fix — 2026-10-29

Branch: `codex/fix-windows-app-icon`; base local main `735db8dd`. Workspace: `/Users/liuyue/.codex/worktrees/windows-app-icon-fix/dawn-science`.

## Cause and correction

Both v0.0.38 and local main set `win.signAndEditExecutable: false`. The installed electron-builder 26.15.3 implementation returns before resource editing when this flag is false, preserving Electron's executable icon. The existing 1024px RP PNG itself is correct.

Keep executable resource editing enabled, set `signExecutable: false` to retain the unsigned Windows distribution policy, and explicitly select the RP ICO for Windows application/setup/uninstaller resources. The ICO contains PNG frames at 16/24/32/48/64/128/256px, generated from the existing approved PNG. No existing PNG/SVG/tray artwork was changed. `npm run make-icon` now regenerates the ICO along with existing icon outputs. The existing transitive build tool resedit 1.7.2 is explicitly declared as a development dependency for generation and resource verification; no dependency version or application version changed.

## Guard against recurrence

`node scripts/verify-windows-icon.mjs` reads PE resources without executing Windows code. It compares every primary-icon frame payload against the committed ICO, rather than merely checking that an icon exists. On the native Windows release runner, the default paths cover the unpacked app, versioned x64 installer and portable executable. Explicit file arguments support inspection elsewhere. Release jobs run the check after packaging and before uploading artifacts.

Tests cover resource-edit/signing policy, all seven ICO sizes, explicit installer/uninstaller icon paths, CLI production dependencies, correct RP resources, missing resources, and a wrong primary icon even when a secondary group contains RP.

## Evidence before integration

- New configuration regression first failed on the old `signAndEditExecutable: false` setting.
- New verifier regressions failed before the checker existed; all **7** configuration/PE-resource checks then passed.
- Related regression: **21 files, 195 tests passed**, exit 0. Typecheck, full Electron/CLI/UI build, script syntax checks and diff checks passed.
- The real icon generator ran in an isolated output directory. Its ICO frame hashes exactly match the committed ICO. The repository's existing PNG/tray assets were preserved. The extracted 256px frame was visually inspected and shows the existing RP mark.
- `npx electron-builder --win --x64 --publish never` completed on macOS, producing the unpacked app, NSIS installer and portable executable. Resource editing ran; logs confirm code signing alone was skipped.
- The checker passed all three real outputs, with all **7 RP frames** matching in each: `release/win-unpacked/DAWN Science.exe`, `release/DAWN-Science-0.0.38-win-x64.exe`, `release/DAWN-Science-0.0.38-win-x64-portable.exe`.
- Embedded main-executable ProductName/FileDescription/InternalName are DAWN Science; FileVersion is 0.0.38 and ProductVersion is 0.0.38.0, confirming that resource editing is active.
- An independent read-only review found no actionable defects.

These Windows artifacts are resource-verification outputs from a Mac cross-build. They must not be published or installed as Windows-qualified release artifacts: platform-native modules were not rebuilt for Windows. Windows runtime, installer execution, Explorer/taskbar rendering and icon-cache behavior have not been tested on a Windows host. Native Windows CI builds retain that responsibility and now include both packaged CLI startup and PE-icon checks. No remote push, tag, public release, installed-app replacement or system configuration change was performed.
