# Australis Panic Decoder

A mobile-friendly, entirely client-side **Vue 3 + Vite** web app for decoding **Australis OS** kernel panic QR codes and serial panic reports into understandable explanations. Deployable to **GitHub Pages** without a server or API key.

## Features

- Scan QR codes with a front/rear camera (`getUserMedia`, permission requested only on tap).
- Decode QR screenshots/images via drag-and-drop or local file picker (`jsQR`).
- Paste a native Australis panic report, compact AUP1 QR payload or JSON object.
- Explain x86-64 exception vectors, including #PF (vector 14), #GP (vector 13), #UD (vector 6) and #DF (vector 8).
- Decode page fault error-code bits and fault address `CR2`.
- Explain possible causes and recommended checks **without pretending to know the exact culprit**.
- See registers, the original raw report, copy a diagnosis, or export a `.txt` file.
- Private: no analytics, accounts, telemetry, uploads, remote API calls, or server-side processing.
- Offline-capable after visiting once and caching the app. The layout still works with local system fonts when offline.

## Start locally

Node.js 20.19+ or 22.12+ recommended.

```bash
npm install
npm run dev
```

Visit <http://localhost:5173>. Click **Try a sample kernel panic** to test the parser without a QR code. You can also open `public/sample-panic-qr.png` on a second screen to test the camera, or upload it directly to test image decoding.

```bash
npm test
npm run build
npm run preview
```

`npm test` runs Node's built-in test runner, with no test runner package required.

## GitHub Pages deployment (recommended)

1. Create a GitHub repository, for example **`Australis-Panic-Decoder`**.
2. Put **the contents of this project folder** at the repository root.
3. Push them to `main`. For a new local directory after creating the empty GitHub repository:

   ```bash
   git init
   git add .
   git commit -m "Initial Australis Panic Decoder"
   git branch -M main
   git remote add origin https://github.com/<OWNER>/<REPO>.git
   git push -u origin main
   ```
4. Under **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
5. Open **Actions** and run **Deploy GitHub Pages** if it does not run automatically.
6. The published address will normally be `https://<YOUR-USERNAME>.github.io/Australis-Panic-Decoder/` (or the GitHub organisation's domain, if hosted there).

The workflow detects the repository name and sets Vite's `base` option automatically. For a special repository named `<owner>.github.io`, it sets `/` rather than `/repo/`.

To build manually for a project page:

```bash
GITHUB_PAGES_BASE=/Australis-Panic-Decoder/ npm run build
```

For **Cloudflare Pages**: connect the repository, choose Vite, build command `npm run build`, output directory `dist`, and no `GITHUB_PAGES_BASE` variable (or set it to `/`).

### HTTPS and camera permissions

Browsers allow camera access on secure HTTPS pages or `localhost`. GitHub Pages uses HTTPS. The user must still grant camera access. If a camera fails, uploading a photo or pasting text works without camera permissions. To scan a QR code displayed by a different device, point the scanning device's camera at the panic screen.

## What actually works with Australis today?

The `Development` branch of `Aurora-softwares/Australis-OS` has a `tests/kernel/panic_boot_smoke.py` that verifies serial and framebuffer panic reports. It checks the exact banner **`*** AUSTRALIS KERNEL PANIC ***`** and fields named `VECTOR`, `ERROR`, `RIP`, `RFLAGS`, `RSP` and CPU registers. The existing kernel contract documents `CR2` for page faults.

For example:

```text
*** AUSTRALIS KERNEL PANIC ***
Fatal CPU exception; interrupts are disabled.
VECTOR  =0x000000000000000E
ERROR   =0x0000000000000000
RIP     =0x00000000001041F2
RSP     =0x00000000003FEEB0
CR2     =0x0000000000000000
RAX     =0x0000000000000000
System halted. Power cycle or reset to continue.
```

**Important:** The repo evidence confirms the native panic **text**, but does **not** confirm that the kernel currently displays QR codes. That is a separate kernel feature to add. This web app is ready for a QR carrying the compact payload described below, or the plain text above if it fits in the QR. Never add QR generation that depends on heap allocations or normal userland services to the fatal exception path.

## Proposed QR payload contract: `AUP1`

The **suggested** format for future kernel QR rendering is a short UTF-8 string:

```text
AUP1;v=14;e=0x0;ip=0x1041F2;sp=0x3FEEB0;a=0x0
```

- Prefix: `AUP1` (Australis Panic payload, version 1).
- `v`: CPU exception vector (decimal, e.g. `14`).
- `e`: CPU error code (hex or decimal).
- `ip`: RIP — faulting instruction pointer (hex preferred).
- `sp`: RSP — stack pointer (hex preferred).
- `a`: CR2 — faulting address for **page faults only**.
- Optional `m`: short message (percent-encode `;`, `|`, `%` and other non-alphanumeric characters).
- Optional `pid`, `process`, `build`, `version`, `time`, and named registers such as `rax` and `r15`.

Use `;` between key-value pairs, and `=` between keys and values. Keep numeric addresses as unsigned hexadecimal strings. Do not use `a` to imply a faulting address for #GP: CR2 is not a #GP cause indicator. For panic reporting, prefer essential fields (`v`, `e`, `ip`, `sp`, and for #PF `a`) to keep the QR small, readable and robust.

This versioning is a **proposal for kernel integration**, not a claim that the kernel already emits `AUP1`. The parser also accepts native plain text and JSON:

```json
{
  "schema": "AUP1",
  "vector": 14,
  "error": "0x2",
  "registers": { "rip": "0x1041F2", "rsp": "0x3FEEB0", "cr2": "0x0" },
  "message": "page access denied"
}
```

### Suggested kernel integration approach

1. Preserve the existing allocation-free serial/framebuffer panic path first.
2. Capture the fixed-size CPU frame and build a bounded ASCII `AUP1` string using static storage; no heap allocations, VFS access, locks, or interrupts.
3. Render a QR code into the **already mapped** GOP framebuffer with a QR encoder usable without dynamic allocation. Avoid allocating from the kernel heap in a panic path. Ensure pixels/modules are at least ~4–6 screen pixels wide and show a white quiet zone of 4 modules.
4. Keep the plain text report and COM1 output readable if QR generation fails. A QR code is an optional recovery aid, not a substitute for the serial log.
5. Add QEMU screenshot tests that decode the rendered QR and compare the payload against the retained saved exception frame.

An accurate **source-line diagnosis** requires matching RIP to the correct kernel binary and symbols/map file. The current decoder offers architectural interpretation; it does not pretend to symbolicate addresses. A later upgrade could accept a local symbol map and match it to `build` (without any server).

### Security & privacy

Everything runs in the browser. QR codes are treated as **data only**; the app does not follow URLs contained in QR codes. Raw payload text is rendered through Vue's escaped bindings, not injected as HTML. Files are decoded in-memory and not uploaded. No payloads are stored in localStorage; the service worker caches the app's same-origin assets, not submissions. The optional downloadable text report is saved only to your device.

### Limitations

- The root cause of a kernel panic cannot be proven from a vector alone. The app identifies the CPU exception and suggests where to look.
- Camera support varies by device/browser; use upload or paste as fallback.
- Very dense QR codes may be difficult for cameras to scan. Prefer AUP1 over a full register dump.
- The app needs an internet connection to fetch its code on the first visit. Service-worker asset caching makes later visits usable offline after the required files have been cached.
- This initial source package has automated parser tests. Test camera behaviour, browser building, and GitHub Pages deployment in the target environment.

## Source references

- [Australis OS Development panic smoke test](https://github.com/Aurora-softwares/Australis-OS/blob/Development/tests/kernel/panic_boot_smoke.py)
- [Australis kernel reliability contract](https://github.com/Aurora-softwares/Australis-OS/blob/Development/docs/kernel-reliability.md)

## Licence

MIT (see `LICENSE`).
