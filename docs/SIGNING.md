# Code signing (removes the "unidentified developer" warnings)

Quick Pebble works without signing, but macOS and Windows show a warning the first time it is opened (see
[INSTALL-macOS.md](INSTALL-macOS.md) and [INSTALL-Windows.md](INSTALL-Windows.md)). Signing removes that warning.
It needs accounts and certificates that only the project owner can buy, so it is **ready to switch on, but not on**.

## macOS: sign and notarize

1. Join the **Apple Developer Program** (paid, yearly).
2. Create a **Developer ID Application** certificate, export it as `.p12`, and convert it to base64:
   `base64 -i certificate.p12 | pbcopy`
3. Create an **app-specific password** at appleid.apple.com.
4. In the repository: **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | the base64 text of the `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | the password you set when exporting it |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | your Apple ID email |
| `APPLE_PASSWORD` | the app-specific password |
| `APPLE_TEAM_ID` | your 10-character team ID |

The *Preview builds* workflow detects these secrets and signs and notarizes the Intel disk image automatically.
The stable *Release* workflow (tauri-action) reads the same variable names. Nothing else needs to change.

## Windows: sign the installer

Buy a code-signing certificate (or use a signing service such as Azure Trusted Signing), then configure it in
`src-tauri/tauri.conf.json` under `bundle.windows` (`certificateThumbprint` or `signCommand`) and add the
certificate to the Windows runner in the workflow. SmartScreen reputation also builds up over time as more people
install a signed app.
