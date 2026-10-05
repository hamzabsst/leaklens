# v0.1 validation

Checked on 5 October 2026:

- Compiled the intentionally buggy C demo with GCC and generated its report with Valgrind 3.22.0. Observed the expected invalid write, invalid read, and 64-byte definitely lost allocation; ERROR SUMMARY reports 3 errors from 3 contexts.
- All 20 parser tests passed. This includes the real generated fixture and synthetic edge cases.
- Browser file selection loaded `demo.log` and displayed the same counts.
- Clicking a stack frame opened and highlighted the matching original log line.
- Repeated detail records grouped into one issue; choosing record 2 changed its displayed evidence lines.
- A clean report showed zero errors and zero lost bytes. Rejected input preserved the previous report.
- Optional WebMCP tools registered with the expected schemas and annotations. Analysis, read-back, and rejected-input behavior were exercised in a supported browser.
- At 390px and 1280px viewport widths, the page had no horizontal document overflow.
- No browser console errors were observed during the checked flows.

Not claimed: support for every possible Memcheck diagnostic, XML logs, arbitrary very large files, editor integration, or automated fixes. The README documents the supported scope.
