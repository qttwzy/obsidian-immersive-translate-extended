# ADR 0001: Public beta release contract

- Status: Accepted
- Date: 2026-09-01
- Decision owners: project maintainers

## Context

The product evolved from a private I18N patch repository into a standalone Obsidian plugin. The active product needs clear boundaries between project-owned release assets, the translation runtime obtained by each user, user documentation, and release evidence.

Obsidian's manifest version uses `x.y.z`. GitHub can independently mark a Release as a prerelease, so a public beta does not require a prerelease suffix inside `manifest.json`.

Dashboard/account integration and document workspaces introduce remote-window, IPC, authentication, local-file, and cross-platform boundaries. The document workspace uses an isolated, trusted-origin window with controlled local-file handoff and is included in the same macOS/Windows acceptance contract as Reading View translation.

## Decision

1. The public product will start from a clean repository assembled from reviewed active source, tests, release tooling, and user documentation. The current repository remains a private archive until history, secrets, ownership, and third-party material have been audited.
2. The first distribution channel is a GitHub Pre-release containing one complete plugin ZIP plus `SHA256SUMS`, an SPDX 2.3 SBOM, and `release-manifest.json`. Individual Obsidian three-file assets are reserved for a separately validated channel.
3. Version `4.0.0` is used in `package.json`, `plugin/manifest.json`, the generated plugin entry, and bridge metadata. GitHub carries the beta designation through its Pre-release flag.
4. Opening plugin settings retrieves the current translation runtime from the official Immersive Translate address to display its `@version` metadata. Installation and updates remain explicit user actions. Startup reads only the locally installed file and validates its version metadata.
5. The plugin ZIP contains project-owned plugin assets and attribution notices. The release SBOM describes the project application, while `THIRD_PARTY_NOTICES.md` records the official runtime source and upstream ownership.
6. The 4.0.0 user-facing scope is Markdown Reading View translation, selection/hover translation, translation-scope controls, safe configuration transfer, explicit conflict choices, account status and Dashboard/account synchronization, and the isolated official PDF/document workspace.
7. Vault PDFs expose a controlled automatic-handoff path and translated-PDF export; other supported document formats use manual selection in the official workspace. Dashboard/account synchronization ships in the same release with an isolated, sandboxed window, a restricted preload/IPC host bridge, and the same macOS/Windows security and acceptance contract.
8. The minimum supported host is Obsidian Desktop `1.12.7`. Every public beta requires passed macOS and Windows evidence for the exact plugin version, minimum Obsidian version, commit, and each platform's tested runtime version.
9. Creation of the public repository, tag, and Pre-release occurs only after full-history and artifact review, platform acceptance, final package inspection, and maintainer approval.

## Consequences

- Users can compare the installed and current official runtime versions in settings, then choose whether to install or update.
- Plugin installation, upgrade, rollback, and support use the same complete-ZIP contract; runtime setup is a separate user action inside Obsidian.
- Standard BRAT and Obsidian Community distribution remain separate future decisions because their three-file contract and policy review differ from this beta.
- Release evidence can block artifact creation; evidence records are inputs rather than informal checklist notes.
- Feature-gated source can continue to be tested without expanding the shipped product boundary.

## Implementation references

- Runtime installer: `plugin/runtime-installer.js`
- Runtime settings and loading: `plugin/main.entry.js`
- Document workspace and preload: `plugin/document-workspace.js`, `plugin/document-preload.js`
- Release builder: `scripts/release-plugin.js`
- Release instructions: `docs/RELEASE_PROCESS.md`
- Readiness audit: `docs/RELEASE_READINESS.md`
