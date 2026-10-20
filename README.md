# Australis Crash Diagnostics

Version 2.5. A small, mobile-friendly Vue 3 application for **public** Australis OS kernel panic diagnosis. It reads a panic QR code or text locally, provides a safe plain-English explanation, and can optionally check public [Australis OS GitHub issues](https://github.com/Aurora-softwares/Australis-OS/issues) for potentially related reports.

## Features

### Priority 2 — optional diagnostics

- Full, searchable x86-64 exception reference for vectors 0–31 (plus Australis' unexpected-vector sentinel).
- Page-fault error-code bit explanations, including present/protection, read/write, supervisor/user and instruction fetch.
- Local deterministic crash fingerprint to compare repeated crashes; the fingerprint does **not** establish identical root causes.
- Boot-stage display when stage metadata is explicitly supplied, or a clearly labelled estimate based on the visitor's answers. AU1 currently has no stage field.
- Opt-in local crash history, off by default, limited to 25 minimal entries, deletable at any time. Crash text and addresses are never stored.
- PWA installation (browser support varies) with a pre-cached app shell for offline QR decoding. GitHub lookups still require internet.
- Maintainer-published known-fix links for curated resolved issues, restricted to the Australis OS GitHub repository.
- Screenshot/serial-log review tool with best-effort text redaction. Visitors must inspect and manually attach data on GitHub; the site never uploads it.


- **Three simple inputs:** scan live QR through the camera, upload a screenshot / PGM file, or paste panic text. A sample report and sample QR are included.
- **Robust report quality checks:** warns when QR contents are unrelated, malformed, unsupported or missing RIP; offers a retry route rather than guessing.
- **Confidence indicators:** separates the reported CPU exception, possible causes, and verified maintainer-curated known issues.
- **Guided recovery:** optional three-question follow-up about startup, application use and recurrence adapts the next steps. No private answers are sent on scan.
- **Privacy-safe `.txt` export:** generates a readable explanation and recovery plan without registers, machine addresses, build IDs or raw panic text. A separate private technical report requires an explicit acknowledgement.
- **Curated known-issue matching:** automatically reads the website's published `known-issues/index.json` for an exact build + exception + instruction offset match; vector/category alone never qualifies. The registry is intentionally empty until maintainers add verified records. Result can be `known`, `investigating`, or `resolved`.
- **Review-before-report:** visitors must check GitHub and review the pre-filled public draft before they can open the new issue link. Their optional questionnaire answers are included as fixed text, and source excerpts remain opt-in.
- **Public-friendly results:** no compiler implementation details, internal paths, instruction addresses, or raw register dumps on the main screen. Raw diagnostics are only available behind the **Technical details (optional)** disclosure, locally in the browser. Public source excerpts are shown only when a valid mapping exists, and must be deliberately expanded.
- **System light/dark mode:** default **Auto** follows the operating system; visitors can choose Light or Dark. Only the appearance preference is saved locally.
- **GitHub issue lookup (explicit opt-in):** tap **Check existing issues** to query GitHub's public API using **only the error category**, e.g. `invalid opcode`. The raw QR, RIP, registers, kernel messages, timestamps, build and any personal details are **not sent** to GitHub. Loading a published source map requests only the mapped static build file on the website. GitHub receives source code in the issue URL only after the user explicitly selects the sharing checkbox and clicks the issue link.
- **Related ≠ identical:** search results are labelled *potentially related*. If the query returns nothing, the UI clearly says a match was not found, rather than asserting that the bug is new.
- **Automatic public source lookup (when a matching kernel map exists):** matches a recorded build fingerprint, runtime code base and RIP to a commit-pinned, published **public** source map. It can display a linked source location and short code excerpt. It **never guesses** source from RIP alone.
- **Optional source in GitHub issue:** users can preview and explicitly select a small, verified public source excerpt for the pre-filled issue. It is never shared by default.
- **Safe issue draft:** if visitors choose to open a report, the GitHub **Create an issue** link pre-fills a descriptive error name, numeric exception vector (when present), and prompts for reproduction steps. It **never** embeds raw diagnostic values, addresses, log contents or personal data; an explicitly approved snippet of already-public kernel source can be added. An OS version is **not required**.
- Runs as a static site; no account, database, private GitHub token, AI service, or server required.

### Privacy considerations

QR decoding and diagnosis happen entirely in the browser. The confirmed AU1 QR fields are decoded locally without sending their values to GitHub. GitHub search is only performed after an explicit click. That search sends the error classification plus standard requests to `api.github.com`; GitHub receives typical connection metadata such as IP address when visited. Creating an issue opens GitHub and requires its usual account/sign-in steps. Users can always skip GitHub and still receive a local explanation. The web app has no telemetry. **Do not add tokens, secret environment values, private file contents or an internal symbol map to a public GitHub Pages repository**: static web assets are publicly readable.

## How visitors use it

1. Look for the diagnostic QR on the Australis crash screen.
2. Open the website on a phone, choose **Camera**, tap **Start scanning**, then point at the QR code. Alternatively **Upload image** or **Paste text**.
3. Read what happened and what to do next. If the crash was unexpected, tap **Check existing issues**.
4. Optionally answer the three short recovery questions and follow the tailored steps. Download a privacy-safe text report if useful.
5. Review a curated known-issue match (if available); otherwise click **Check existing issues** for category-related GitHub reports. Related does not necessarily mean the same bug.
6. If still necessary, expand the GitHub draft preview, explicitly approve any optional public source excerpt, tick the acknowledgement, and then open the GitHub issue draft. Review again on GitHub before submitting.

Camera use requires HTTPS or localhost and camera permission. GitHub Pages serves HTTPS. The scanner recognises native Australis console panic text, JSON payloads, older `AUP1` payloads, and the **new `AU1` QR transport**. The AU1 format has a confirmed field layout and is fully supported for basic CPU exception diagnosis. No OS release version is required. Accurate source code lookup additionally requires a build fingerprint and code-base address.

## Local development

Requires Node.js 20.19+ or Node.js 22.12+.

```sh
npm install
npm run dev
```

Open `http://localhost:5173/`.

```sh
npm test       # AU1/PGM, diagnostics, known issues, privacy and issue-link tests
npm run build  # production Vue bundle
npm run preview
```

## GitHub Pages — Release branch only

1. Create a public GitHub repository, e.g. `Australis-Panic-Decoder`.
2. Put the project files in your **`Development`** branch and create a separate branch named **`Release`** (capital `R`; branch names are case sensitive). The `Release` branch must contain `.github/workflows/pages.yml` and the website files.
3. Open **Settings → Pages → Build and deployment**, and select **GitHub Actions** (NOT “Deploy from a branch”).
4. Merge tested changes from `Development` into `Release` when ready to publish. **Only a push to `Release` can deploy this website**. Pushing to `Development` runs a separate test/build check, but **never publishes**; pull requests targeting `Release` are checked the same way. Manual deployment runs from non-`Release` branches are blocked by an explicit branch check.
5. The resulting URL will be similar to `https://aurora-softwares.github.io/Australis-Panic-Decoder/`.

**Publishing example:**

```bash
git checkout Development
# ... make changes, commit and push ...
git push origin Development
# Development tests run; public website remains unchanged.

# When satisfied, merge your development changes for publication:
git checkout Release
git pull --ff-only origin Release
git merge Development
git push origin Release
# GitHub Actions tests, builds and publishes this revision.
```

If creating `Release` for the first time, create it from the commit that already contains the website and the Pages workflow. In GitHub, keep the **Pages source set to GitHub Actions** and remove/disable any other legacy Pages deployment workflows that still publish from `main` or `Development`. An initial push to `Release` will publish the site once; subsequent `Development` commits are isolated until merged.


The workflow automatically sets Vite's base path for repository Pages hosting. The GitHub issue destination is currently configured to **`Aurora-softwares/Australis-OS`**, in `src/lib/issues.js`. Change that single constant if you later move public issues to another repository.

For Cloudflare Pages, choose the Vite preset, build command `npm run build`, output `dist`, and use the default `/` base path.

## Current kernel QR output — AU1 compatibility

**AU1 is now fully decoded for CPU exception diagnosis.** It is a QR *format* identifier, not an Australis OS version. Its exact field order is confirmed:

```text
AU1:VV:EEEEEEEEEEEEEEEE:IIIIIIIIIIIIIIII:SSSSSSSSSSSSSSSS:AAAAAAAAAAAAAAAA
    │            │                │                │                └─ CR2 (fault address)
    │            │                │                └────────────────── RSP (stack pointer)
    │            │                └─────────────────────────────────── RIP (instruction pointer)
    │            └──────────────────────────────────────────────────── 64-bit CPU error code
    └───────────────────────────────────────────────────────────────── CPU exception vector (hex)
```

`VV` is **exactly two hexadecimal digits**, so `0E` means exception vector **14 decimal**, a page fault. All other fields are exactly **16 hexadecimal digits each**, preserving the full 64-bit register value. A real example's hex words can be longer than JavaScript's safe integer range, so the website retains them without numeric rounding. `CR2` identifies the faulting memory address **only for page faults**; for other exceptions it must not be treated as their fault location.

**Illustrative AU1 sample, not from a real user's device:**

```text
AU1:0E:0000000000000000:0000000000012345:0000000000023456:0000000000000000
```

This identifies page fault `0x0E` (14), CPU error code zero (an unmapped-memory read from supervisor mode), synthetic RIP `0x12345`, synthetic RSP `0x23456`, and fault address `0x0`. A zero fault address is **consistent with** a null pointer or an intentional debug test; the QR alone does **not prove** the root cause. The example is available as `public/sample-au1-crash-qr.png` or `public/sample-au1-crash-qr.pgm`, and via the website's **Try an AU1 example** button.

The original all-zero generator fixture is also supported:

```text
QR payload: AU1:00:0000000000000000:0000000000000000:0000000000000000:0000000000000000
```

When **every numeric value is zero**, it is classified as a *QR generator test*, not a real CPU divide exception. A vector `00` with nonzero crash context is decoded normally as a divide-error exception. Pasting the full smoke-test log works because the parser extracts only the `QR payload:` line, ignoring `Panic entry`, `Scratch page`, `QR result`, dimensions, SHA256 and the local `.pgm` path. Those log values are not included in public GitHub issues. A real AU1 QR immediately receives a normal diagnosis, guided recovery instructions, privacy-safe report export, and optional category-only GitHub lookup. Incomplete and unsupported payloads receive a retry message and cannot generate a misleading issue draft.

The site supports PNG/JPG/WebP uploads and kernel-produced PGM files (8-bit P2 or P5), plus live camera scanning. The example PGM file is padded/enlarged by the scanner in the browser. Every report is processed locally.

**Limitation:** AU1 currently does **not** include a kernel build fingerprint or the runtime executable code base. Therefore, automatic **source-line identification and precise curated known-issue matching** cannot be performed from an AU1 QR alone. The website will *not* guess a source location or claim a confirmed bug match solely from vector 14. Adding `BUILD` and `KBASE` metadata to a future format, or supplying a verified matching map another way, can enable those advanced features without formal OS versioning. Existing full serial reports and older AUP1/JSON inputs remain supported.

## Supported panic formats (maintainer notes — not shown to visitors)

Australis currently produces a native console report such as:

```text
*** AUSTRALIS KERNEL PANIC ***
VECTOR  =0x0000000000000006
ERROR   =0x0000000000000000
RIP     =0x0000000000012345
RSP     =0x0000000000023456
```

Older optional AUP1 payload (still supported for backwards compatibility and source lookup via `b` and `kb` fields):

```text
AUP1;v=6;e=0x0;ip=0x4012345;sp=0x23456;b=abc12345;kb=0x4000000
```

The **AUP1 prefix is a format version**, not an Australis OS release version. Fields `v` (CPU vector), `e` (error code), `ip` (RIP), `sp` (RSP), and optional `a` (CR2, useful for vector 14) are supported. `b` is an immutable build fingerprint (not a release version). `kb` is the **runtime address of the first executable kernel code byte** (not the allocation base or AUKR header). Source resolution requires `ip`, `b`, and either `kb` or a verified fixed-code-base declaration. QR input without these fields still receives a normal exception diagnosis. Keep QR generation allocation-free and preserve the serial text fallback on panic.

The parser provides exception-type diagnosis, not provable source-level causation. A matching exception category on GitHub is **not proof** two crashes share a root cause. Accurate symbol matching requires an exact binary/build fingerprint and executable image base. These are not required for basic diagnosis. Published maps reveal binary offsets, public file names and short snippets; publish **only after reviewing** their visibility implications.

## Curated known issues (maintainers)

The website **already performs automatic local-only matching** against `/known-issues/index.json` on GitHub Pages. No OS release version is required. The default list is empty because there are no verified issues bundled. This is a feature-ready **registry, not an existing database of solved bugs**.

The public issue list and the curated database have different jobs:

- **Automatic verified lookup:** With the optional `b` (build fingerprint), `kb` (executable code start) and `ip` (RIP), the browser calculates a signature. The public JSON must contain **exactly one** manually reviewed record of that signature to display a documented known issue. For vector 14, the low five CPU error-code bits are also included. A matching signature identifies a *repeatable crash site*, not proof of the same underlying cause.
- **Optional broader GitHub search:** The user chooses to search for the generic error category. Open and closed issues are described as *potentially related* only. Closed does not necessarily mean fixed, and finding none does not prove that a crash is new.

To add a **real verified** issue, edit `public/known-issues/index.json` and add a record such as the following *illustrative example* (the values and issue number below must be replaced; do not publish it as a real issue):

```json
{
  "schema": 1,
  "repository": "Aurora-softwares/Australis-OS",
  "issues": [
    {
      "signature": "sig1:abc123456:v6:o1234:e0",
      "issue": 123,
      "status": "investigating",
      "title": "Example crash site — replace this record",
      "summary": "Describe the maintainer-confirmed circumstances.",
      "recovery": "Provide safe, verified steps; don't guess."
    }
  ]
}
```

The `status` field must be one of `known`, `investigating`, or `resolved`; status is curated, **not** inferred from whether GitHub closed an issue. `issue` is a numeric issue number in the **public** Australis OS repository. The app constructs the issue URL itself, so records cannot redirect users to an arbitrary domain. Two identical signatures are rejected rather than guessed between.

For example, `AUP1;v=6;ip=0x40001234;kb=0x40000000;b=abc123456` produces `sig1:abc123456:v6:o1234:e0`. For page faults, `e` includes the lower five error-code bits, so `e=0x0` and `e=0x3` have different signatures. To avoid mislabelling bugs, only add a signature after investigating and linking the actual issue. Never use a vector-only record as a confirmed match.

If the kernel doesn't yet supply build/offset data, **normal diagnosis, guided recovery, safe exports and category-based GitHub search still work**. The lookup will display that an exact match isn't possible yet. No private source maps or user-provided crash contents are uploaded.

## Source-code lookup: how to make it operational

**The website-side lookup and GitHub issue integration are implemented, but no real Australis kernel mapping is bundled. The AU1 field meanings are confirmed, but the format does not currently contain build metadata.** The `public/symbols/index.json` registry initially contains no builds. This is deliberate: a raw RIP value cannot be tied to a source line without a build-specific map. The C-backed Hydrogen `--debug` `.hymap.json` maps are **not** instruction-offset maps for Australis's freestanding `AUKR` binary.

To enable automatic lookup for a kernel build:

1. During kernel compilation, emit **verified instruction ranges** for the exact `KERNEL.BIN`, starting at the first executable code byte (offset zero); associate each range with a public `.hy` file and function/source line. Mark ranges `"precision": "function"` if they identify only the function. Use `"precision": "line"` only for genuine instruction-to-line mapping. This requires an additional kernel compiler/codegen capability if it isn't already available. **Do not fabricate offsets or reuse the host C `.hymap.json`.**
2. Generate a small build fingerprint from the kernel image (e.g. the first 12–16 hex characters of its SHA-256) and embed it in the QR payload as `b=...`. Record the **runtime executable code-start address** in the QR as `kb=0x...`, alongside `ip` (RIP). The build fingerprint isn't an OS release/version string.
3. Make an input map, e.g. `build/kernel-addresses.json` (format below), using the *exact source commit* used to generate the binary. This input map must be emitted or verified by your compiler/tooling, not constructed from guesses:

```json
{
  "schema": 1,
  "build": "abc12345",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "entries": [
    {
      "start": "0x1000", "end": "0x1020",
      "path": "src/kernel/KernelMain.hy", "line": 38,
      "precision": "function", "symbol": "KernelMain.Run"
    }
  ]
}
```

These values are **illustrative**, not a mapping for any existing build. Ranges must not overlap. `start` is inclusive, `end` exclusive. Do not include private files, absolute build paths, or secret-bearing source text.

4. With a local checkout of the publicly visible Australis OS repository, generate the publishable registry and snippets:

```sh
node tools/publish-source-map.mjs \
  --map build/kernel-addresses.json \
  --repo ../Australis-OS \
  --out public/symbols
```

The tool verifies the repository origin, pins source to the provided 40-character Git commit, reads `.hy` source directly from that commit, validates ranges and file paths, includes up to five lines per match, and updates `public/symbols/index.json`. Commit the generated `public/symbols/<build-id>.json` and index to your website repository, then redeploy.

**Public visibility:** GitHub Pages is public. Published maps reveal program offsets, source paths, and snippets; treat them as public debugging symbols. Never publish maps for private components. The website does not access private repositories, and its public source snippets are shown in an issue only after a user opts in.

**Limitation:** Even a matched instruction range proves only where execution stopped in a specific build; it does not prove that source line contains the underlying defect. Userland addresses cannot be resolved with a kernel-only map. A mismatched or missing map returns “source unavailable,” never a guessed code location.

## Offline use and verification

After a successful first load, the existing service worker caches the static app assets to allow local decoding without connectivity. Checking GitHub issues necessarily needs the internet; the curated known-issue JSON is cached with the app after a successful first visit (so its cached state might be stale when offline). If offline or API-limited, users can still read the local diagnosis and follow the direct GitHub link later. Browser camera behavior and production bundling need validation in a browser/Node environment with dependencies installed.

## Licence

MIT, see `LICENSE`.

## Website update notification (v2.5.1)

Every successful `Release` deployment publishes `version.json`, containing the website version and the published commit SHA. The app fetches it **from the network only** on startup, when returning to the tab, when reconnecting, and every 15 minutes while visible. When the build ID differs, visitors see **An update is available** with **Update now** and **Later**. Choosing **Update now** updates the service worker and reloads with a cache-busting URL; if there is an active crash report or pasted text, the website asks for confirmation so it isn't lost accidentally.

The service worker caches only the public website assets and never caches `version.json` or diagnostic inputs. The worker gets a distinct cache ID per build, so new builds update the offline PWA. Checks fail quietly offline and resume when online. No crash data is transmitted to check for updates. The version displayed in the footer is the website version (not an Australis OS version).

**First-time upgrade:** an existing v2.3 (or other older) offline app does not itself contain this update checker. Users must load v2.5.1 or newer once online (or refresh/reinstall that old PWA) to gain automatic update notifications for future releases. Only the `Release` branch deploys; `Development` builds cannot trigger notices until merged and published.
