## Outcome

Describe the accepted user-visible or maintainer-visible result.

## Verification

- [ ] `npm run build`
- [ ] `npm run quality`
- [ ] Relevant manual Obsidian journey completed when behavior changed
- [ ] Generated `plugin/main.js` matches `plugin/main.entry.js` and embedded modules

## Contract checks

- [ ] Tests cover the changed behavior or explain why a test is not practical
- [ ] User documentation, privacy, security, support, and third-party notices reflect any changed contract
- [ ] Plugin, manifest, package, lockfile, and bridge versions are synchronized when applicable
- [ ] Main-window and preload protocol changes are synchronized when applicable
- [ ] The diff contains no credentials, private notes, Vault data, downloaded runtime, or debug artifacts
- [ ] Release metadata describes the final diff and accepted behavior
