import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLog, leakTotal } from '../dist/js/parser.js';

const log = (lines, pid = '42') => lines.map(line => `==${pid}== ${line}`).join('\n');
const header = ['Memcheck, a memory error detector', 'Command: ./app'];
const stack = ['   at 0xAAA: read_value (src/main.c:12)', '   by 0xBBB: main (src/main.c:30)'];
const summary = ['LEAK SUMMARY:', '   definitely lost: 64 bytes in 1 blocks', '   indirectly lost: 0 bytes in 0 blocks', '     possibly lost: 0 bytes in 0 blocks', '   still reachable: 128 bytes in 2 blocks', '        suppressed: 0 bytes in 0 blocks', 'ERROR SUMMARY: 9 errors from 2 contexts (suppressed: 0 from 0)'];

test('groups repeats by complete primary stack despite changing addresses', () => {
  const report = parseLog(log([...header, 'Invalid read of size 4', ...stack, '', 'Invalid read of size 4', ...stack.map(s => s.replace('0xAAA', '0xCCC')), ...summary]));
  assert.equal(report.groups.length, 1);
  assert.equal(report.groups[0].recordCount, 2);
  assert.equal(report.recordCount, 2);
  assert.equal(report.errorCount, 9);
  assert.equal(report.groups[0].frames[0].file, 'src/main.c');
  assert.equal(report.groups[0].frames[0].sourceLine, 12);
});

test('different callers remain separate even at the same failing function', () => {
  const report = parseLog(log([...header, 'Invalid read of size 4', ...stack, '', 'Invalid read of size 4', stack[0], stack[1].replace(':30', ':31'), ...summary]));
  assert.equal(report.groups.length, 2);
});

test('read and write and different access sizes stay separate', () => {
  const report = parseLog(log([...header, ...['Invalid read of size 4', 'Invalid read of size 8', 'Invalid write of size 4'].flatMap(title => [title, ...stack, '']), ...summary]));
  assert.equal(report.groups.length, 3);
});

test('allocation and origin stacks stay evidence, not primary stack', () => {
  const report = parseLog(log([...header, 'Invalid read of size 4', ...stack, ' Address 0xABC is 0 bytes inside a block of size 4 free\'d', '   at 0xDEF: free (vg_replace_malloc.c:10)', '   by 0x123: cleanup (src/main.c:20)', '', ...summary]));
  const record = report.groups[0].records[0];
  assert.equal(record.frames.length, 2);
  assert.equal(record.evidenceFrames.length, 2);
  assert.equal(record.endLine, 8);
});

test('leak totals come from summaries, not duplicated detail records', () => {
  const report = parseLog(log([...header, '64 bytes in 1 blocks are definitely lost in loss record 1 of 2', ...stack, '', '64 bytes in 1 blocks are definitely lost in loss record 2 of 2', ...stack, ...summary]));
  assert.equal(report.groups.length, 1);
  assert.equal(leakTotal(report, 'definite'), 64);
  assert.equal(leakTotal(report, 'reachable'), 128);
});

test('parses direct plus indirect loss records without double-counting summaries', () => {
  const report = parseLog(log([...header, '96 (32 direct, 64 indirect) bytes in 1 blocks are definitely lost in loss record 2 of 2', ...stack, ...summary]));
  assert.equal(report.groups[0].records[0].bytes, 96);
  assert.equal(report.groups[0].records[0].directBytes, 32);
  assert.equal(report.groups[0].records[0].indirectBytes, 64);
});

test('parses thousands separators and CRLF', () => {
  const report = parseLog(log([...header, '1,024 bytes in 2 blocks are possibly lost in loss record 1 of 1', ...stack, 'LEAK SUMMARY:', 'possibly lost: 1,024 bytes in 2 blocks', 'ERROR SUMMARY: 1,234 errors from 1 contexts']).replaceAll('\n', '\r\n'));
  assert.equal(report.errorCount, 1234);
  assert.equal(leakTotal(report, 'possible'), 1024);
  assert.equal(report.groups[0].kind, 'possible');
});

test('truncated logs are unknown, not clean', () => {
  const report = parseLog(log([...header, 'Invalid read of size 4', ...stack]));
  assert.equal(report.errorCount, null);
  assert.equal(leakTotal(report, 'definite'), null);
  assert.ok(report.warnings.some(w => w.includes('incomplete')));
  assert.equal(report.groups[0].records[0].endLine, 5);
});

test('recognizes explicitly clean runs', () => {
  const report = parseLog(log([...header, 'HEAP SUMMARY:', 'in use at exit: 0 bytes in 0 blocks', 'All heap blocks were freed -- no leaks are possible', 'ERROR SUMMARY: 0 errors from 0 contexts']));
  assert.equal(report.groups.length, 0);
  assert.equal(report.errorCount, 0);
  assert.equal(leakTotal(report, 'definite'), 0);
  assert.deepEqual(report.warnings, []);
});

test('still reachable remains informational even with zero Valgrind errors', () => {
  const report = parseLog(log([...header, '128 bytes in 2 blocks are still reachable in loss record 1 of 1', ...stack, ...summary.slice(0, -1), 'ERROR SUMMARY: 0 errors from 0 contexts']));
  assert.equal(report.errorCount, 0);
  assert.equal(report.groups[0].kind, 'reachable');
});

test('keeps interleaved processes independent', () => {
  const report = parseLog([log([...header, 'Invalid read of size 4', ...stack], '42'), log([...header, 'Invalid read of size 4', ...stack, ...summary], '43'), log(summary, '42')].join('\n'));
  assert.equal(report.processes.length, 2);
  assert.equal(report.groups.length, 2);
  assert.equal(report.errorCount, 18);
  assert.equal(leakTotal(report, 'definite'), 128);
});

test('unsupported detail with nonzero summary yields an explicit warning', () => {
  const report = parseLog(log([...header, 'ERROR SUMMARY: 3 errors from 1 contexts']));
  assert.equal(report.errorCount, 3);
  assert.equal(report.groups.length, 0);
  assert.ok(report.warnings.some(w => w.includes('no supported detail')));
});

test('rejects empty, unrelated, and XML input', () => {
  assert.throws(() => parseLog(''), /non-empty/);
  assert.throws(() => parseLog('hello world'), /No supported/);
  assert.throws(() => parseLog('<?xml version="1.0"?><valgrindoutput/>'), /XML/);
});

test('ANSI escape codes do not hide reports or change original line numbers', () => {
  const report = parseLog('\x1b[31m' + log([...header, 'Invalid read of size 4', ...stack, ...summary]) + '\x1b[0m');
  assert.equal(report.groups[0].records[0].logLine, 3);
});

test('recognizes supported non-leak error families', () => {
  const titles = ['Conditional jump or move depends on uninitialised value(s)', 'Invalid free() / delete / delete[] / realloc()', 'Mismatched free() / delete / delete []', 'Source and destination overlap in memcpy(0x123, 0x456, 8)', 'Syscall param write(buf) points to uninitialised byte(s)', "Argument 'size' of function malloc has a fishy (possibly negative) value: -3"];
  const report = parseLog(log([...header, ...titles.flatMap(t => [t, ...stack, '']), ...summary]));
  assert.deepEqual(report.groups.map(g => g.kind), ['uninitialized', 'invalid-free', 'mismatched-free', 'overlap', 'syscall', 'fishy']);
});

test('warns on concatenated runs with reused PID and avoids false totals', () => {
  const report = parseLog(log([...header, ...summary, ...header, ...summary]));
  assert.equal(report.errorCount, null);
  assert.equal(leakTotal(report, 'definite'), null);
  assert.ok(report.warnings.some(w => w.includes('multiple runs')));
});

test('summary-only excerpts retain known leak totals', () => {
  const report = parseLog(log(summary.slice(0, -1)));
  assert.equal(report.processes.length, 1);
  assert.equal(leakTotal(report, 'definite'), 64);
  assert.equal(report.errorCount, null);
});

test('source locations with optional columns preserve the source line', () => {
  const report = parseLog(log([...header, 'Invalid read of size 4', '   at 0xAAA: read_value (src/main.c:12:3)', ...summary]));
  assert.equal(report.groups[0].frames[0].file, 'src/main.c');
  assert.equal(report.groups[0].frames[0].sourceLine, 12);
});

test('rejects excessive line counts before rendering can overwhelm the UI', () => {
  assert.throws(() => parseLog(log(header) + '\n'.repeat(20001)), /20,000 lines/);
});

test('real demo log includes source locations and the three intentional bugs', () => {
  const report = parseLog(readFileSync(new URL('../dist/examples/demo.log', import.meta.url), 'utf8'));
  assert.ok(report.groups.some(g => g.kind === 'invalid-write'));
  assert.ok(report.groups.some(g => g.kind === 'invalid-read'));
  assert.ok(report.groups.some(g => g.kind === 'definite'));
  assert.equal(leakTotal(report, 'definite'), 64);
  assert.equal(report.errorCount, 3);
  assert.ok(report.groups.every(g => g.frames.some(f => f.file?.endsWith('demo.c'))));
});
