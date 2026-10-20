# ROADMAP

## Version 2 - Understand the crash

Decode kernel panics, explain them to users, offer recovery advice, and help report problems.

| | Priority | Feature | Description |
| --- | --- | --- | --- |
| 🟢 | Essential | **QR code scanner with automatic diagnosis Existing** | Scan a panic QR code and immediately display what happened, why Australis stopped, and what the user should do next. No technical knowledge required. |
| 🟢 | Essential | **Known-issue detection Improve** | Compare the crash against published GitHub issues and, later, a small curated database of confirmed problems. Show whether an issue is known, under investigation, or resolved. |
| 🟢 | Essential | **Guided recovery instructions** | Give specific advice based on the exception type and available evidence. For example, suggest restarting after an isolated failure, or gathering further diagnostic information if it happens repeatedly. |
| 🟢 | Essential | **One-click GitHub issue reporting Existing** | Generate a short, pre-filled issue containing the exception type and a brief description. Let the user review it before opening GitHub, and prevent accidental duplicates. |
| 🟢 | Essential | **Diagnostic confidence indicator** | Distinguish between Confirmed (the CPU exception and observable failure), Possible (likely explanations that require investigation) and Known issues (a genuinely matched, documented Australis bug). This avoids presenting speculation as a diagnosis. |
| 🟢 | Essential | **Recovery questionnaire** | After scanning, optionally ask two or three easy questions: Did this happen during startup? Were you launching an application? Is this the first time it has happened? The answers could guide troubleshooting without exposing kernel internals. |
| 🟢 | Essential | **Export a safe diagnostic report** | Offer a downloadable .txt report containing the user-facing explanation, error category, and troubleshooting steps. A separate, explicitly requested technical export could include additional details. |
| 🟢 | Essential | **Invalid or incomplete QR detection** | Explain when QR data is incomplete, corrupted, or unsupported, and offer camera retry, image upload, or manual text entry rather than producing a misleading diagnosis. |
| 🟢 | Important | **Interactive CPU exception reference** | Explain all x86-64 CPU exceptions, including page faults, general-protection faults, invalid opcodes, divide errors, and double faults, using language suitable for beginners. |
| 🟢 | Important | **Page-fault decoder** | Interpret the error-code bits for vector 14 to explain whether the CPU attempted a read, write, instruction fetch, or access to a protected/unmapped memory page. |
| 🟢 | Important | **Crash signature generator** | Generate a reproducible identifier from appropriate diagnostic fields, allowing users to compare similar crashes. Build-aware signatures could become more precise as Australis develops. |
| 🟡 | Important | **Boot-stage identification** | If the QR payload eventually includes a boot-stage indicator, distinguish failures during initialisation, driver loading, filesystem mounting, or application execution. |
| 🟢 | Important | **Troubleshooting history** | Optionally save previous reports in the browser, allowing users to see whether the same error has happened repeatedly. This should be disabled by default or clearly opt-in, since crash data can be sensitive. |
| 🟢 | Important | **Offline installable website (PWA)** | Let users install the decoder on a phone and perform basic diagnosis without internet access. This is particularly useful when the affected computer cannot boot. |
| 🟡 | Important | **Known-fix information** | When a confirmed GitHub issue has been resolved, show whether a fix exists and link to the issue, relevant release, or verified recovery instructions. |
| 🟢 | Important | **Guided report attachments** | Offer instructions for including a screenshot or serial log in a GitHub issue, with a privacy warning and a redacted preview before sharing anything. |
| 🟢 | Optional | **Register inspector** | Explain RIP, RSP, RFLAGS, CR2, CS and the other relevant registers. Highlight which registers actually matter for the detected exception. |
| 🟡 | Optional | **Source-code location lookup** | Given a kernel build identifier and a matching symbol map, identify which function contained the faulting instruction. This could become extremely valuable as the kernel and Hydrogen compiler mature. |
| 🔴 | Optional | **Crash comparison tool** | Allow developers to compare two panic reports, highlighting differences in the exception, instruction address, error code and relevant CPU state. |
| 🟢 | Optional | **Disassembly helper** | Generate appropriate GDB or QEMU commands for examining the failing instruction, with a clear explanation that additional access to the crashed machine or matching binary is needed. |
| 🟢 | Optional | **Raw diagnostic decoder** | Accept structured panic payloads, COM1 serial output, or manually pasted reports, with validation of numeric fields and recognised register names. |
| 🔴 | Optional | **Multiple QR-code support** | If a future crash contains more data than one QR code can hold, support scanning several numbered QR codes and safely reconstructing one diagnostic report. |
| 🟢 | Optional | **Machine-readable export** | Export a versioned JSON report for use with automated tests, kernel regression tooling, or future debugging applications. |
| 🟡 | Optional | **Build-aware diagnosis** | Eventually, associate reports with a build fingerprint or commit identifier. You don't need formal OS versioning yet; even a short build identifier could help distinguish changes to the kernel binary. |

## Version 3 - Investigate the crash

Identify the actual source code, correlate crashes with known defects, and determine whether fixes are available.

| | Priority | Feature | Description |
| --- | --- | --- | --- |
| 🔴 | Essential | **Real source-code identification** | Identify the actual Hydrogen function and source line responsible for a crash. |
| 🔴 | Essential | **Kernel build identification** | Identify exactly which compiled kernel generated the crash without introducing formal OS versions. |
| 🔴 | Essential | **Intelligent known-issue matching** | Match crashes using verified signatures, source locations and build information. |
| 🔴 | Essential | **Automated fix detection** | Identify whether a verified fix exists in a newer kernel build. |
| 🔴 | Essential | **Extended QR diagnostics** | Introduce an optional AU2 format while retaining support for AU1. |
| 🔴 | Essential | **Diagnostic integrity verification** | When someone scans a QR code, the website should be able to establish whether the information is complete and internally consistent. |
| 🔴 | Important | **Crash context analysis** | Identify whether a crash happened during boot, driver initialisation, application execution or shutdown. |
| 🔴 | Important | **Developer investigation mode** | Provide more advanced register analysis, source-code inspection and debugging commands. |
| 🔴 | Important | **Crash correlation** | Compare multiple reports to identify recurring failures and likely related bugs. |
| 🔴 | Important | **Diagnostic reliability testing** | Automatically verify that the kernel's generated QR codes decode correctly in the website. |
| 🔴 | Optional | **Multi-QR crash reports** | Support additional diagnostic information that cannot fit inside a single QR code. |
| 🔴 | Optional | **Automated regression test suggestions** | Suggest a reproducible test for a confirmed failure based on its type and available context. |
| 🔴 | Optional | **Public diagnostics knowledge base** | Document confirmed crashes, affected builds, explanations and solutions. |

## Version 4 - Diagnose the entire operating system

Expand beyond fatal kernel panics to investigate applications, drivers, services, and system reliability.

| | Priority | Feature | Description |
| --- | --- | --- | --- |
| 🔴 | Essential | **Application crash diagnostics** | Diagnose failures in ordinary Australis applications without treating them as fatal kernel panics. |
| 🔴 | Essential | **Service failure diagnostics** | Identify crashes involving system services, including the display server, compositor, and background processes. |
| 🔴 | Essential | **Driver failure diagnostics** | Interpret errors from storage, USB, graphics, and other supported hardware drivers. |
| 🔴 | Essential | **Unified diagnostic format** | Introduce a versioned diagnostic format capable of identifying kernel, application, service, and driver failures. |
| 🔴 | Essential | **Component identification** | Identify the executable, service, driver, or kernel subsystem associated with a failure. |
| 🔴 | Essential | **Process-aware crash reports** | Include appropriate process IDs, process names, fault classifications, and execution context. |
| 🔴 | Essential | **System-wide source mapping** | Extend Hydrogen source-code identification beyond the kernel to applications, drivers, and services. |
| 🔴 | Essential | **Failure isolation reporting** | Explain whether a failure was contained within one process or affected the entire operating system. |
| 🔴 | Important | **Stack-trace analysis** | Decode validated stack traces to identify the chain of function calls leading to a failure. |
| 🔴 | Important | **Hardware diagnostic information** | Interpret relevant CPU, memory, storage, and device-error information supplied by Australis. |
| 🔴 | Important | **System event timeline** | Display recorded events leading up to a failure when trustworthy event information is available. |
| 🔴 | Important | **Recurring failure detection** | Identify repeated failures affecting the same component and distinguish correlated crashes from unrelated incidents. |
| 🔴 | Important | **System health reporting** | Analyse available diagnostic records for recurring stability problems without requiring continuous telemetry. |
| 🔴 | Important | **Diagnostic bundle import** | Import structured diagnostic bundles containing logs, crash records, build identifiers, and permitted system information. |
| 🔴 | Important | **Advanced privacy controls** | Automatically redact sensitive information from logs and reports before they are exported or submitted. |
| 🔴 | Important | **Recovery procedure library** | Provide verified recovery procedures for known application, service, driver, and kernel failures. |
| 🔴 | Optional | **Performance diagnostics** | Interpret performance reports, memory-pressure events, and resource-exhaustion warnings. |
| 🔴 | Optional | **System hang diagnostics** | Analyse watchdog reports and available state from systems that became unresponsive without generating a conventional panic. |
| 🔴 | Optional | **Crash trend visualisation** | Display locally stored crash frequency, affected components, and recurring diagnostic signatures. |
| 🔴 | Optional | **Developer diagnostic API** | Provide a documented, versioned format for external tools to produce and consume Australis diagnostic reports. |
| 🔴 | Optional | **Automated regression recommendations** | Recommend tests based on confirmed defects and previously resolved incidents. |