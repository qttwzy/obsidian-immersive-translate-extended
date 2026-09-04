# Security policy

## Supported versions

Security fixes are provided for the latest published 4.0.x prerelease. Reproduce reports on the latest available version when possible.

## Report a vulnerability

Use the repository Security tab's **Report a vulnerability** action to open a private security advisory. If that action is unavailable, contact the repository owner through a private channel listed on their GitHub profile.

Do not disclose a suspected vulnerability in a public Issue, pull request, log paste, or screenshot.

Include:

- affected plugin and Obsidian versions;
- operating system and installation method;
- impact and the smallest safe reproduction;
- whether the issue requires a malicious note, network response, runtime file, or local account;
- relevant stack traces with note text, paths, identities, cookies, tokens, and credentials removed;
- any suggested mitigation or coordinated-disclosure deadline.

## Release integrity

Each project release attaches one complete plugin ZIP. GitHub displays the uploaded asset's digest on the Release page. The ZIP is assembled by the public repository workflow from the tagged product snapshot and contains the plugin files listed in [README.md](README.md).
