# Contributing

Thanks for helping improve Immersive Translate Extended.

## Product and source boundary

The active plugin is under `plugin/`. Edit `plugin/main.entry.js` and its local modules, then generate `plugin/main.js` with the build script.
`plugin/main.js` and `plugin/dashboard-preload.js` run in different environments. A protocol constant or algorithm shared across them must be updated and tested on both sides. User interfaces use DOM APIs such as `createDiv` and `createEl` rather than HTML string injection.

Do not commit credentials, cookies, tokens, private notes, Vault content, downloaded runtimes, release evidence containing personal data, or authenticated session material.

## Development setup

Use Node.js 22 and npm:

```bash
npm ci --ignore-scripts
npm run build
npm run quality
```

The required verification is:

```bash
npm test
node --check plugin/main.js
node --check plugin/dashboard-preload.js
```

Tests should cover behavior at the narrowest stable seam. Runtime loading, packaging, path validation, IPC boundaries, and configuration filtering require regression tests before implementation changes are accepted.

## Pull requests

- Keep a pull request focused on one user-visible outcome.
- Describe the accepted behavior and its verification evidence.
- Update tests, README, privacy, third-party notices, or release documentation when their contract changes.
- Keep `plugin/main.entry.js`, generated `plugin/main.js`, `plugin/manifest.json`, `package.json`, and the dashboard bridge version synchronized when releasing.
- Preserve unrelated worktree changes and avoid generated or debug artifacts.
- Complete the pull-request checklist and ensure CI is green.

Repository code is available under the MIT License. Runtime integration changes must keep the official source, user-initiated setup contract, privacy disclosure, and attribution notices current.
