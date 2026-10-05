import { leakTotal } from './parser.js';

export const MAX_LOG_BYTES = 5 * 1024 * 1024;

// Match application frames when available. Without debug symbols, retain the
// non-system function names; never use allocation addresses or PID identity.
const SYSTEM_PATH = /(?:\/(?:usr\/)?(?:lib(?:32|64)?|libexec)\/|\/usr\/(?:include|src)\/|(?:^|\/)(?:vg_replace[^/]*|vgpreload[^/]*|libc[-.]|libstdc\+\+|libgcc|libpthread|ld[-.]|glibc)(?:[^/]*))/i;
function isSystemFrame(frame) {
  const library = frame.description?.match(/\((?:in|below main) (.+)\)$/)?.[1];
  return SYSTEM_PATH.test(frame.file || library || '') ||
    (!frame.file && /^(?:__libc_|__GI_|_dl_|__interceptor_)/.test(frame.function));
}

export function signatureFrames(issue) {
  const application = issue.frames.filter(frame => !isSystemFrame(frame));
  return (application.length ? application : issue.frames).slice(0, 5);
}

export function issueSignature(issue) {
  const frames = signatureFrames(issue);
  // A stackless record cannot establish identity across runs. Do not silently
  // collapse unrelated allocations with the same generic error title.
  if (!frames.length) return null;
  return JSON.stringify([issue.kind, frames.map(frame => [
    frame.function.replace(/0x[\da-f]+/gi, '<address>').trim(),
    frame.file?.replaceAll('\\', '/') ?? null,
    frame.sourceLine ?? null,
  ])]);
}

export function validateLogSize(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_LOG_BYTES) {
    throw new Error('Choose a text log no larger than 5 MiB.');
  }
}

function indexIssues(report, side) {
  const index = new Map();
  report.groups.forEach((issue, i) => {
    const signature = issueSignature(issue);
    const key = signature ?? `${side}:stackless:${i}`;
    if (!index.has(key)) index.set(key, { signature, issues: [], kind: issue.kind, frames: signatureFrames(issue) });
    index.get(key).issues.push(issue);
  });
  return index;
}

function accessRecords(report) {
  // Memcheck suppresses repeated runtime occurrences. This is the number of
  // printed detail records, not ERROR SUMMARY (which includes other errors).
  return report.groups.filter(g => ['invalid-read', 'invalid-write'].includes(g.kind))
    .reduce((sum, group) => sum + group.recordCount, 0);
}

export function compareReports(before, after) {
  const left = indexIssues(before, 'before');
  const right = indexIssues(after, 'after');
  const fixed = [], added = [], persistent = [];
  for (const [key, issue] of left) {
    if (right.has(key)) persistent.push({ before: issue, after: right.get(key) });
    else fixed.push({ before: issue, after: null });
  }
  for (const [key, issue] of right) if (!left.has(key)) added.push({ before: null, after: issue });
  const metrics = ['definite', 'indirect', 'possible', 'access'].map(kind => {
    const a = kind === 'access' ? accessRecords(before) : leakTotal(before, kind);
    const b = kind === 'access' ? accessRecords(after) : leakTotal(after, kind);
    return { kind, before: a, after: b, delta: a === null || b === null ? null : b - a };
  });
  return { fixed, added, persistent, metrics, warnings: [
    ...before.warnings.map(w => `Before: ${w}`),
    ...after.warnings.map(w => `After: ${w}`),
    ...([...left.values(), ...right.values()].some(issue => issue.signature === null)
      ? ['Some issues have no stack trace and cannot be matched across runs.'] : []),
  ] };
}
