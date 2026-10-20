# Australis Crash Diagnostics

Version 2.2. A small, mobile-friendly Vue 3 application for **public** Australis OS kernel panic diagnosis. It reads a panic QR code or text locally, provides a safe plain-English explanation, and can optionally check public [Australis OS GitHub issues](https://github.com/Aurora-softwares/Australis-OS/issues) for potentially related reports.

## Features

- **Three simple inputs:** scan live QR through the camera, upload a screenshot, or paste panic text. A sample report and sample QR are included.
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

QR decoding and diagnosis happen entirely in the browser. GitHub search is only performed after an explicit click. That search sends the error classification plus standard requests to `api.github.com`; GitHub receives typical connection metadata such as IP address when visited. Creating an issue opens GitHub and requires its usual account/sign-in steps. Users can always skip GitHub and still receive a local explanation. The web app has no telemetry. **Do not add tokens, secret environment values, private file contents or an internal symbol map to a public GitHub Pages repository**: static web assets are publicly readable.

## How visitors use it

1. Look for the diagnostic QR on the Australis crash screen.
2. Open the website on a phone, choose **Camera**, tap **Start scanning**, then point at the QR code. Alternatively **Upload image** or **Paste text**.
3. Read what happened and what to do next. If the crash was unexpected, tap **Check existing issues**.
4. Optionally answer the three short recovery questions and follow the tailored steps. Download a privacy-safe text report if useful.
5. Review a curated known-issue match (if available); otherwise click **Check existing issues** for category-related GitHub reports. Related does not necessarily mean the same bug.
6. If still necessary, expand the GitHub draft preview, explicitly approve any optional public source excerpt, tick the acknowledgement, and then open the GitHub issue draft. Review again on GitHub before submitting.

Camera use requires HTTPS or localhost and camera permission. GitHub Pages serves HTTPS. The scanner accepts native Australis console panic text, JSON payloads, and the compact `AUP1` diagnostic format; no OS release version is required. Accurate source code lookup additionally requires a build fingerprint and code-base address.

## Local development

Requires Node.js 20.19+ or Node.js 22.12+.

```sh
npm install
npm run dev
```

Open `http://localhost:5173/`.

```sh
npm test       # diagnostics, known issues, privacy, recovery and issue-link tests
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

Recommended short QR payload (source lookup also uses optional `b` and `kb` fields):

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

**The website-side lookup and GitHub issue integration are implemented, but no real Australis kernel mapping is bundled.** The `public/symbols/index.json` registry initially contains no builds. This is deliberate: a raw RIP value cannot be tied to a source line without a build-specific map. The C-backed Hydrogen `--debug` `.hymap.json` maps are **not** instruction-offset maps for Australis's freestanding `AUKR` binary.

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
