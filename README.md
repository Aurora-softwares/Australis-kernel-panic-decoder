# Australis Crash Diagnostics

A small, mobile-friendly Vue 3 application for **public** Australis OS kernel panic diagnosis. It reads a panic QR code or text locally, provides a safe plain-English explanation, and can optionally check public [Australis OS GitHub issues](https://github.com/Aurora-softwares/Australis-OS/issues) for potentially related reports.

## Features

- **Three simple inputs:** scan live QR through the camera, upload a screenshot, or paste panic text. A sample report and sample QR are included.
- **Public-friendly results:** no compiler implementation details, internal paths, instruction addresses, or raw register dumps on the main screen. Raw diagnostics are only available behind the **Technical details (optional)** disclosure, locally in the browser.
- **System light/dark mode:** default **Auto** follows the operating system; visitors can choose Light or Dark. Only the appearance preference is saved locally.
- **GitHub issue lookup (explicit opt-in):** tap **Check existing issues** to query GitHub's public API using **only the error category**, e.g. `invalid opcode`. The raw QR, RIP, registers, kernel messages, timestamps, build and any personal details are **not sent** to GitHub.
- **Related ≠ identical:** search results are labelled *potentially related*. If the query returns nothing, the UI clearly says a match was not found, rather than asserting that the bug is new.
- **Safe issue draft:** if visitors choose to open a report, the GitHub **Create an issue** link pre-fills a descriptive error name, numeric exception vector (when present), and prompts for reproduction steps. It **never** embeds raw diagnostic values, addresses, log contents or personal data. An OS version is **not required**.
- Runs as a static site; no account, database, private GitHub token, AI service, or server required.

### Privacy considerations

QR decoding and diagnosis happen entirely in the browser. GitHub search is only performed after an explicit click. That search sends the error classification plus standard requests to `api.github.com`; GitHub receives typical connection metadata such as IP address when visited. Creating an issue opens GitHub and requires its usual account/sign-in steps. Users can always skip GitHub and still receive a local explanation. The web app has no telemetry. **Do not add tokens, secret environment values, private file contents or an internal symbol map to a public GitHub Pages repository**: static web assets are publicly readable.

## How visitors use it

1. Look for the diagnostic QR on the Australis crash screen.
2. Open the website on a phone, choose **Camera**, tap **Start scanning**, then point at the QR code. Alternatively **Upload image** or **Paste text**.
3. Read what happened and what to do next. If the crash was unexpected, tap **Check existing issues**.
4. Review any related reports. If needed, choose **Create an issue**, describe what you were doing, and review the draft before publishing it.

Camera use requires HTTPS or localhost and camera permission. GitHub Pages serves HTTPS. The scanner accepts native Australis console panic text, JSON payloads, and the compact `AUP1` diagnostic format; no OS version is required.

## Local development

Requires Node.js 20.19+ or Node.js 22.12+.

```sh
npm install
npm run dev
```

Open `http://localhost:5173/`.

```sh
npm test       # diagnostic, privacy, issue-link, and search tests
npm run build  # production Vue bundle
npm run preview
```

## GitHub Pages

1. Create a public GitHub repository, e.g. `Australis-Panic-Decoder`.
2. Upload the contents of this folder to the repository root and push to `main`.
3. Open **Settings → Pages → Build and deployment**, and select **GitHub Actions**.
4. The supplied workflow tests, builds, and deploys the app. The resulting URL will be similar to `https://aurora-softwares.github.io/Australis-Panic-Decoder/`.

The workflow automatically sets Vite's base path for repository Pages hosting. The GitHub issue destination is currently configured to **`Aurora-softwares/Australis-OS`**, in `src/lib/issues.js`. Change that single constant if you later move public issues to another repository.

For Cloudflare Pages, choose the Vite preset, build command `npm run build`, output `dist`, and use the default `/` base path.

## Supported panic formats (maintainer notes — not shown to visitors)

Australis currently produces a native console report such as:

```text
*** AUSTRALIS KERNEL PANIC ***
VECTOR  =0x0000000000000006
ERROR   =0x0000000000000000
RIP     =0x0000000000012345
RSP     =0x0000000000023456
```

Recommended short QR payload:

```text
AUP1;v=6;e=0x0;ip=0x12345;sp=0x23456
```

The **AUP1 prefix is a format version**, not an Australis OS release version. Fields `v` (CPU vector), `e` (error code), `ip` (RIP), `sp` (RSP), and optional `a` (CR2, useful for vector 14) are supported. All OS build/version fields are optional. Keep QR generation allocation-free and preserve the serial text fallback on panic.

The parser provides exception-type diagnosis, not provable source-level causation. A matching exception category on GitHub is **not proof** two crashes share a root cause. Accurate symbol matching requires an exact binary/build identifier, which is intentionally not needed or publicly exposed by this app.

## Offline use and verification

After a successful first load, the existing service worker caches the static app assets to allow local decoding without connectivity. Checking GitHub issues necessarily needs the internet; if offline or API-limited, users can still read the local diagnosis and follow the direct GitHub link later. Browser camera behavior and production bundling need validation in a browser/Node environment with dependencies installed.

## Licence

MIT, see `LICENSE`.
