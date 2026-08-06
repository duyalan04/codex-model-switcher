# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Update notifications

On launch the app checks the latest GitHub release and shows a banner when a newer version exists. No per-machine setup is needed; the manifest URL is built in:

```
https://github.com/duyalan04/codex-model-switcher/releases/latest/download/latest.json
```

To override it (staging, internal host), add `update_url` to `%APPDATA%\9router\db\codex-switch.toml`.

### Publishing a release

Close the running app, then:

```powershell
.\release.ps1 0.3.0 "Adds remaining quota panel"
```

That is the whole release. The script bumps the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`, regenerates `latest.json`, builds the installer, commits, tags, pushes, and publishes the GitHub release with the installer and `latest.json` attached.

It needs the GitHub CLI once:

```powershell
winget install GitHub.cli
gh auth login
```

Use `-NoPublish` to build only and handle the release manually.

Every machine already running a build with this updater sees the banner on next launch. Clicking **Update now** downloads the installer and runs it with `/UPDATE /P`, so it overwrites the existing installation in place: no directory prompts, no duplicate install, and settings under `%APPDATA%\9router` are untouched. The app closes so its files are unlocked while the installer replaces them.

Because the installer is unsigned, Windows SmartScreen may warn on first download. Signing the installer with a code-signing certificate removes that prompt.
