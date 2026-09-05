# Support

## Supported product boundary

The 4.0.x public beta supports Obsidian Desktop 1.12.7 or newer, Markdown Reading View translation, interface translation in host popout windows such as Settings and the community plugin or theme browsers, and the official PDF/document translation workspace. Plugin settings show the locally installed runtime and current official version, with install and update actions from the official source.

Vault PDFs expose a languages action in the active PDF view and attempt a controlled handoff to the isolated official workspace. Other supported documents use manual file selection in that workspace. Linux is outside the first beta acceptance matrix.

## Before opening an issue

1. Confirm the plugin was installed from a complete Pre-release ZIP.
2. Open plugin settings and confirm that “翻译运行时” shows both the local status and current official version; use its install or update button if needed.
3. Reproduce in the relevant Markdown Reading View, host popout window, or active PDF view on the latest published beta. For a missing PDF action, reload Obsidian or disable and re-enable the plugin after replacing its files. For an untranslated Settings or community browser window, confirm UI translation is enabled, keep the main window in bilingual or translation-only mode, then close and reopen that window.
4. Restart Obsidian and test with overlapping translation plugins kept inactive when that is safe for your Vault.
5. Check the release notes and existing issues for the same behavior.

## A useful bug report

Provide the plugin version, Obsidian version, operating system, install or upgrade path, expected result, actual result, and minimal reproduction. State which translation provider and mode were selected, but replace account identifiers and secrets with placeholders.

Screenshots and console output must be reviewed for note text, file paths, usernames, email addresses, cookies, tokens, authorization headers, API keys, and provider responses before upload.

Use the repository's bug-report template for reproducible defects and the feature-request template for scoped proposals. General provider billing, quota, or account questions belong with that provider.

Security vulnerabilities and sensitive privacy reports follow [SECURITY.md](SECURITY.md), not the public issue tracker.
