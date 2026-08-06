# Repository workflow

- After completing requested code changes, run TypeScript checks, Rust tests, Clippy, and the frontend build.
- When checks pass, bump the patch version unless the user specifies another version.
- Build the Windows NSIS installer and refresh `latest.json` with `release.ps1`.
- Commit and tag the release, then push and publish it through GitHub CLI when `gh` is installed and authenticated.
- If publishing is blocked by missing credentials or network access, leave the installer, commit, tag, and `latest.json` ready, then report only the exact command the user must run.
- Never publish a release when validation fails.
