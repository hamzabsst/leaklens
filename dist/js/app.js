import { parseLog, ISSUE_INFO, leakTotal } from './parser.js';
import { compareReports, validateLogSize, MAX_LOG_BYTES } from './compare.js';

const $ = (id) => document.getElementById(id);
const LIMIT = MAX_LOG_BYTES;
let report = null;
let activeGroup = null;
let renderRequest = 0;
let comparisonRequest = 0;
const fmt = new Intl.NumberFormat('en-US');
const bytes = (value) => value === null ? 'Unknown' : `${fmt.format(value)} B`;
const node = (tag, className, text) => {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
const colors = { definite: '#edb698', indirect: '#c4b6aa', possible: '#dbcb9b', reachable: '#a8c5bf' };

function notice(message) { $('notice').textContent = message; }
function openReport(text, name, example = false) {
  validateLogSize(text);
  // Parse before committing state so a rejected file cannot erase a valid report.
  const next = parseLog(text);
  report = next;
  clearComparison();
  $('compare-example').hidden = !example;
  $('report-name').textContent = name;
  $('report-command').textContent = next.processes.map(p => p.command || `Process ${p.pid}`).join(' · ');
  $('report-badge').textContent = example ? 'Example report' : 'Local file';
  $('empty-state').hidden = true;
  $('report-content').hidden = false;
  $('raw-section').hidden = false;
  document.body.classList.add('has-report');
  $('stat-groups').textContent = fmt.format(next.groups.length);
  $('stat-records').textContent = `${fmt.format(next.recordCount)} detail records in this log`;
  $('stat-errors').textContent = next.errorCount === null ? 'Unknown' : fmt.format(next.errorCount);
  $('stat-lost').textContent = bytes(leakTotal(next, 'definite'));
  $('stat-reachable').textContent = bytes(leakTotal(next, 'reachable'));
  $('issue-count').textContent = fmt.format(next.groups.length);
  $('warnings').replaceChildren(...next.warnings.map(w => node('p', '', w)));
  $('warnings').hidden = !next.warnings.length;
  renderMemory(next);
  renderRaw(next);
  renderIssues(next);
  notice(example ? 'Example report loaded.' : 'Analysis complete. Your file stays in this browser tab.');
  return { groups: next.groups.length, records: next.recordCount, errors: next.errorCount, warnings: next.warnings };
}

function clearComparison() {
  comparisonRequest++;
  $('comparison-view').hidden = true;
  $('comparison-groups').replaceChildren();
  $('comparison-summary').replaceChildren();
  $('comparison-names').textContent = '';
  $('comparison-message').textContent = '';
  $('single-run-report').hidden = false;
  $('raw-section').hidden = !report;
  $('clear-comparison').hidden = true;
}

function comparisonStack(issue, side) {
  const section = node('div', 'comparison-stack');
  const records = issue.issues.reduce((sum, group) => sum + group.recordCount, 0);
  section.append(node('p', 'eyebrow', `${side} · ${records} detail record${records === 1 ? '' : 's'}`));
  // Show the complete primary stack even though matching uses at most five
  // application frames. Each merged parser group keeps its own evidence.
  for (const group of issue.issues) {
    const stack = node('ol', 'stack comparison-frames');
    for (const frame of group.frames) {
      const row = node('li', 'stack-frame');
      const content = node('span', 'frame-content');
      content.append(node('span', 'frame-function', frame.function), node('span', 'frame-location', frame.file ? `${frame.file}:${frame.sourceLine}` : frame.description));
      row.append(content); stack.append(row);
    }
    if (!group.frames.length) stack.append(node('li', 'comparison-help', 'No stack trace available in this record.'));
    section.append(stack);
  }
  return section;
}

function renderComparison(after, afterName) {
  const diff = compareReports(report, after);
  $('comparison-names').textContent = `${$('report-name').textContent} (before) → ${afterName} (after)`;
  $('comparison-summary').replaceChildren();
  for (const metric of diff.metrics) {
    const card = node('div', 'comparison-metric');
    const label = metric.kind === 'access' ? 'Invalid reads + writes' : ISSUE_INFO[metric.kind].label;
    const format = metric.kind === 'access' ? value => value === null ? 'Unknown' : fmt.format(value) : bytes;
    const change = metric.delta === null ? 'Delta unknown' : metric.delta === 0 ? 'No change' : `${metric.delta < 0 ? '−' : '+'}${format(Math.abs(metric.delta))} · ${metric.delta < 0 ? 'lower' : 'higher'}`;
    card.append(node('span', 'comparison-label', label), node('strong', '', `${format(metric.before)} → ${format(metric.after)}`), node('span', `comparison-delta ${metric.delta < 0 ? 'lower' : metric.delta > 0 ? 'higher' : ''}`, change));
    $('comparison-summary').append(card);
  }
  $('comparison-warnings').replaceChildren(...diff.warnings.map(w => node('p', '', w)));
  $('comparison-warnings').hidden = !diff.warnings.length;
  $('comparison-groups').replaceChildren();
  for (const [label, items] of [['Fixed', diff.fixed], ['New', diff.added], ['Still leaking', diff.persistent]]) {
    const section = node('section', 'comparison-group');
    const heading = node('h4', '', label); heading.append(node('span', 'count', String(items.length))); section.append(heading);
    if (!items.length) section.append(node('p', 'comparison-help', 'No issues in this group.'));
    for (const item of items) {
      const issue = item.after || item.before;
      const details = node('details', 'comparison-item');
      const summary = node('summary');
      const title = node('span', 'comparison-item-title');
      const frame = issue.frames[0];
      title.append(node('strong', '', ISSUE_INFO[issue.kind].label), node('span', 'location', frame ? `${frame.function}${frame.file ? ` · ${frame.file}:${frame.sourceLine}` : ''}` : 'No stack trace available'));
      summary.append(title, node('span', 'disclosure-icon', '+'));
      summary.lastChild.setAttribute('aria-hidden', 'true');
      details.append(summary);
      const stacks = node('div', 'comparison-stacks');
      if (item.before) stacks.append(comparisonStack(item.before, 'Before'));
      if (item.after) stacks.append(comparisonStack(item.after, 'After'));
      details.append(stacks); section.append(details);
    }
    $('comparison-groups').append(section);
  }
  $('single-run-report').hidden = true;
  $('raw-section').hidden = true;
  $('comparison-view').hidden = false;
  $('clear-comparison').hidden = false;
  $('comparison-message').textContent = 'Comparison ready. Both logs stay in this browser tab.';
  $('report-content').scrollIntoView({ block: 'start', behavior: 'auto' });
}

async function readComparison(file) {
  if (!file || !report) return;
  notice('');
  const request = ++comparisonRequest;
  const base = report, baseRequest = renderRequest;
  $('clear-comparison').hidden = false;
  try {
    if (!/\.(log|txt)$/i.test(file.name)) throw new Error('Choose a .log or .txt Memcheck report.');
    if (file.size > LIMIT) throw new Error('This file is too large. Choose a text log no larger than 5 MiB.');
    $('comparison-message').textContent = 'Reading the second log locally…';
    const text = await file.text();
    if (request !== comparisonRequest || base !== report || baseRequest !== renderRequest) return;
    validateLogSize(text);
    const after = parseLog(text);
    renderComparison(after, file.name);
  } catch (error) {
    if (request === comparisonRequest && base === report && baseRequest === renderRequest) {
      $('comparison-message').textContent = `We couldn’t compare that file. ${error.message} Your first report is unchanged.`;
    }
  }
}

async function compareExample() {
  if (!report) return;
  notice('');
  const request = ++comparisonRequest;
  const base = report, baseRequest = renderRequest;
  $('clear-comparison').hidden = false;
  try {
    $('comparison-message').textContent = 'Loading the after example…';
    const response = await fetch('examples/demo-after.log');
    if (!response.ok) throw new Error('The example could not be loaded. Try a second log file.');
    const text = await response.text();
    if (request !== comparisonRequest || base !== report || baseRequest !== renderRequest) return;
    validateLogSize(text);
    renderComparison(parseLog(text), 'demo-after.log · synthetic example');
  } catch (error) {
    if (request === comparisonRequest && base === report && baseRequest === renderRequest) $('comparison-message').textContent = error.message;
  }
}

function renderMemory(next) {
  const categories = Object.keys(colors).map(kind => ({ kind, value: leakTotal(next, kind) }));
  const complete = categories.every(c => c.value !== null);
  const total = categories.reduce((sum, c) => sum + (c.value ?? 0), 0);
  $('memory-total').textContent = complete ? `${bytes(total)} unsuppressed` : 'Incomplete leak summary';
  $('memory-bar').replaceChildren();
  $('memory-legend').replaceChildren();
  for (const category of categories) {
    const { kind, value } = category;
    if (complete && total > 0 && value > 0) {
      const segment = node('span'); segment.style.width = `${value / total * 100}%`; segment.style.background = colors[kind];
      $('memory-bar').append(segment);
    }
    const legend = node('span', 'legend-item');
    const key = node('span', 'legend-key'); key.style.background = colors[kind];
    legend.append(key, node('span', '', `${ISSUE_INFO[kind].label} ${bytes(value)}`));
    $('memory-legend').append(legend);
  }
}

function renderRaw(next) {
  $('raw-line-count').textContent = `${fmt.format(next.lines.length)} lines`;
  $('raw-details').open = false;
  $('raw-log').replaceChildren();
  const fragment = document.createDocumentFragment();
  next.lines.forEach((line, index) => {
    const row = node('div', 'log-line'); row.id = `log-line-${index + 1}`;
    row.append(node('span', 'line-number', String(index + 1)), node('span', '', line));
    fragment.append(row);
  });
  $('raw-log').append(fragment);
}

function jumpToLine(line, end = line) {
  document.querySelectorAll('.log-line.highlighted').forEach(n => n.classList.remove('highlighted'));
  for (let i = line; i <= end; i++) $(`log-line-${i}`)?.classList.add('highlighted');
  $('raw-details').open = true;
  $('raw-section').scrollIntoView({ block: 'nearest', behavior: 'auto' });
  const row = $(`log-line-${line}`);
  if (row) $('raw-log').scrollTop += row.getBoundingClientRect().top - $('raw-log').getBoundingClientRect().top - 70;
  $('raw-log').focus({ preventScroll: true });
}

function usefulFrame(group) {
  return group.frames.find(f => f.file && !/vg_replace|vgpreload|\/valgrind\//.test(f.file)) || group.frames[0];
}

function renderIssues(next) {
  $('issue-list').replaceChildren();
  $('issue-detail').replaceChildren();
  $('issue-workspace').hidden = !next.groups.length;
  $('clean-state').hidden = !!next.groups.length;
  if (!next.groups.length) {
    const knownClean = next.errorCount === 0 && ['definite', 'indirect', 'possible'].every(k => leakTotal(next, k) === 0);
    $('clean-state').textContent = knownClean ? 'No errors or lost allocations reported in the available summaries.' : 'No supported detail records found. Review the summaries and original log; this does not establish that the program is error-free.';
    return;
  }
  next.groups.forEach((group, index) => {
    const info = ISSUE_INFO[group.kind];
    const item = node('button', 'issue-item'); item.type = 'button'; item.id = `${group.id}-button`;
    item.setAttribute('aria-pressed', 'false');
    const top = node('div', 'issue-top');
    top.append(node('strong', '', info.label), node('span', `severity ${info.severity}`, info.severity));
    const frame = usefulFrame(group);
    const location = frame ? `${frame.function}${frame.file ? ` · ${frame.file}:${frame.sourceLine}` : ''}` : 'No stack trace in this record';
    const recordedBytes = group.records.reduce((sum, r) => sum + (r.bytes ?? 0), 0);
    const meta = [`${group.recordCount} log record${group.recordCount === 1 ? '' : 's'}`, `PID ${group.pid}`];
    if (recordedBytes) meta.push(`${bytes(recordedBytes)} in detail records`);
    item.append(top, node('span', 'location', location), node('span', 'issue-meta', meta.join(' · ')));
    item.addEventListener('click', () => selectGroup(group));
    $('issue-list').append(item);
    if (index === 0) activeGroup = group;
  });
  selectGroup(activeGroup);
}

function selectGroup(group) {
  activeGroup = group;
  document.querySelectorAll('.issue-item').forEach(item => {
    const selected = item.id === `${group.id}-button`;
    item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected));
  });
  renderDetail(group, 0);
}

function renderDetail(group, recordIndex) {
  const info = ISSUE_INFO[group.kind];
  const record = group.records[recordIndex];
  const container = $('issue-detail'); container.replaceChildren();
  const tag = node('div', 'detail-tag');
  tag.append(node('span', `severity ${info.severity}`, info.severity), node('span', '', `PID ${group.pid} · log line ${record.logLine}`));
  container.append(tag, node('h4', '', info.label), node('p', '', record.title), node('p', '', info.explanation));
  const suggestion = node('div', 'suggestion'); suggestion.append(node('strong', '', 'WHERE TO LOOK'), node('p', '', info.suggestion)); container.append(suggestion);
  const stackHeading = node('div', 'stack-head');
  stackHeading.append(node('span', 'eyebrow', 'PRIMARY STACK'), node('span', '', 'Click a frame to view its log line'));
  container.append(stackHeading);
  const stack = node('div', 'stack');
  if (!record.frames.length) stack.append(node('p', 'muted', 'This record has no primary stack frames.'));
  record.frames.forEach((frame, i) => {
    const button = node('button', 'stack-frame'); button.type = 'button';
    const content = node('span', 'frame-content');
    content.append(node('span', 'frame-function', frame.function), node('span', 'frame-location', frame.file ? `${frame.file}:${frame.sourceLine}` : frame.description));
    button.append(node('span', 'frame-number', String(i).padStart(2, '0')), content);
    button.title = `View original log line ${frame.logLine}`;
    button.addEventListener('click', () => jumpToLine(frame.logLine)); stack.append(button);
  });
  container.append(stack);
  if (group.recordCount > 1) {
    const label = node('label', 'record-note', 'Inspect grouped record '); label.htmlFor = 'record-selector';
    const selector = node('select', 'record-chooser'); selector.id = 'record-selector';
    group.records.forEach((r, i) => { const option = node('option', '', `Record ${i + 1} · log line ${r.logLine}`); option.value = String(i); selector.append(option); });
    selector.value = String(recordIndex); selector.addEventListener('change', () => renderDetail(group, Number(selector.value)));
    label.append(selector); container.append(label);
  }
  const actions = node('div', 'detail-actions'); const evidence = node('button', 'quiet-button', 'View complete evidence');
  evidence.type = 'button'; evidence.addEventListener('click', () => jumpToLine(record.logLine, record.endLine)); actions.append(evidence); container.append(actions);
  container.append(node('p', 'record-note muted', 'Source references come from the log. Clicking opens the evidence here; LeakLens does not have access to your source files.'));
}

async function readFile(file) {
  if (!file) return;
  const request = ++renderRequest;
  try {
    if (file.size > LIMIT) throw new Error('This file is too large. Choose a text log smaller than 5 MiB.');
    notice('Reading your log…');
    const text = await file.text();
    if (request === renderRequest) {
      openReport(text, file.name);
      $('analyzer').scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  } catch (error) { if (request === renderRequest) notice(error.message); }
}

async function loadDemo(event) {
  const request = ++renderRequest;
  try {
    if (event) notice('Loading the example…');
    const response = await fetch('examples/demo.log');
    if (!response.ok) throw new Error('The example could not be loaded. You can still open your own log.');
    const text = await response.text();
    if (request === renderRequest) {
      openReport(text, 'demo.log', true);
      if (!event) notice('');
      if (event) $('analyzer').scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  } catch (error) { if (request === renderRequest) notice(error.message); }
}

// Start with a clearly marked real example so visitors can inspect the tool.
// Loading it never moves the page; an explicit action brings the report into view.
void loadDemo();

$('log-file').addEventListener('change', (event) => { void readFile(event.target.files[0]); event.target.value = ''; });
$('demo-button').addEventListener('click', loadDemo);
$('empty-demo').addEventListener('click', loadDemo);
$('compare-file').addEventListener('change', event => { void readComparison(event.target.files[0]); event.target.value = ''; });
$('compare-example').addEventListener('click', compareExample);
$('clear-comparison').addEventListener('click', () => { clearComparison(); $('compare-file').focus(); });
for (const eventName of ['dragenter', 'dragover']) $('compare-dropzone').addEventListener(eventName, event => { event.preventDefault(); $('compare-dropzone').classList.add('dragging'); });
for (const eventName of ['dragleave', 'drop']) $('compare-dropzone').addEventListener(eventName, event => { event.preventDefault(); $('compare-dropzone').classList.remove('dragging'); });
$('compare-dropzone').addEventListener('drop', event => { void readComparison(event.dataTransfer.files[0]); });
for (const eventName of ['dragenter', 'dragover']) $('dropzone').addEventListener(eventName, event => { event.preventDefault(); $('dropzone').classList.add('dragging'); });
for (const eventName of ['dragleave', 'drop']) $('dropzone').addEventListener(eventName, event => { event.preventDefault(); $('dropzone').classList.remove('dragging'); });
$('dropzone').addEventListener('drop', event => { void readFile(event.dataTransfer.files[0]); });
// Prevent an accidental drop outside the target from navigating away from a report.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
$('copy-command').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('valgrind --leak-check=full --show-leak-kinds=all --track-origins=yes --log-file=report.log ./app'); notice('Command copied. Compile your program with -g first.'); }
  catch { notice('Copy is unavailable here. Select the command above to copy it.'); }
});

// Optional browser agent access. Unsupported browsers use the ordinary UI.
const context = document.modelContext;
if (context?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  for (const tool of [
    {
      name: 'analyze_memcheck_log', title: 'Analyze a Memcheck log',
      description: 'Analyze supplied plain-text log contents locally and replace the visible report.',
      inputSchema: { type: 'object', properties: { text: { type: 'string' }, name: { type: 'string' } }, required: ['text'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input.text !== 'string' || (input.name !== undefined && typeof input.name !== 'string')) throw new Error('Provide text and an optional string name.');
        renderRequest++;
        return openReport(input.text, input.name || 'Agent-provided log');
      },
    },
    {
      name: 'read_memcheck_report', title: 'Read the current report',
      description: 'Read a concise summary of the report currently visible in LeakLens.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute() { return report ? { groups: report.groups.length, records: report.recordCount, errors: report.errorCount, warnings: report.warnings, issues: report.groups.map(g => ({ id: g.id, kind: g.kind, pid: g.pid, records: g.recordCount })) } : { status: 'No report loaded' }; },
    },
  ]) {
    try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional API; never block analysis. */ }
  }
}
