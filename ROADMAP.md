# ROADMAP

## Priority 1 — Essential public diagnostics

These would make the biggest difference to everyday users.

1. QR code scanner with automatic diagnosis Existing
 Scan a panic QR code and immediately display what happened, why Australis stopped, and what the user should do next. No technical knowledge required.
2. Known-issue detection Improve
Compare the crash against published GitHub issues and, later, a small curated database of confirmed problems. Show whether an issue is known, under investigation, or resolved.
Crucially, vector 6 alone should never count as a confirmed match. Two invalid-opcode crashes can have completely different causes.
3. Guided recovery instructions
Give specific advice based on the exception type and available evidence. For example, suggest restarting after an isolated failure, or gathering further diagnostic information if it happens repeatedly.
4. One-click GitHub issue reporting Existing
Generate a short, pre-filled issue containing the exception type and a brief description. Let the user review it before opening GitHub, and prevent accidental duplicates.
5. Diagnostic confidence indicator
   Distinguish between:
    - Confirmed: the CPU exception and observable failure.
    - Possible: likely explanations that require investigation.
    - Known issue: a genuinely matched, documented Australis bug.
  This avoids presenting speculation as a diagnosis.
6. Recovery questionnaire
   After scanning, optionally ask two or three easy questions: Did this happen during startup? Were you launching an application? Is this the first time it has happened? The answers could guide troubleshooting without exposing kernel internals.
7. Export a safe diagnostic report
   Offer a downloadable .txt report containing the user-facing explanation, error category, and troubleshooting steps. A separate, explicitly requested technical export could include additional details.
8. Invalid or incomplete QR detection
Explain when QR data is incomplete, corrupted, or unsupported, and offer camera retry, image upload, or manual text entry rather than producing a misleading diagnosis.

## Priority 2 — Additional debugging tools

These would give the website considerably more diagnostic value without making the home screen complicated.

1. Interactive CPU exception reference — Explain all x86-64 CPU exceptions, including page faults, general-protection faults, invalid opcodes, divide errors, and double faults, using language suitable for beginners.
2. Page-fault decoder — Interpret the error-code bits for vector 14 to explain whether the CPU attempted a read, write, instruction fetch, or access to a protected/unmapped memory page.
3. Crash signature generator — Generate a reproducible identifier from appropriate diagnostic fields, allowing users to compare similar crashes. Build-aware signatures could become more precise as Australis develops.
4. Boot-stage identification — If the QR payload eventually includes a boot-stage indicator, distinguish failures during initialisation, driver loading, filesystem mounting, or application execution.
5. Troubleshooting history — Optionally save previous reports in the browser, allowing users to see whether the same error has happened repeatedly. This should be disabled by default or clearly opt-in, since crash data can be sensitive.
6. Offline installable website (PWA) — Let users install the decoder on a phone and perform basic diagnosis without internet access. This is particularly useful when the affected computer cannot boot.
7. Known-fix information — When a confirmed GitHub issue has been resolved, show whether a fix exists and link to the issue, relevant release, or verified recovery instructions.
8. Guided report attachments — Offer instructions for including a screenshot or serial log in a GitHub issue, with a privacy warning and a redacted preview before sharing anything.

## Priority 3 — Advanced developer diagnostics

These should sit behind an Advanced diagnostics section rather than appearing to everybody.

1. Register inspector — Explain RIP, RSP, RFLAGS, CR2, CS and the other relevant registers. Highlight which registers actually matter for the detected exception.
2. Source-code location lookup — Given a kernel build identifier and a matching symbol map, identify which function contained the faulting instruction. This could become extremely valuable as the kernel and Hydrogen compiler mature.
3. Crash comparison tool — Allow developers to compare two panic reports, highlighting differences in the exception, instruction address, error code and relevant CPU state.
4. Disassembly helper — Generate appropriate GDB or QEMU commands for examining the failing instruction, with a clear explanation that additional access to the crashed machine or matching binary is needed.
5. Raw diagnostic decoder — Accept structured panic payloads, COM1 serial output, or manually pasted reports, with validation of numeric fields and recognised register names.
6. Multiple QR-code support — If a future crash contains more data than one QR code can hold, support scanning several numbered QR codes and safely reconstructing one diagnostic report.
7. Machine-readable export — Export a versioned JSON report for use with automated tests, kernel regression tooling, or future debugging applications.
8. Build-aware diagnosis — Eventually, associate reports with a build fingerprint or commit identifier. You don't need formal OS versioning yet; even a short build identifier could help distinguish changes to the kernel binary.
