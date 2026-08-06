# Repository workflow

- After completing requested code changes, run TypeScript checks, Rust tests, Clippy, and the frontend build.
- When checks pass, bump the patch version unless the user specifies another version.
- Refresh `latest.json`, commit, tag, and push with `release.ps1`.
- Let `.github/workflows/release.yml` build the Windows NSIS installer and publish the GitHub Release.
- If pushing is blocked by credentials or network access, leave the commit and tag ready, then report only the exact push command the user must run.
- Never publish a release when validation fails.
