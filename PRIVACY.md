# Privacy

Last updated: 2026-09-01

This notice describes Immersive Translate Extended 4.0.0 for Obsidian Desktop. The plugin is an unofficial community project and does not operate the translation services it connects to.

## What leaves your device

Opening plugin settings requests the current script from `https://download.immersivetranslate.com/immersive-translate.user.js` so the plugin can parse and display its version metadata. The script is written to the plugin directory only when you choose Install or Update.

Translation is an intentional network action. Depending on the provider and runtime configuration, the following data may be sent to Immersive Translate endpoints and the selected translation provider:

- Markdown text shown in Reading View;
- selected text, hovered text, or Obsidian interface text chosen for translation;
- the content and filename of a PDF handed off from the active Vault view, or a document you manually select in the official workspace;
- translation settings such as source language, target language, mode, and provider;
- normal network metadata such as IP address, request timing, and service authentication data.

The recipient, processing region, retention period, account terms, and paid-service rules are controlled by that third party. Review the provider's privacy policy before translating confidential, regulated, or personally identifying content.

The PDF/document workspace runs in an isolated window restricted to trusted `https://app.immersivetranslate.com` document routes. Opening a PDF translation attempts to hand the checked local file to that workspace; manual selection is used for other supported formats and as the fallback. Saving a translated PDF is a separate user action.

## Local storage

The plugin stores host-level options in the plugin's `data.json` and stores the user-installed runtime as `userscript.runtime.js` in the local plugin directory. The runtime uses Obsidian's Web storage for translation configuration and may store provider credentials there when the user configures a service. When you save a translated PDF, the plugin writes it beside the source file with a distinct translated filename.

The safe configuration export is user initiated. It limits accepted fields, item count, and total size, and filters credential-, token-, API-key-, and password-like fields. Because unknown third-party fields can evolve, inspect every exported file before sharing it.

## Project telemetry and diagnostics

The 4.0.0 plugin code does not add a project-operated analytics or crash-reporting service. The user-installed runtime and chosen translation providers may perform their own service requests as described above.

Console errors and user-created diagnostic material can still contain note excerpts, local paths, plugin names, service responses, or account context. Redact those items before opening a public issue. Never submit passwords, cookies, authorization headers, API keys, tokens, or private notes.

## Your controls

You can stop further plugin activity by ending translation, closing the document workspace, or disabling the plugin. You decide when to install or update the runtime, invoke PDF/document translation, save an exported PDF, select a provider, change translation scopes, export a filtered configuration, or uninstall the plugin.

Uninstalling removes the plugin files when you delete its directory. Runtime settings may remain in Obsidian Web storage, and third-party providers retain data according to their own policies. Back up the Vault before manually clearing storage.

## Security and questions

Report security-sensitive privacy issues through the private process in [SECURITY.md](SECURITY.md). Use [SUPPORT.md](SUPPORT.md) for non-sensitive questions.

Material changes to these data paths require an update to this notice and a new plugin release.
