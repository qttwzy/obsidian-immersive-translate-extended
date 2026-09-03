# Public beta release process

This process implements [ADR 0001](decisions/0001-public-beta-release-contract.md). It builds a GitHub Pre-release for the complete-ZIP channel. It does not create a BRAT or Obsidian Community release.

## Release inputs

Use Node.js 22, npm, `zip`, and a clean reviewed checkout. The following inputs must refer to the same candidate:

- synchronized version metadata in `package.json`, `plugin/manifest.json`, generated `plugin/main.js`, and dashboard bridge source;
- a platform evidence JSON stored outside the repository;
- `THIRD_PARTY_NOTICES.md` describing the official runtime source and upstream ownership.

Evidence files can identify maintainers and test systems, so keep local JSON inputs outside Git. The evidence URLs written into the release manifest must be suitable for release recipients to review.

## Platform evidence schema

Test the exact candidate commit in clean Obsidian profiles on macOS and Windows. In each profile, install the runtime from plugin settings and record the version shown there. The packager resolves the clean Git `HEAD` and requires evidence for that commit and plugin version.

```json
{
  "schemaVersion": 1,
  "pluginVersion": "4.0.0",
  "minimumObsidianVersion": "1.12.7",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "testedAt": "2026-09-01T00:00:00Z",
  "platforms": {
    "macos": {
      "status": "passed",
      "runtimeVersion": "2.3.4",
      "evidence": "https://example.invalid/macos-acceptance"
    },
    "windows": {
      "status": "passed",
      "runtimeVersion": "2.3.4",
      "evidence": "https://example.invalid/windows-acceptance"
    }
  }
}
```

Each acceptance record should cover fresh plugin installation, the automatic local/official runtime version display in settings, the account name and membership status, the Dashboard button and login/sync flow, the disabled “已是最新版本” state when versions match, runtime installation and update, restart, disable/re-enable, uninstall/reinstall, Reading View and selection translation, scope toggles, explicit conflict handling, startup with an already installed runtime while offline, and missing, invalid-version, or unavailable-official-version states. It must also cover the PDF header action and command, controlled handoff of the active Vault PDF, manual fallback, the general document workspace, and translated-PDF save, cancel, and failure paths.

## Build

Start from the exact candidate commit and make sure the output directory does not already exist:

```bash
npm ci --ignore-scripts
npm run build
npm run quality
npm run release:build -- \
  --root "$PWD" \
  --platform-evidence /absolute/path/to/platform-evidence.json \
  --out "$PWD/releases/4.0.0"
```

The builder checks that the source is a clean Git commit, materializes that commit in a detached temporary worktree, and reads every shipped source file and SBOM input from that immutable snapshot. It also checks generated-code drift, synchronized versions, regular-file inputs, macOS and Windows results, each platform's tested runtime version, and the ZIP allowlist. Completed artifacts are moved atomically into the requested output directory.

The SPDX 2.3 SBOM describes the project application and its production npm metadata. `release-manifest.json` records the official runtime source, the versions used for each platform's acceptance, and the user-initiated setup method.

Expected artifacts:

```text
immersive-translate-extended-4.0.0.zip
immersive-translate-extended-4.0.0.spdx.json
release-manifest.json
SHA256SUMS
```

## Final inspection

```bash
cd releases/4.0.0
shasum -a 256 -c SHA256SUMS
unzip -l immersive-translate-extended-4.0.0.zip
```

Confirm that the ZIP contains exactly one `immersive-translate-extended/` directory with:

```text
LICENSE
THIRD_PARTY_NOTICES.md
dashboard-preload.js
document-preload.js
document-runtime.js
main.js
manifest.json
styles.css
```

Install this exact ZIP in clean macOS and Windows profiles for a final smoke check. Open settings and confirm both version states, use the settings button to install the runtime, translate a Reading View note, open a Vault PDF through its header action, and verify the official document workspace. Compare the generated manifest, SBOM, checksums, and evidence URLs with the approved candidate.

## Publish

After repository-history review and maintainer approval:

1. create the clean public product repository from the reviewed source tree;
2. enable required CI, code scanning, dependency updates, secret scanning where available, protected default-branch rules, and protected release tags;
3. create tag `4.0.0` from the approved commit;
4. create a GitHub Release with the Pre-release flag enabled;
5. upload only the four expected artifacts above;
6. verify downloads and checksums from an unauthenticated session.

Keep the Release in draft state whenever an input, evidence link, scan, or smoke result changes. Rebuild from a new reviewed commit instead of modifying an already approved artifact.
