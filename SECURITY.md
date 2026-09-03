# Security policy

## Supported versions

Security fixes are provided for the latest published 4.0.x public beta. Development snapshots and older releases should be reproduced on the latest candidate before reporting.

## Report a vulnerability

Use the repository Security tab's **Report a vulnerability** action to open a private security advisory. If that action is unavailable, contact the repository owner through a private channel listed on their GitHub profile.

Do not disclose a suspected vulnerability in a public Issue, Discussion, pull request, log paste, or screenshot.

Include:

- affected plugin and Obsidian versions;
- operating system and installation method;
- impact and the smallest safe reproduction;
- whether the issue requires a malicious note, network response, runtime file, or local account;
- relevant stack traces with note text, paths, identities, cookies, tokens, and credentials removed;
- any suggested mitigation or coordinated-disclosure deadline.

The maintainer will validate scope, coordinate a fix and release when warranted, and credit reporters who request attribution. Please allow time for investigation before publishing details.

## Release integrity

Official beta artifacts are complete ZIP files attached to GitHub Pre-releases. Verify the ZIP against `SHA256SUMS` and inspect `release-manifest.json` for the plugin version, each platform's tested runtime version, official runtime source, and platform acceptance links. The plugin checks the installed runtime's version metadata before loading it.

The repository's release process is documented in [docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md).
