/** Pure parser: no DOM, file access, network, or code execution. */
const number = (value) => Number(value.replaceAll(',', ''));
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const PREFIX = /^\s*(?:==|--)(\d+)(?:==|--)\s?/;
const CATEGORIES = ['definite', 'indirect', 'possible', 'reachable', 'suppressed'];

export const ISSUE_INFO = {
  'invalid-read': { label: 'Invalid read', severity: 'error', explanation: 'The program read memory that was not valid to access.', suggestion: 'Check array bounds, pointer lifetime, and the size of the allocation.' },
  'invalid-write': { label: 'Invalid write', severity: 'error', explanation: 'The program wrote outside valid memory.', suggestion: 'Check the index and allocation size before writing. Fix this before debugging later errors.' },
  'uninitialized': { label: 'Uninitialized value', severity: 'warning', explanation: 'A decision or operation depends on a value that has not been initialized.', suggestion: 'Initialize the value before its first use. --track-origins=yes can reveal where it came from.' },
  'invalid-free': { label: 'Invalid free', severity: 'error', explanation: 'Memory was freed incorrectly, possibly twice or through an invalid pointer.', suggestion: 'Follow the allocation and free paths. Each allocation should have one matching release.' },
  'mismatched-free': { label: 'Mismatched release', severity: 'error', explanation: 'The allocation and release methods do not match.', suggestion: 'Pair malloc with free, new with delete, and new[] with delete[].' },
  'overlap': { label: 'Overlapping buffers', severity: 'error', explanation: 'Source and destination overlap in an operation that does not support it.', suggestion: 'Check the ranges. Use memmove when overlapping copies are intentional.' },
  'syscall': { label: 'System-call parameter', severity: 'error', explanation: 'A system call received uninitialized or invalid memory.', suggestion: 'Check the buffer, its length, and initialization before the call.' },
  'fishy': { label: 'Suspicious allocation', severity: 'warning', explanation: 'An allocation received a suspicious size, such as a negative value converted to unsigned.', suggestion: 'Check size calculations, signed conversions, and integer overflow.' },
  'definite': { label: 'Definitely lost', severity: 'error', explanation: 'No pointer to this allocation remains. The program cannot free it.', suggestion: 'Keep ownership clear and release the allocation before losing its last pointer.' },
  'indirect': { label: 'Indirectly lost', severity: 'warning', explanation: 'This allocation was only reachable through another lost allocation.', suggestion: 'Fix the parent allocation first, then release its owned allocations.' },
  'possible': { label: 'Possibly lost', severity: 'warning', explanation: 'Only an interior pointer may remain. This could be a leak or an intentional pointer layout.', suggestion: 'Inspect ownership and interior-pointer use before deciding this is a leak.' },
  'reachable': { label: 'Still reachable', severity: 'info', explanation: 'A pointer to this allocation still exists at exit. This is not necessarily a leak.', suggestion: 'Check whether it is an intentional cache or an allocation that should be cleaned up.' },
};

function classify(text) {
  const access = text.match(/^Invalid (read|write) of size (\d+)/);
  if (access) return { kind: `invalid-${access[1]}`, accessSize: Number(access[2]) };
  if (/^(Conditional jump or move depends on uninitialised value|Use of uninitialised value)/i.test(text)) return { kind: 'uninitialized' };
  if (/^Invalid free\(/.test(text)) return { kind: 'invalid-free' };
  if (/^Mismatched free\(/.test(text)) return { kind: 'mismatched-free' };
  if (/^Source and destination overlap/.test(text)) return { kind: 'overlap' };
  if (/^Syscall param .* (uninitialised|unaddressable)/.test(text)) return { kind: 'syscall' };
  if (/^Argument .*fishy/.test(text)) return { kind: 'fishy' };
  const leak = text.match(/^([\d,]+)(?: \(([\d,]+) direct, ([\d,]+) indirect\))? bytes in ([\d,]+) blocks? are (definitely lost|indirectly lost|possibly lost|still reachable) in loss record/);
  if (leak) {
    const kind = { 'definitely lost': 'definite', 'indirectly lost': 'indirect', 'possibly lost': 'possible', 'still reachable': 'reachable' }[leak[5]];
    return { kind, bytes: number(leak[1]), directBytes: leak[2] ? number(leak[2]) : null, indirectBytes: leak[3] ? number(leak[3]) : null, blocks: number(leak[4]) };
  }
  return null;
}

function parseFrame(text, line) {
  const match = text.match(/^\s*(at|by)\s+(0x[\da-f]+):\s+(.+)$/i);
  if (!match) return null;
  const description = match[3];
  const location = description.match(/\s+\((.+?):(\d+)(?::(\d+))?\)$/);
  return {
    function: location ? description.slice(0, location.index) : description.replace(/\s+\((?:in|below main).*\)$/, ''),
    file: location ? location[1] : null,
    sourceLine: location ? Number(location[2]) : null,
    address: match[2], description, logLine: line,
  };
}

export function parseLog(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Choose a non-empty Valgrind Memcheck text log.');
  if (/^\s*(?:<\?xml|<valgrindoutput)/.test(input)) throw new Error('XML logs are not supported yet. Export a plain-text Memcheck log.');
  const lines = input.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  if (lines.length > 20000) throw new Error('This log has more than 20,000 lines. Split it into smaller reports.');
  const processes = new Map();
  let recognized = false;
  const warnings = [];
  function getProcess(pid) {
    if (!processes.has(pid)) processes.set(pid, { pid, command: null, groups: [], leaks: Object.fromEntries(CATEGORIES.map(k => [k, null])), errors: null, contexts: null, heap: null, current: null, index: new Map(), headerCount: 0 });
    return processes.get(pid);
  }
  function finish(process) {
    const record = process.current;
    if (!record) return;
    // Match full primary stacks, never raw addresses or loss-record numbers.
    // Keep processes separate and preserve allocation/origin stacks as evidence.
    const normalizedTitle = record.title.replace(/0x[\da-f]+/gi, '<address>').replace(/in loss record.*$/, '');
    const key = JSON.stringify([record.kind, record.accessSize, record.frames.length ? record.frames.map(f => [f.function, f.file, f.sourceLine]) : normalizedTitle]);
    const existing = process.index.get(key);
    if (existing) { existing.records.push(record); existing.recordCount++; }
    else {
      const group = { id: `issue-${processes.size}-${process.groups.length + 1}-${record.logLine}`, kind: record.kind, title: record.title, frames: record.frames, records: [record], recordCount: 1, pid: process.pid };
      process.index.set(key, group); process.groups.push(group);
    }
    process.current = null;
  }
  lines.forEach((raw, index) => {
    const stripped = raw.replace(ANSI, '');
    const prefix = stripped.match(PREFIX);
    if (!prefix) return;
    const process = getProcess(prefix[1]);
    const text = stripped.slice(prefix[0].length);
    const trimmed = text.trim();
    const line = index + 1;
    if (/Memcheck, a memory error detector/.test(trimmed)) { recognized = true; process.headerCount++; }
    if (trimmed.startsWith('Command:')) process.command = trimmed.slice(8).trim();
    const issue = classify(trimmed);
    if (issue) {
      recognized = true; finish(process);
      process.current = { ...issue, title: trimmed, logLine: line, endLine: line, frames: [], evidenceFrames: [], primaryStack: true };
      return;
    }
    if (/^(HEAP SUMMARY:|LEAK SUMMARY:|ERROR SUMMARY:|All heap blocks were freed)/.test(trimmed)) { recognized = true; finish(process); }
    const error = trimmed.match(/^ERROR SUMMARY: ([\d,]+) errors? from ([\d,]+) contexts?/);
    if (error) { process.errors = number(error[1]); process.contexts = number(error[2]); }
    const heap = trimmed.match(/^in use at exit: ([\d,]+) bytes in ([\d,]+) blocks?/);
    if (heap) process.heap = { bytes: number(heap[1]), blocks: number(heap[2]) };
    const summary = trimmed.match(/^(definitely lost|indirectly lost|possibly lost|still reachable|suppressed): ([\d,]+) bytes in ([\d,]+) blocks?/);
    if (summary) {
      const kind = { 'definitely lost': 'definite', 'indirectly lost': 'indirect', 'possibly lost': 'possible', 'still reachable': 'reachable', suppressed: 'suppressed' }[summary[1]];
      process.leaks[kind] = { bytes: number(summary[2]), blocks: number(summary[3]) };
    }
    if (/^All heap blocks were freed -- no leaks are possible/.test(trimmed)) for (const kind of CATEGORIES) process.leaks[kind] = { bytes: 0, blocks: 0 };
    if (process.current) {
      const frame = parseFrame(text, line);
      if (frame) {
        (process.current.primaryStack ? process.current.frames : process.current.evidenceFrames).push(frame);
      } else if (trimmed) process.current.primaryStack = false;
      if (trimmed) process.current.endLine = line;
    }
  });
  for (const process of processes.values()) finish(process);
  if (!recognized) throw new Error('No supported Memcheck report found. Use a plain-text Valgrind log with ==process== prefixes.');
  const relevant = [...processes.values()].filter(p => p.groups.length || p.errors !== null || p.headerCount || p.heap || Object.values(p.leaks).some(v => v !== null));
  for (const process of relevant) {
    if (process.errors === null) warnings.push(`Process ${process.pid}: ERROR SUMMARY is missing; the log may be incomplete.`);
    if (process.headerCount > 1) warnings.push(`Process ${process.pid}: multiple runs found. Split each run into a separate file for accurate summaries.`);
    if (!process.groups.length && process.errors > 0) warnings.push(`Process ${process.pid}: errors are reported but no supported detail records were found.`);
    if (Object.values(process.leaks).some(v => v === null)) warnings.push(`Process ${process.pid}: the leak summary is incomplete. Missing values are shown as unknown.`);
    delete process.current; delete process.index;
  }
  const groups = relevant.flatMap(p => p.groups);
  return { processes: relevant, groups, warnings, lines, recordCount: groups.reduce((sum, g) => sum + g.recordCount, 0), errorCount: relevant.every(p => p.errors !== null && p.headerCount <= 1) ? relevant.reduce((sum, p) => sum + p.errors, 0) : null };
}

export function leakTotal(report, kind) {
  if (!report.processes.length || report.processes.some(p => p.leaks[kind] === null || p.headerCount > 1)) return null;
  return report.processes.reduce((sum, p) => sum + p.leaks[kind].bytes, 0);
}
