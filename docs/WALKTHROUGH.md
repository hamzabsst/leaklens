# Understand LeakLens

Start the app and choose **Explore the example**. You should see three issues and 64 bytes definitely lost.

## 1. Understand the bugs before the web app

Open `dist/examples/demo.c` alongside the report.

- `write_past_end` allocates space for three integers. `numbers[3]` writes the fourth integer, outside the allocation. The valid indices are 0, 1, and 2.
- `read_after_free` releases an allocation, then dereferences the same pointer. A pointer variable still holding an address does not mean the memory remains valid.
- `lose_allocation` allocates 64 bytes and returns without freeing them or keeping their address. Memcheck reports the allocation site, which is where ownership began; the actual mistake is failing to release it later.

Click `demo.c:11` in the first issue. The original log opens with the matching frame highlighted. **View complete evidence** also reveals the allocation or free stack when present.

## 2. Follow the data flow

```text
File selection
    → file.text()
    → parseLog(text)
    → report object
    → render summary + issue buttons
    → select an issue
    → render its explanation + stack
    → click a frame
    → highlight original log line
```

`parser.js` understands the log. `app.js` handles the browser. Keeping them separate lets you test the difficult part without running a browser.

## 3. Read the parser in this order

1. **`classify`** matches the beginning of an error or leak record and returns a category. It does not try to diagnose the exact underlying bug.
2. **`parseFrame`** extracts function names, file references, source line numbers, and the original log line.
3. **`getProcess`** keeps state for each PID so interleaved logs do not merge unrelated programs.
4. **`finish`** completes a record and builds a grouping key. The key includes the full primary stack but excludes memory addresses, which change between runs.
5. **`parseLog`** reads lines, detects record boundaries, extracts summary totals, and records warnings about missing evidence.
6. **`leakTotal`** combines known summary values across processes. If a necessary value is missing, it returns `null`, not zero.

An issue group contains multiple original records. A record contains its primary stack and the original line range. Allocation/free/origin stacks remain evidence because they answer a different question from the primary failure stack.

## 4. Understand the counting decision

Valgrind may print a context once even if the program triggers it many times. Therefore:

- **Grouped issues** means unique supported groups identified by LeakLens.
- **Detail records** means supported report entries printed in the file.
- **Valgrind error count** comes from `ERROR SUMMARY`.

These numbers can differ without a parser bug. Similarly, a leak detail record can contain both direct and indirect lost bytes. The dashboard uses the leak summary to avoid double-counting.

## 5. Read the browser code

In `app.js`, start at `readFile`, then follow `openReport`, `renderIssues`, `renderDetail`, and `jumpToLine`. Notice that parsing completes before the current report is replaced: a rejected file leaves the last valid report available.

`node()` builds DOM elements and assigns text through `textContent`. A function name or log message that looks like HTML is displayed as text rather than executed.

## 6. Your first exercise

Fix only the invalid write: change `numbers[3]` to a valid index. Recompile the C example, generate a new log with a different filename, and open it in LeakLens.

Expected result: the invalid-write issue disappears; the invalid-read issue and 64-byte leak remain. Then fix those separately and verify the report after each change.

Before adding features, explain out loud why grouping ignores addresses, why unknown is different from zero, and why a source stack points to evidence rather than an automatic fix. Those are useful decisions to discuss in an interview.
