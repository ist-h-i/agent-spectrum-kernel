const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { teams: [], items: [], selected: new Map(), metrics: null, display: 'table', detail: null, tab: 'overview', settings: {}, pins: [], pinItems: new Map(), undo: null, confirm: null };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const formatDate = value => value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not recorded';
const statusLabel = value => ({ archived: 'Archived', open: 'Open', in_review: 'In review', ready: 'Ready', approved: 'Approved', published: 'Published', blocked: 'Blocked', draft: 'Draft' }[value] || value);
const reviewKey = item => `${item.teamId}/${item.id}`;
const teamName = id => state.teams.find(team => team.id === id)?.name || id;
const teamPath = id => `/api/teams/${encodeURIComponent(id)}`;
const reviewPath = item => `${teamPath(item.teamId)}/reviews/${encodeURIComponent(item.id)}`;
const activeTeams = () => $('#team-filter').value ? state.teams.filter(team => team.id === $('#team-filter').value) : state.teams;
const findingCount = review => Array.isArray(review.findings) ? review.findings.length : Number(review.findings || 0);
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || body.error || `Request failed (${response.status})`);
  return body;
}
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
function showError(element, message, retry) {
  element.innerHTML = `<strong>Could not load this section.</strong> ${escapeHtml(message)} <button class="button secondary">Try again</button>`;
  element.hidden = false;
  $('button', element).onclick = retry;
}
function setView(view) {
  $$('.view').forEach(element => { element.hidden = element.id !== `${view}-view`; });
  $$('.nav-item').forEach(element => element.classList.toggle('active', element.dataset.view === view));
  if (view === 'history') loadHistory();
  if (view === 'settings') loadSettings();
}
function badge(status) { return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>`; }
function initials(name) { return String(name).split(/[\s-]+/).slice(0, 2).map(word => word[0]).join('').toUpperCase(); }
function selectionInput(item) { return `<input type="checkbox" data-select="${escapeHtml(reviewKey(item))}" aria-label="Select ${escapeHtml(item.title)}" ${state.selected.has(reviewKey(item)) ? 'checked' : ''}>`; }
function titleBlock(item) { return `<button class="review-title" data-open="${escapeHtml(reviewKey(item))}">${escapeHtml(item.title)}</button><button class="pin-toggle" data-pin="${escapeHtml(reviewKey(item))}" aria-label="${state.pins.includes(reviewKey(item)) ? 'Unpin' : 'Pin'} ${escapeHtml(item.title)}">${state.pins.includes(reviewKey(item)) ? '◆' : '◇'}</button><div class="review-meta">${escapeHtml(item.repository)} <span aria-hidden="true">·</span> #${escapeHtml(item.pullRequest)} <span aria-hidden="true">·</span> ${escapeHtml(teamName(item.teamId))}</div>`; }
function renderQueue() {
  $('#result-count').textContent = state.items.length;
  $('#nav-count').textContent = state.items.length;
  if (!state.items.length) {
    $('#queue').innerHTML = '<div class="empty-state"><h3>No reviews match these filters</h3><p>Try another search or clear your filters to see the full queue.</p><button class="button secondary" id="empty-clear">Clear filters</button></div>';
    $('#empty-clear').onclick = clearFilters;
  } else if (state.display === 'table') {
    $('#queue').innerHTML = `<table class="review-table"><thead><tr><th><input type="checkbox" id="select-visible" aria-label="Select all visible reviews" ${state.items.every(item => state.selected.has(reviewKey(item))) ? 'checked' : ''}></th><th>REVIEW</th><th>STATUS</th><th>FINDINGS</th><th>UPDATED</th><th><span class="sr-only">Open</span></th></tr></thead><tbody>${state.items.map(item => `<tr><td>${selectionInput(item)}</td><td>${titleBlock(item)}</td><td>${badge(item.status)}</td><td><span class="finding-number">${findingCount(item)}</span> open</td><td class="muted">${escapeHtml(formatDate(item.updatedAt))}</td><td><button class="row-open" aria-label="Open ${escapeHtml(item.title)}" data-open="${escapeHtml(reviewKey(item))}">›</button></td></tr>`).join('')}</tbody></table>`;
    $('#select-visible').onchange = event => {
      state.items.forEach(item => event.target.checked ? state.selected.set(reviewKey(item), item) : state.selected.delete(reviewKey(item)));
      renderQueue();
    };
  } else {
    $('#queue').innerHTML = `<div class="review-cards">${state.items.map(item => `<article class="review-card"><div class="card-top">${selectionInput(item)}${badge(item.status)}</div>${titleBlock(item)}<div class="card-bottom"><span class="small muted">${findingCount(item)} open findings</span><span class="small muted">${escapeHtml(formatDate(item.updatedAt))}</span></div></article>`).join('')}</div>`;
  }
  $$('[data-select]').forEach(input => { input.onchange = () => {
    const item = state.items.find(review => reviewKey(review) === input.dataset.select);
    if (input.checked) state.selected.set(reviewKey(item), item); else state.selected.delete(reviewKey(item));
    renderSelection();
  }; });
  $$('[data-open]').forEach(button => { button.onclick = () => openDetail(state.items.find(item => reviewKey(item) === button.dataset.open)); });
  $$('[data-pin]').forEach(button => { button.onclick = () => togglePin(button.dataset.pin); });
  state.items.forEach(item => state.pinItems.set(reviewKey(item), item));
  renderPins();
  renderSelection();
}
function renderSelection() {
  $('#bulkbar').hidden = state.selected.size === 0;
  $('#selection-count').textContent = `${state.selected.size} selected`;
  $('#bulk-publish').disabled = (state.metrics?.bySeverity?.critical ?? 0) > 0;
}
async function loadQueue() {
  const query = new URLSearchParams({ q: $('#search').value, status: $('#status-filter').value, limit: '100' });
  $('#queue-updated').textContent = 'Updating queue…';
  $('#queue').setAttribute('aria-busy', 'true');
  try {
    const responses = await Promise.all(activeTeams().map(async team => {
      const result = await api(`${teamPath(team.id)}/reviews?${query}`);
      return result.items.map(item => ({ ...item, teamId: item.teamId || team.id }));
    }));
    state.items = responses.flat();
    $('#queue-error').hidden = true;
    renderQueue();
    $('#queue-updated').textContent = `Updated ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${state.items.length} reviews`;
  } catch (error) {
    showError($('#queue-error'), error.message, loadQueue);
    $('#queue-updated').textContent = 'Showing the last available queue';
  } finally { $('#queue').removeAttribute('aria-busy'); }
}
async function loadMetrics() {
  try {
    const partial = new URLSearchParams(location.search).get('metrics') === 'partial';
    const results = await Promise.all(activeTeams().map(team => api(`${teamPath(team.id)}/metrics${partial ? '?partial=1' : ''}`)));
    state.metrics = results.reduce((total, item) => ({ total: total.total + (item.total ?? 0), open: total.open + (item.open ?? 0), approved: total.approved + (item.approved ?? 0), published: total.published + (item.published ?? 0), bySeverity: { critical: total.bySeverity.critical + (item.bySeverity?.critical ?? 0) }, partial: total.partial || item.partial }), { total: 0, open: 0, approved: 0, published: 0, bySeverity: { critical: 0 }, partial: false });
    const metric = state.metrics;
    const tiles = [{ label: 'Reviews in workspace', value: metric.total, note: 'Across your selected teams', symbol: '▤' }, { label: 'Awaiting a decision', value: metric.open, note: 'Ready for coordinator review', symbol: '◷' }, { label: 'Critical findings', value: metric.bySeverity.critical, note: metric.bySeverity.critical ? 'Resolve before publishing' : 'No critical blockers', symbol: '◇', attention: true }, { label: 'Published reviews', value: metric.published, note: 'Delivery recorded locally', symbol: '↗' }];
    $('#metrics').innerHTML = tiles.map(tile => `<div class="metric ${tile.attention ? 'metric-attention' : ''}"><div class="metric-label">${tile.label}</div><span class="metric-symbol" aria-hidden="true">${tile.symbol}</span><div class="metric-value">${tile.value}</div><div class="metric-note">${tile.note}</div></div>`).join('');
    renderSelection();
  } catch (error) { $('#metrics').innerHTML = `<div class="region-error">Summary unavailable. ${escapeHtml(error.message)} <button id="retry-metrics" class="button secondary">Retry summary</button></div>`; $('#retry-metrics').onclick = loadMetrics; }
}
function clearFilters() { $('#filters').reset(); loadQueue(); loadMetrics(); }
async function openDetail(item) {
  state.detail = item;
  state.tab = 'overview';
  $('#drawer-overlay').hidden = false;
  $('#detail-content').innerHTML = '<div class="detail-body">Loading review…</div>';
  $('#drawer').focus();
  try {
    const result = await api(reviewPath(item));
    state.detail = { ...result, teamId: item.teamId };
    renderDetail();
  } catch (error) {
    $('#detail-content').innerHTML = `<div class="detail-body"><button class="button secondary" id="detail-close">Close review</button><div class="region-error">${escapeHtml(error.message)}</div></div>`;
    $('#detail-close').onclick = closeDetail;
  }
}
function closeDetail() { $('#drawer-overlay').hidden = true; }
function renderDetail() {
  const review = state.detail;
  $('#detail-content').innerHTML = `<header class="detail-head"><div class="detail-topline"><span class="eyebrow">${escapeHtml(teamName(review.teamId))} · #${escapeHtml(review.pullRequest)}</span><button id="detail-close" class="icon-button" aria-label="Close review">×</button></div><h2 id="detail-title">${escapeHtml(review.title)}</h2>${badge(review.status)}<div class="detail-summary"><span>${escapeHtml(review.repository)}</span><span>Updated ${escapeHtml(formatDate(review.updatedAt))}</span></div></header><nav class="detail-tabs" aria-label="Review sections">${['overview', 'findings', 'artifact', 'history'].map(tab => `<button data-tab="${tab}" class="${state.tab === tab ? 'active' : ''}">${tab[0].toUpperCase() + tab.slice(1)}</button>`).join('')}</nav><div id="detail-panel" class="detail-body"></div><footer class="detail-actions"><span class="small muted">Version ${escapeHtml(review.version)} · ${escapeHtml(String(review.headSha || '').slice(0, 8))}</span><div><button id="archive-review" class="button quiet">Archive</button> <button id="approve-review" class="button secondary" ${review.status === 'published' ? 'disabled' : ''}>Approve review</button> <button id="publish-review" class="button primary" ${review.status === 'published' ? 'disabled' : ''}>Publish reply</button></div></footer>`;
  $('#detail-close').onclick = closeDetail;
  $$('[data-tab]').forEach(button => { button.onclick = () => { state.tab = button.dataset.tab; renderDetail(); }; });
  $('#archive-review').onclick = archiveReview;
  $('#approve-review').onclick = approveReview;
  $('#publish-review').onclick = () => confirmPublish([review]);
  renderDetailPanel();
}
async function renderDetailPanel() {
  const review = state.detail;
  const panel = $('#detail-panel');
  if (state.tab === 'overview') {
    panel.innerHTML = `<section class="detail-box"><h3>Review context</h3><p class="muted small">${escapeHtml(review.summary || 'Review the collected findings and supporting artifact before approving delivery.')}</p><dl class="detail-grid"><div><dt>Team</dt><dd>${escapeHtml(teamName(review.teamId))}</dd></div><div><dt>Repository</dt><dd>${escapeHtml(review.repository)}</dd></div><div><dt>Open findings</dt><dd>${findingCount(review)}</dd></div><div><dt>Delivery</dt><dd>Local provider queue</dd></div></dl></section><form id="note-form" class="detail-box"><h3>Coordinator note</h3><p class="muted small">Add context for the next person reviewing this change.</p><label class="field">Note<textarea id="review-note" required placeholder="What should the next reviewer know?">${escapeHtml(review.note || '')}</textarea></label><div class="form-actions"><button class="button secondary" type="submit">Save note</button><span id="note-status" class="small" role="status"></span></div></form>`;
    $('#note-form').onsubmit = saveNote;
  } else if (state.tab === 'findings') {
    const findings = Array.isArray(review.findings) ? review.findings : [];
    panel.innerHTML = `<section class="detail-box"><h3>Findings (${findings.length})</h3>${findings.length ? findings.map(finding => `<article class="finding"><span class="badge">${escapeHtml(finding.severity || 'info')}</span><h3>${escapeHtml(finding.title || finding.message || finding.id)}</h3><p>${escapeHtml(finding.description || finding.body || finding.message || finding.summary || '')}</p>${finding.file || finding.path ? `<code>${escapeHtml(finding.file || finding.path)}${finding.line ? `:${escapeHtml(finding.line)}` : ''}</code>` : ''}</article>`).join('') : '<p class="muted small">No findings recorded for this review.</p>'}</section>`;
  } else if (state.tab === 'history') {
    panel.innerHTML = renderTimeline(review.history || []);
  } else {
    panel.innerHTML = '<p class="muted small">Loading saved artifact…</p>';
    try {
      const artifact = await api(`${reviewPath(review)}/export`);
      panel.innerHTML = `<section class="detail-box"><h3>Reply preview</h3><p class="muted small">Read the exact saved draft before sending it to the delivery queue.</p><pre class="artifact-preview"></pre><button id="copy-artifact" class="button secondary">Copy draft</button></section>`;
      $('.artifact-preview', panel).textContent = artifact.markdown || '';
      $('#copy-artifact').onclick = async () => {
        try { await navigator.clipboard.writeText(artifact.markdown || ''); toast('Draft copied to clipboard'); } catch { toast('Clipboard unavailable. Select and copy the preview text.'); }
      };
    } catch (error) { showError(panel, error.message, renderDetailPanel); }
  }
}
async function saveNote(event) {
  event.preventDefault();
  const note = $('#review-note').value;
  const review = state.detail;
  $('#note-status').textContent = 'Saving…';
  try {
    const result = await api(`${reviewPath(review)}/notes`, { method: 'POST', body: JSON.stringify({ body: note }) });
    review.note = note;
    $('#note-status').textContent = 'Note saved';
    if (result.history) review.history = result.history;
    toast('Coordinator note saved');
  } catch (error) { $('#note-status').textContent = error.message; }
}
async function approveReview() {
  const button = $('#approve-review');
  const review = state.detail;
  button.disabled = true;
  button.textContent = 'Approving…';
  try {
    const updated = await api(reviewPath(review), { method: 'PATCH', body: JSON.stringify({ version: review.version, status: 'approved' }) });
    state.detail = { ...review, ...updated };
    renderDetail();
    toast('Review approved');
    loadQueue();
  } catch (error) { toast(error.message); button.disabled = false; button.textContent = 'Approve review'; }
}
function confirmPublish(reviews) {
  state.confirm = reviews;
  $('#confirm-title').textContent = reviews.length === 1 ? 'Publish this review?' : 'Publish selected reviews?';
  $('#confirm-description').textContent = `Send ${reviews.length} saved ${reviews.length === 1 ? 'reply' : 'replies'} to the provider delivery queue. Published replies cannot be recalled here.`;
  const visible = reviews.filter(review => state.items.some(item => reviewKey(item) === reviewKey(review)));
  $('#confirm-targets').innerHTML = visible.map(review => `<div class="confirm-target">${escapeHtml(review.title)}<div class="review-meta">${escapeHtml(teamName(review.teamId))} · ${escapeHtml(review.repository)} #${escapeHtml(review.pullRequest)}</div></div>`).join('');
  $('#confirm-overlay').hidden = false;
  $('#confirm-submit').disabled = false;
  $('#confirm-submit').textContent = 'Publish now';
  $('#confirm-submit').onclick = publishConfirmed;
  $('#confirm-submit').focus();
}
function cancelConfirm() { $('#confirm-overlay').hidden = true; state.confirm = null; }
async function publishConfirmed() {
  const reviews = state.confirm;
  const button = $('#confirm-submit');
  button.disabled = true;
  button.textContent = 'Publishing…';
  try {
    for (const review of reviews) await api(`${reviewPath(review)}/publish`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ version: review.version }) });
    cancelConfirm();
    state.selected.clear();
    closeDetail();
    toast(`${reviews.length} ${reviews.length === 1 ? 'reply' : 'replies'} published`);
    await Promise.all([loadQueue(), loadMetrics()]);
  } catch (error) { button.disabled = false; button.textContent = 'Publish now'; toast(error.message); }
}
function renderTimeline(events) {
  if (!events.length) return '<div class="empty-state"><h3>No activity recorded</h3><p>Review decisions and deliveries will appear here.</p></div>';
  return `<div class="timeline">${events.map(event => `<article class="timeline-entry"><span class="timeline-marker" aria-hidden="true"></span><div><strong>${escapeHtml(event.message || event.action || event.type || 'Review updated')}</strong><p>${escapeHtml(event.actor || event.userId || 'Workspace')} · ${escapeHtml(formatDate(event.at || event.createdAt || event.timestamp))}${event.reviewTitle ? ` · ${escapeHtml(event.reviewTitle)}` : ''}</p>${event.body ? `<p>${escapeHtml(event.body)}</p>` : ''}</div></article>`).join('')}</div>`;
}
async function loadHistory() {
  $('#history-content').innerHTML = '<p class="muted">Loading workspace activity…</p>';
  try {
    const lists = await Promise.all(state.teams.map(team => api(`${teamPath(team.id)}/reviews?limit=100`)));
    const reviews = await Promise.all(lists.flatMap(list => list.items).map(item => api(reviewPath(item))));
    const events = reviews.flatMap(review => (review.history || []).map(event => ({ ...event, reviewTitle: review.title })));
    events.sort((a, b) => new Date(b.at || b.createdAt || b.timestamp) - new Date(a.at || a.createdAt || a.timestamp));
    $('#history-content').innerHTML = renderTimeline(events);
  } catch (error) { showError($('#history-content'), error.message, loadHistory); }
}
async function loadSettings() {
  try {
    state.settings = await api(`${teamPath(state.teams[0].id)}/settings`);
    for (const [name, value] of Object.entries(state.settings)) {
      const input = $('#settings-form').elements.namedItem(name);
      if (input) { if (input.type === 'checkbox') input.checked = value; else input.value = value; }
    }
  } catch (error) { $('#settings-status').textContent = error.message; }
}
async function saveSettings(event) {
  event.preventDefault();
  const form = event.target;
  const button = $('button[type=submit]', form);
  const values = Object.fromEntries(new FormData(form));
  values.requireApproval = form.elements.requireApproval.checked;
  values.compactRows = form.elements.compactRows.checked;
  button.disabled = true;
  $('#settings-status').textContent = 'Saving…';
  try {
    await api(`${teamPath(state.teams[0].id)}/settings`, { method: 'PATCH', body: JSON.stringify(values) });
    document.body.classList.toggle('compact', values.compactRows);
    $('#settings-status').textContent = 'Preferences saved';
  } catch (error) { $('#settings-status').textContent = error.message; }
  finally { button.disabled = false; }
}
$$('[data-view]').forEach(button => { button.onclick = () => setView(button.dataset.view); });
$('#filters').onsubmit = event => event.preventDefault();
$('#search').oninput = loadQueue;
$('#team-filter').onchange = () => { loadQueue(); loadMetrics(); };
$('#status-filter').onchange = loadQueue;
$('#clear-filters').onclick = clearFilters;
$('#refresh').onclick = () => { loadQueue(); loadMetrics(); };
$('#history-refresh').onclick = loadHistory;
$('#clear-selection').onclick = () => { state.selected.clear(); renderQueue(); };
$('#bulk-publish').onclick = () => confirmPublish([...state.selected.values()]);
$('#confirm-cancel').onclick = cancelConfirm;
$('#confirm-submit').onclick = publishConfirmed;
$('#settings-form').onsubmit = saveSettings;
for (const display of ['table', 'card']) $(`#${display}-view`).onclick = () => {
  state.display = display;
  for (const mode of ['table', 'card']) { $(`#${mode}-view`).classList.toggle('selected', mode === display); $(`#${mode}-view`).setAttribute('aria-pressed', mode === display); }
  renderQueue();
};
$('#drawer-overlay').onclick = event => { if (event.target === $('#drawer-overlay')) closeDetail(); };
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { if (!$('#confirm-overlay').hidden) cancelConfirm(); else if (!$('#drawer-overlay').hidden) closeDetail(); }
});

async function loadPins() {
  try {
    const preferences = await api(`${teamPath(state.teams[0].id)}/settings`);
    state.pins = Array.isArray(preferences.pinnedOrder) ? preferences.pinnedOrder : [];
  } catch { state.pins = []; }
}
async function persistPins() {
  $('#pin-status').textContent = 'Saving working order…';
  try {
    await api(`${teamPath(state.teams[0].id)}/settings`, { method: 'PATCH', body: JSON.stringify({ pinnedOrder: state.pins }) });
    $('#pin-status').textContent = 'Working order saved';
  } catch (error) { $('#pin-status').textContent = `Working order not saved: ${error.message}`; }
}
async function togglePin(key) {
  state.pins = state.pins.includes(key) ? state.pins.filter(item => item !== key) : [...state.pins, key];
  renderQueue();
  await persistPins();
}
function movePin(key, destination) {
  const from = state.pins.indexOf(key);
  if (from < 0 || destination < 0 || destination >= state.pins.length) return;
  state.pins.splice(from, 1);
  state.pins.splice(destination, 0, key);
  renderPins();
}
function renderPins() {
  $('#pinned-section').hidden = !state.pins.length;
  $('#pinned-list').innerHTML = state.pins.map((key, index) => {
    const review = state.pinItems.get(key);
    return `<div class="pinned-row" draggable="true" data-pin-key="${escapeHtml(key)}"><span class="drag-handle" aria-hidden="true">⠿</span><span class="pin-position">${index + 1}</span><span class="pinned-title">${escapeHtml(review?.title || key)}<small>${escapeHtml(review ? teamName(review.teamId) : '')}</small></span><button class="icon-button" data-move="up" data-key="${escapeHtml(key)}" aria-label="Move ${escapeHtml(review?.title || key)} up" ${index === 0 ? 'disabled' : ''}>↑</button><button class="icon-button" data-move="down" data-key="${escapeHtml(key)}" aria-label="Move ${escapeHtml(review?.title || key)} down" ${index === state.pins.length - 1 ? 'disabled' : ''}>↓</button></div>`;
  }).join('');
  $$('[data-move]').forEach(button => { button.onclick = () => {
    movePin(button.dataset.key, state.pins.indexOf(button.dataset.key) + (button.dataset.move === 'up' ? -1 : 1));
    $('#pin-status').textContent = 'Working order saved';
  }; });
  $$('[data-pin-key]').forEach(row => {
    row.ondragstart = event => { event.dataTransfer.setData('text/plain', row.dataset.pinKey); event.dataTransfer.effectAllowed = 'move'; };
    row.ondragover = event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; };
    row.ondrop = async event => {
      event.preventDefault();
      movePin(event.dataTransfer.getData('text/plain'), state.pins.indexOf(row.dataset.pinKey));
      await persistPins();
    };
  });
}
function archiveReview() {
  const review = state.detail;
  $('#confirm-title').textContent = 'Archive this review?';
  $('#confirm-description').textContent = 'Move this review to the archived state. You can undo after saving.';
  $('#confirm-targets').textContent = review.title;
  $('#confirm-overlay').hidden = false;
  $('#confirm-submit').disabled = false;
  $('#confirm-submit').textContent = 'Archive review';
  $('#confirm-cancel').focus();
  $('#confirm-submit').onclick = async () => {
    $('#confirm-submit').disabled = true;
    try {
      const updated = await api(reviewPath(review), { method: 'PATCH', body: JSON.stringify({ version: review.version, status: 'archived' }) });
      state.undo = { review: { ...review, ...updated }, previousStatus: review.status };
      cancelConfirm();
      closeDetail();
      await loadQueue();
      showArchiveUndo();
    } catch (error) { $('#confirm-submit').disabled = false; toast(error.message); }
  };
}
function showArchiveUndo() {
  clearTimeout(toast.timer);
  $('#toast').hidden = false;
  $('#toast').innerHTML = 'Review archived. <button id="undo-archive" class="button secondary">Undo</button> <button id="dismiss-undo" class="button quiet">Dismiss</button>';
  $('#dismiss-undo').onclick = () => { $('#toast').hidden = true; state.undo = null; };
  $('#undo-archive').onclick = async () => {
    const undo = state.undo;
    $('#undo-archive').disabled = true;
    try {
      await api(reviewPath(undo.review), { method: 'PATCH', body: JSON.stringify({ version: undo.review.version, status: undo.previousStatus }) });
      state.undo = null;
      await loadQueue();
      toast('Archive undone. Review restored.');
    } catch (error) { $('#undo-archive').disabled = false; $('#dismiss-undo').textContent = `Dismiss · ${error.message}`; }
  };
}

async function start() {
  try {
    const result = await api('/api/teams');
    state.teams = result.teams;
    $('#team-filter').innerHTML += state.teams.map(team => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`).join('');
    await loadPins();
    await Promise.all([loadQueue(), loadMetrics()]);
  } catch (error) { showError($('#queue-error'), error.message, start); }
}
start();
