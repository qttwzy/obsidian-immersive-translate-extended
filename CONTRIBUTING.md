# Contributing

Issues and pull requests are welcome on this public product snapshot.

## Report an issue

Use the bug or feature template and provide the plugin version, Obsidian version, operating system, and the smallest reproducible example. Review logs and screenshots before posting so they do not contain note text, local paths, account details, cookies, tokens, API keys, or provider responses.

Security vulnerabilities follow [SECURITY.md](SECURITY.md).

## Propose a patch

The public repository can be cloned and tested directly:

```bash
npm ci --ignore-scripts
npm run build
npm run quality
```

Keep each pull request focused on one observable outcome. Update tests and user-facing documentation when the behavior or contract changes. `plugin/main.entry.js` is the main source entry and `plugin/main.js` is generated with `npm run build`.

The maintainer integrates accepted changes in the canonical development repository and publishes the result through a later public snapshot. This keeps Issues and patch review convenient while preserving one development history.

Repository code is available under the [MIT License](LICENSE). Runtime integration changes must keep the official source, user-initiated installation, privacy disclosure, and attribution notices current.
