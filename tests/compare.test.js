import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLog } from '../dist/js/parser.js';
import { issueSignature, signatureFrames, compareReports, validateLogSize, MAX_LOG_BYTES } from '../dist/js/compare.js';

const fixture = name => readFileSync(new URL(`../dist/examples/${name}`, import.meta.url), 'utf8');
const frame = (name, file = 'src/main.c', sourceLine = 10) => ({ function: name, file, sourceLine, address: '0xABCD', description: `${name} (${file}:${sourceLine})` });
const issue = (kind, frames) => ({ kind, frames, pid: '42', title: '64 bytes', recordCount: 1, records: [{ bytes: 64 }] });
const report = groups => ({ groups, processes: [{ leaks: { definite: { bytes: 64 }, indirect: { bytes: 0 }, possible: { bytes: 0 } }, headerCount: 1 }], warnings: [] });

test('ignores addresses, process IDs, access sizes, byte counts and record counts', () => {
  const before = issue('invalid-read', [frame('read'), frame('main')]);
  const after = { ...before, pid: '999', accessSize: 8, recordCount: 10, title: '128 bytes', frames: before.frames.map(f => ({ ...f, address: '0xFF00' })), records: [{ bytes: 128 }] };
  assert.equal(issueSignature(before), issueSignature(after));
});

test('error kind, function, source file and line distinguish identities', () => {
  const base = issue('invalid-read', [frame('read')]);
  for (const other of [issue('invalid-write', base.frames), issue('invalid-read', [frame('different')]), issue('invalid-read', [frame('read', 'other.c')]), issue('invalid-read', [frame('read', 'src/main.c', 11)])]) {
    assert.notEqual(issueSignature(base), issueSignature(other));
  }
});

test('uses application frames instead of changing libc, loader and Valgrind wrappers', () => {
  const own = [frame('allocate', 'src/list.c', 25), frame('main')];
  const system = [
    { ...frame('malloc', null, null), description: 'malloc (in /usr/libexec/valgrind/vgpreload_memcheck-amd64-linux.so)' },
    { ...frame('__libc_start_main', null, null), description: '__libc_start_main (in /lib/x86_64-linux-gnu/libc.so.6)' },
    { ...frame('operator new', null, null), description: 'operator new (in /usr/lib/libstdc++.so.6)' },
    { ...frame('_dl_start', null, null), description: '_dl_start (in /lib64/ld-linux-x86-64.so.2)' },
  ];
  assert.equal(issueSignature(issue('definite', [...system, ...own])), issueSignature(issue('definite', own)));
  assert.deepEqual(signatureFrames(issue('definite', [frame('malloc', 'src/own.c'), ...system])), [frame('malloc', 'src/own.c')]);
});

test('uses the top five application frames and keeps shorter stacks', () => {
  const frames = Array.from({ length: 7 }, (_, i) => frame(`fn${i}`));
  const base = issue('definite', frames);
  assert.equal(signatureFrames(base).length, 5);
  assert.equal(issueSignature(base), issueSignature(issue('definite', [...frames.slice(0, 5), frame('different-deep-caller')])));
  assert.notEqual(issueSignature(base), issueSignature(issue('definite', [frame('different-top'), ...frames.slice(1)])));
});

test('keeps sourceless application symbols even when a caller has a source location', () => {
  const left = issue('invalid-read', [frame('left', null, null), frame('main')]);
  const right = issue('invalid-read', [frame('right', null, null), frame('main')]);
  assert.notEqual(issueSignature(left), issueSignature(right));
});

test('falls back to symbol names without debug locations or user frames', () => {
  const unknown = [frame('read_value', null, null), frame('main', null, null)];
  assert.equal(issueSignature(issue('invalid-read', unknown)), issueSignature(issue('invalid-read', unknown.map(f => ({ ...f, address: '0x123' })))));
  const systemOnly = [frame('malloc', '/usr/src/glibc/malloc.c', 100)];
  assert.equal(signatureFrames(issue('definite', systemOnly)).length, 1);
});

test('does not falsely match stackless records and reports the limitation', () => {
  const diff = compareReports(report([issue('definite', [])]), report([issue('definite', [])]));
  assert.equal(diff.persistent.length, 0);
  assert.equal(diff.fixed.length, 1);
  assert.equal(diff.added.length, 1);
  assert.match(diff.warnings.join(' '), /cannot be matched/);
});

test('merges signatures across PIDs and ignores access-size parser splits', () => {
  const a = issue('invalid-read', [frame('read')]);
  const diff = compareReports(report([a, { ...a, pid: '99', accessSize: 8 }]), report([a]));
  assert.equal(diff.persistent.length, 1);
  assert.equal(diff.persistent[0].before.issues.length, 2);
  assert.equal(diff.metrics.find(m => m.kind === 'access').delta, -1);
});

test('demo produces two fixed, one new and one persistent issue with accurate deltas', () => {
  const diff = compareReports(parseLog(fixture('demo.log')), parseLog(fixture('demo-after.log')));
  assert.equal(diff.fixed.length, 2);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.persistent.length, 1);
  assert.equal(diff.persistent[0].after.kind, 'definite');
  assert.deepEqual(diff.metrics.map(m => m.delta), [-32, 0, 0, -1]);
});

test('unknown and concatenated leak summaries never become zero deltas', () => {
  const partial = parseLog('==5== Memcheck, a memory error detector');
  const diff = compareReports(parseLog(fixture('demo.log')), partial);
  assert.deepEqual(diff.metrics.slice(0, 3).map(m => m.delta), [null, null, null]);
  assert.ok(diff.warnings.some(w => w.startsWith('After:')));
});

test('returns empty groups and zero metrics for explicitly clean runs', () => {
  const clean = parseLog('==1== Memcheck, a memory error detector\n==1== All heap blocks were freed -- no leaks are possible\n==1== ERROR SUMMARY: 0 errors from 0 contexts');
  const diff = compareReports(clean, clean);
  assert.deepEqual([diff.fixed, diff.added, diff.persistent], [[], [], []]);
  assert.deepEqual(diff.metrics.map(m => m.delta), [0, 0, 0, 0]);
});

test('deltas report regressions as positive, even when a signature still matches', () => {
  const before = parseLog(fixture('demo.log'));
  const after = parseLog(fixture('demo.log').replace('definitely lost: 64', 'definitely lost: 128'));
  assert.equal(compareReports(before, after).metrics[0].delta, 64);
});

test('enforces byte limits including multi-byte text; parser enforces line limits', () => {
  assert.doesNotThrow(() => validateLogSize('a'.repeat(MAX_LOG_BYTES)));
  assert.throws(() => validateLogSize('a'.repeat(MAX_LOG_BYTES + 1)), /5 MiB/);
  assert.throws(() => validateLogSize('é'.repeat(MAX_LOG_BYTES / 2 + 1)), /5 MiB/);
  assert.throws(() => parseLog('==1== Memcheck, a memory error detector\n' + '\n'.repeat(20000)), /20,000/);
  assert.throws(() => parseLog('This is not a Valgrind report'), /No supported/);
});
