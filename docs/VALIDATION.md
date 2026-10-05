# Validation

## v0.3 Geist and run comparison

Checked on 5 October 2026:

- 20 parser tests and 13 signature/diff tests passed. Static build validation passed (JavaScript syntax, imports, asset references, and font file signatures).
- Geist and Geist Mono 400/500/600 loaded successfully; UI arrow, minus, degree sign, accents, braces, and numeric glyphs were checked. Fonts are same-origin WOFF2 assets with preloads and optional loading; fallback metrics were calculated from the fonts.
- Temporary local font diagnostics measured CLS 0 on cached and fresh-font requests. Those diagnostics were removed before publishing. This is evidence for the checked browser, not a guarantee for every device/network condition.
- Example comparison: 2 Fixed, 1 New, 1 Still leaking; definitely lost 64 B → 32 B (−32 B), and printed invalid read/write records 2 → 1 (−1).
- Selected second-file analysis produced the same diff and preserved the before report. Non-Valgrind text, files over 5 MiB, and files over 20,000 lines showed friendly errors without discarding the report or previous comparison.
- Keyboard expansion displayed both stacks. Clear comparison restored the normal before report and moved focus to the comparison input.
- Normal Open a log / Open another log and Or explore the example flows remained working.
- 320px and 390px comparison layouts and expanded stacks showed no horizontal overflow; the narrow hero title was checked for clipping. Temporary viewport settings were reset.
- No application console errors were observed (an unrelated installed browser extension reported an error during a later check). Local request inspection showed only same-origin static assets/example fetches; selecting user log files caused no network request.


## Wider layout and system typography

Checked on 5 October 2026:

- Desktop canvas widened from 1220px to 1440px.
- Apple-first system font stack applied to the interface and summary numbers.
- Title placed in its own row above the image; its bottom edge is above the image top at desktop and 390px mobile sizes.
- Neither checked viewport had horizontal document overflow. The title decoration was removed to keep the mobile heading on one line.

## v0.2 design update

Checked on 5 October 2026:

- All 20 parser tests passed after the interface redesign; application JavaScript passed its syntax check.
- The example loads on arrival with 3 grouped issues and 64 bytes definitely lost.
- Browser file selection loaded the real `demo.log` through the new upload control and displayed the local-file confirmation.
- Selecting the invalid read and clicking its primary stack frame opened the original evidence and highlighted log line 16.
- Desktop and 390px mobile layouts were visually checked without horizontal document overflow. The temporary browser viewport was restored afterward.
- No browser console errors were observed during the checked flows.
- The updated interface is pictured in `preview.jpg`; artwork provenance is documented in `DESIGN.md`.

## v0.1

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
