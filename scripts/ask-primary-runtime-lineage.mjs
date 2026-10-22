// Owned full-session collection through the existing runner. Synthetic evidence
// cannot qualify startup, authorize a live launch, or enter private scoring.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { posix, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalDigest, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { buildPrimaryRuntimeV10Binding } from './ask-primary-runtime-v10.mjs';
import { inspectSuppliedPrimaryAppServerVerification } from './ask-primary-execution-input.mjs';
import { readStableFile } from './ask-benchmark-stable-file.mjs';

const owned = new WeakMap(), MAX_BYTES = 8 * 1024 * 1024, MAX_LINE = 256 * 1024, MAX_EVENTS = 8192;
const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = path => readStableFile(path, 'runtime retained input', 32 * 1024 * 1024).bytes;
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const missing = Object.freeze(['effective_startup_input_closure_unverified', 'native_runtime_acceptance_unverified',
  'per_turn_resolved_model_unobserved', 'trusted_scoring_runtime_unqualified']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const closed = (value, required, optional = []) => {
  assert.ok(object(value) && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
};
const identifier = value => assert.ok(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(value));
const integer = value => assert.ok(Number.isSafeInteger(value) && value >= 0);
const text = value => assert.ok(typeof value === 'string' && value.length <= MAX_LINE && value.isWellFormed());
const changed = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  .filter(path => canonicalDigest(before[path] ?? null) !== canonicalDigest(after[path] ?? null));
const publicResult = value => structuredClone(value);
export const PRIMARY_RUNTIME_LINEAGE_CONTRACT = 'owned_runtime_lineage_v2';
const replayCoverage = 'sent_requests_thread_turn_replies_and_accepted_item_terminal_usage_frames';
const initializeRequest = () => ({ id: 1, method: 'initialize', params: { clientInfo: { name: 'ask_primary_runtime_lineage', version: '1' }, capabilities: { experimentalApi: false, requestAttestation: false } } });
const threadRequest = (plan, workspace) => ({ id: 2, method: 'thread/start', params: { model: plan.config.model, cwd: workspace, sandbox: 'workspace-write', ephemeral: true } });
const turnRequest = (plan, input, threadId) => ({ id: 3, method: 'turn/start', params: { threadId, input: [{ type: 'text', text: input, text_elements: [] }], effort: plan.config.reasoning } });
function projectThreadConfiguration(result, plan, workspace) {
  closed(result, ['thread', 'model', 'modelProvider', 'cwd', 'approvalPolicy', 'approvalsReviewer', 'sandbox'],
    ['reasoningEffort', 'serviceTier', 'sessionId', 'activePermissionProfile']);
  assert.equal(result.model, plan.config.model); assert.equal(result.cwd, workspace); assert.equal(result.sandbox?.type, 'workspaceWrite');
  assert.ok(typeof result.modelProvider === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(result.modelProvider));
  identifier(result.thread.id); assert.equal(result.thread.cwd, workspace); assert.deepEqual(result.thread.turns, []); assert.equal(result.thread.ephemeral, true);
  return { requested_model: plan.config.model, thread_model: result.model, provider: result.modelProvider, requested_effort: plan.config.reasoning,
    per_turn_resolved_model: null, per_turn_resolved_effort: null, native_cwd: workspace };
}

/** Deliberately no production dispatch entry: missing startup evidence is a
 * pre-spawn failure, not an option/caller flag or an inferred empty inventory. */
export async function collectPrimaryRuntimeLineage(options) {
  assert.ok(options && typeof options === 'object');
  throw new Error('effective_startup_input_closure_unverified');
}

/** A real finite RPC collector exercised with a fake child only. No alternate
 * process manager or replay-to-observed conversion exists in this implementation. */
export async function collectPrimaryRuntimeLineageForTest({ plan, planDigest, condition, input },
  { spawnProcess, runtime = {}, timeoutMs = plan.config.timeout_ms, signal } = {}) {
  assert.equal(plan.config.evidence_kind, 'synthetic', 'fake transport requires a synthetic plan');
  assert.ok(typeof spawnProcess === 'function' && spawnProcess !== spawn, 'explicit fake transport required');
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 2147483647);
  // Historical Full consumers import the shared producer with sealed renderer /
  // runner modules. Load current collection-only dependencies only on this
  // explicit synthetic entry, without changing those historical modules.
  const { executeCodexSession, inventoryUserTree } = await import('./ask-primary-runtime-collection-support.mjs');
  const binding = buildPrimaryRuntimeV10Binding({ plan, planDigest });
  const arm = binding.conditions[condition]; assert.ok(arm, 'unknown condition');
  assert.equal(typeof input, 'string'); assert.equal(hash(input), arm.stdin.digest); assert.equal(Buffer.byteLength(input), arm.stdin.bytes);
  assert.ok(typeof plan.config.model === 'string' && plan.config.model.length > 0);
  assert.ok(typeof plan.config.reasoning === 'string' && plan.config.reasoning.length > 0);
  const workspace = resolve(arm.launch_cwd), armRoot = resolve(workspace, '..');
  const retainedPaths = ['control/plan.json', 'control/plan.digest', arm.stdin.path];
  const retained = Object.fromEntries(retainedPaths.map(path => [join(plan.root, path), hash(read(join(plan.root, path)))]));
  assert.equal(retained[join(plan.root, 'control/plan.json')], planDigest);
  assert.equal(retained[join(plan.root, arm.stdin.path)], arm.stdin.digest);
  const { primaryProducerSources } = await import('./ask-primary-evaluation-producer.mjs');
  const sourceDigests = primaryProducerSources();
  const fixedTrees = Object.fromEntries([[plan.source.repo, plan.source.inventory],
    ...Object.values(plan.arms).map(value => [join(plan.root, value.baseline_path), value.baseline_inventory])]);
  for (const [root, inventory] of Object.entries(fixedTrees)) assert.deepEqual(inventoryUserTree(root), inventory, 'prepared source/baseline changed');
  const before = inventoryUserTree(armRoot);
  for (const pin of arm.initial_inputs) assert.deepEqual(before[pin.arm_relative_path], { digest: pin.digest, bytes: pin.bytes, mode: pin.mode });
  const mutable = new Set(arm.work_products.map(file => file.arm_relative_path));
  const controller = new AbortController();
  let channel, failure = null, stage = 'initialize', threadId = null, turnId = null, wire = Buffer.alloc(0), outputBytes = 0, lines = 0;
  let threadStarted = false, turnStarted = false, turnCompleted = false, finalResponse = null, usage = null, finalInventory = null;
  const pending = new Map(), completed = new Map(), commandLines = [], commandIndexes = [], edits = [], requests = [];
  let threadConfiguration = null, verificationInventory = null, terminalInventory = null;
  const nativeRows = [], replyRows = [], requestBytes = [];
  const stdoutHash = createHash('sha256'); let stdoutBytes = 0;
  const retainNative = raw => nativeRows.push({ line: lines, raw: Buffer.from(raw) });
  const stop = reason => { failure ??= reason; controller.abort(); };
  const interrupt = () => stop('interrupted');
  const send = request => { const bytes = JSON.stringify(request) + '\n'; assert.ok(requestBytes.length < 4 && requestBytes.reduce((sum, row) => sum + Buffer.byteLength(row), 0) + Buffer.byteLength(bytes) <= MAX_BYTES, 'request limit'); requestBytes.push(bytes); requests.push({ method: request.method, ...(Object.hasOwn(request, 'id') ? { id: request.id } : {}), digest: hash(bytes) }); channel.write(bytes); };
  const verifyIdentity = params => { assert.equal(params.threadId, threadId); assert.equal(params.turnId, turnId); };
  const turn = value => {
    closed(value, ['id', 'items', 'status'], ['error', 'itemsView', 'rootTurnId', 'startedAt', 'completedAt', 'durationMs']);
    identifier(value.id); assert.ok(Array.isArray(value.items)); assert.ok(value.error === undefined || value.error === null);
  };
  const thread = value => {
    closed(value, ['cliVersion', 'createdAt', 'cwd', 'ephemeral', 'id', 'modelProvider', 'preview', 'projectId', 'sessionId', 'source', 'status', 'turns', 'updatedAt'],
      ['agentNickname', 'agentRole', 'forkedFromId', 'gitInfo', 'historyMode', 'model', 'name', 'originator', 'parentThreadId', 'path', 'reasoningEffort', 'recencyAt', 'section', 'sectionEnteredAt', 'threadSource']);
    identifier(value.id); assert.equal(value.cwd, workspace); assert.deepEqual(value.turns, []);
    for (const key of ['cliVersion', 'modelProvider', 'preview', 'sessionId']) text(value[key]);
    integer(value.createdAt); integer(value.updatedAt); assert.equal(value.ephemeral, true);
  };
  const safeEditPath = path => {
    text(path); const absolute = posix.isAbsolute(path) ? path : posix.resolve(workspace, path);
    assert.equal(posix.normalize(absolute), absolute);
    const relative = posix.relative(armRoot, absolute); assert.ok(mutable.has(relative), 'edit outside declared work products');
    return relative;
  };
  const itemProjection = (item, started) => {
    assert.ok(object(item)); identifier(item.id);
    if (item.type === 'commandExecution') {
      closed(item, ['id', 'type', 'command', 'cwd', 'commandActions', 'status'], ['aggregatedOutput', 'durationMs', 'exitCode', 'processId', 'source', 'pluginId', 'scriptPath']);
      assert.equal(item.cwd, workspace); assert.ok(arm.verification.some(check => check.rendered_event_command === item.command), 'unsupported command');
      const nativeSource = Object.hasOwn(item, 'source') ? item.source : 'agent'; assert.equal(nativeSource, 'agent');
      assert.ok(item.pluginId === undefined || item.pluginId === null); assert.ok(item.scriptPath === undefined || item.scriptPath === null);
      assert.ok(Array.isArray(item.commandActions));
      if (started) { assert.equal(item.status, 'inProgress'); assert.ok(item.exitCode === undefined || item.exitCode === null); }
      else { assert.ok(['completed', 'failed'].includes(item.status)); assert.ok(Number.isSafeInteger(item.exitCode)); }
      return { id: item.id, type: item.type, command: item.command, cwd: item.cwd, status: item.status,
        exit_code: item.exitCode ?? null, source: nativeSource, plugin_id: item.pluginId ?? null, script_path: item.scriptPath ?? null,
        command_actions_digest: canonicalDigest(item.commandActions) };
    }
    if (item.type === 'fileChange') {
      closed(item, ['id', 'type', 'changes', 'status']); assert.ok(Array.isArray(item.changes) && item.changes.length > 0 && item.changes.length <= 1024);
      assert.equal(item.status, started ? 'inProgress' : 'completed');
      return { id: item.id, type: item.type, changes: item.changes.map(change => {
        closed(change, ['path', 'kind', 'diff']); text(change.diff); closed(change.kind, ['type'], ['move_path']);
        assert.ok(['add', 'update', 'delete'].includes(change.kind.type)); assert.ok(change.kind.move_path === undefined || change.kind.move_path === null);
        return { path: safeEditPath(change.path), kind: change.kind.type, diff_digest: hash(change.diff) };
      }) };
    }
    if (item.type === 'agentMessage') {
      closed(item, ['id', 'type', 'text'], ['phase', 'delivery', 'memoryCitation', 'questions']); text(item.text);
      for (const key of ['delivery', 'memoryCitation', 'questions']) assert.ok(item[key] === undefined || item[key] === null);
      assert.ok(item.phase === undefined || item.phase === null || ['commentary', 'final_answer'].includes(item.phase));
      return { id: item.id, type: item.type, phase: item.phase ?? null, ...(started ? {} : { text_digest: hash(item.text), text_bytes: Buffer.byteLength(item.text) }) };
    }
    if (item.type === 'reasoning') {
      closed(item, ['id', 'type'], ['summary', 'content']);
      for (const key of ['summary', 'content']) if (item[key] !== undefined) { assert.ok(Array.isArray(item[key]) && item[key].length <= 1024); item[key].forEach(text); }
      return { id: item.id, type: item.type };
    }
    if (item.type === 'plan') { closed(item, ['id', 'type', 'text']); text(item.text); return { id: item.id, type: item.type }; }
    if (item.type === 'userMessage') {
      closed(item, ['id', 'type', 'content'], ['clientId']); assert.ok(item.clientId === undefined || item.clientId === null);
      assert.deepEqual(item.content, [{ type: 'text', text: input, text_elements: [] }]);
      return { id: item.id, type: item.type, input_digest: arm.stdin.digest };
    }
    throw new Error('unsupported item');
  };
  const accept = (message, raw) => {
    if (Object.hasOwn(message, 'id') && Object.hasOwn(message, 'method')) return stop('server_request_not_supported');
    if (Object.hasOwn(message, 'error')) return stop('rpc_error');
    // Only an exact idle status may follow terminal turn completion. No item,
    // delta or usage is accepted after the terminal boundary.
    if (message.method === 'thread/status/changed') {
      closed(message, ['method', 'params']); closed(message.params, ['threadId', 'status']);
      assert.equal(message.params.threadId, threadId); const status = message.params.status;
      assert.ok(object(status));
      if (status.type === 'idle') closed(status, ['type']);
      else { assert.ok(!turnCompleted); closed(status, ['type', 'activeFlags']); assert.equal(status.type, 'active'); assert.deepEqual(status.activeFlags, []); }
      return;
    }
    assert.ok(!turnCompleted, 'late event');
    if (Object.hasOwn(message, 'id')) {
      closed(message, ['id', 'result'], ['jsonrpc']); assert.ok(message.jsonrpc === undefined || message.jsonrpc === '2.0');
      if (stage === 'initialize' && message.id === 1) {
        closed(message.result, ['codexHome', 'platformFamily', 'platformOs', 'userAgent']);
        text(message.result.codexHome); text(message.result.userAgent);
        assert.ok(['unix', 'windows'].includes(message.result.platformFamily) && ['macos', 'linux', 'windows'].includes(message.result.platformOs));
        stage = 'thread'; send({ method: 'initialized' });
        send(threadRequest(plan, workspace)); return;
      }
      if (stage === 'thread' && message.id === 2) {
        const result = message.result;
        thread(result.thread); threadConfiguration = projectThreadConfiguration(result, plan, workspace);
        threadId = result.thread.id;
        replyRows.push({ line: lines, raw: Buffer.from(raw) });
        stage = 'turn'; send(turnRequest(plan, input, threadId)); return;
      }
      assert.ok(stage === 'turn' && message.id === 3); closed(message.result, ['turn']); turn(message.result.turn);
      assert.equal(message.result.turn.status, 'inProgress'); assert.deepEqual(message.result.turn.items, []);
      turnId = message.result.turn.id; replyRows.push({ line: lines, raw: Buffer.from(raw) }); stage = 'items'; return;
    }
    closed(message, ['method', 'params']); const params = message.params;
    if (message.method === 'thread/started') {
      assert.ok(stage === 'thread' || stage === 'turn'); assert.ok(!threadStarted); closed(params, ['thread']); thread(params.thread);
      if (threadId !== null) assert.equal(params.thread.id, threadId); threadStarted = params.thread.id; return;
    }
    assert.ok(stage === 'items');
    const deltas = { 'item/agentMessage/delta': ['agentMessage'], 'item/plan/delta': ['plan'],
      'item/commandExecution/outputDelta': ['commandExecution'], 'item/fileChange/outputDelta': ['fileChange'],
      'item/reasoning/textDelta': ['reasoning', 'contentIndex'], 'item/reasoning/summaryTextDelta': ['reasoning', 'summaryIndex'],
      'item/reasoning/summaryPartAdded': ['reasoning', 'summaryIndex'] };
    if (Object.hasOwn(deltas, message.method)) {
      const [type, index] = deltas[message.method], part = message.method === 'item/reasoning/summaryPartAdded';
      closed(params, ['threadId', 'turnId', 'itemId', ...(part ? [] : ['delta']), ...(index ? [index] : [])]); verifyIdentity(params);
      assert.equal(pending.get(params.itemId)?.item.type, type); if (!part) text(params.delta); if (index) integer(params[index]); return;
    }
    if (message.method === 'turn/diff/updated') { closed(params, ['threadId', 'turnId', 'diff']); verifyIdentity(params); text(params.diff); return; }
    if (message.method === 'turn/plan/updated') {
      closed(params, ['threadId', 'turnId', 'plan'], ['explanation']); verifyIdentity(params);
      assert.ok(params.explanation === undefined || params.explanation === null || typeof params.explanation === 'string');
      assert.ok(Array.isArray(params.plan) && params.plan.length <= 128);
      for (const step of params.plan) { closed(step, ['step', 'status']); text(step.step); assert.ok(['pending', 'inProgress', 'completed'].includes(step.status)); } return;
    }
    if (message.method === 'turn/started') {
      closed(params, ['threadId', 'turn']); assert.equal(params.threadId, threadId); turn(params.turn); assert.equal(params.turn.id, turnId);
      assert.equal(params.turn.status, 'inProgress'); assert.ok(!turnStarted); turnStarted = true; return;
    }
    if (message.method === 'thread/tokenUsage/updated') {
      closed(params, ['threadId', 'turnId', 'tokenUsage']); verifyIdentity(params);
      closed(params.tokenUsage, ['last', 'total'], ['modelContextWindow']);
      const project = value => {
        closed(value, ['inputTokens', 'outputTokens', 'cachedInputTokens', 'reasoningOutputTokens', 'totalTokens'], ['cacheWriteInputTokens']);
        Object.values(value).forEach(integer); assert.ok(value.cachedInputTokens <= value.inputTokens && value.reasoningOutputTokens <= value.outputTokens);
        return { ...value };
      };
      const next = { last: project(params.tokenUsage.last), total: project(params.tokenUsage.total) };
      if (usage) for (const key of Object.keys(usage.total)) assert.ok(next.total[key] >= usage.total[key]);
      usage = next; retainNative(raw); return;
    }
    if (['item/started', 'item/completed'].includes(message.method)) {
      assert.ok(turnStarted); const started = message.method === 'item/started', timeKey = started ? 'startedAtMs' : 'completedAtMs';
      closed(params, ['threadId', 'turnId', 'item', timeKey]); verifyIdentity(params); integer(params[timeKey]);
      const projection = itemProjection(params.item, started); assert.ok(!completed.has(projection.id));
      if (started) {
        assert.ok(!pending.has(projection.id)); pending.set(projection.id, { item: projection, line: lines, digest: hash(raw), at_ms: params[timeKey] });
      } else {
        const previous = pending.get(projection.id); assert.ok(previous && previous.item.type === projection.type && params[timeKey] >= previous.at_ms);
        if (projection.type === 'commandExecution') {
          for (const key of ['id', 'type', 'command', 'cwd', 'source', 'plugin_id', 'script_path', 'command_actions_digest']) assert.deepEqual(projection[key], previous.item[key]);
        }
        if (projection.type === 'fileChange') { assert.deepEqual(projection, previous.item); edits.push({ ...projection, completed_line: lines }); verificationInventory = null; }
        if (projection.type === 'agentMessage' && projection.phase !== 'commentary') { assert.equal(finalResponse, null); finalResponse = { digest: projection.text_digest, bytes: projection.text_bytes, item_id: projection.id }; }
        completed.set(projection.id, { ...projection, start_line: previous.line, completion_line: lines, start_digest: previous.digest, completion_digest: hash(raw) }); pending.delete(projection.id);
      }
      retainNative(raw);
      if (projection.type === 'commandExecution') {
        commandLines.push(raw.toString('utf8')); commandIndexes.push(lines);
        if (!started) {
          const lastEdit = Math.max(-1, ...edits.map(edit => edit.completed_line));
          const latest = arm.verification.map(check => [...completed.values()].filter(pair => pair.type === 'commandExecution' && pair.command === check.rendered_event_command).at(-1));
          if (latest.every(pair => pair && pair.status === 'completed' && pair.exit_code === 0 && pair.start_line > lastEdit)) {
            try { verificationInventory = inventoryUserTree(armRoot); } catch { stop('verification_snapshot_unavailable'); }
          }
        }
      }
      return;
    }
    assert.equal(message.method, 'turn/completed'); closed(params, ['threadId', 'turn']); assert.equal(params.threadId, threadId); turn(params.turn);
    assert.equal(params.turn.id, turnId); assert.equal(params.turn.status, 'completed'); assert.equal(pending.size, 0); assert.ok(finalResponse && turnStarted);
    if (threadStarted) assert.equal(threadStarted, threadId);
    // A retained turn summary must agree with the completed notifications; it is
    // not an independent source of missing item starts/completions.
    assert.deepEqual(params.turn.items.map(item => item.id), [...completed.keys()]);
    for (const item of params.turn.items) { const summary = itemProjection(item, false); for (const [key, value] of Object.entries(summary)) assert.deepEqual(value, completed.get(item.id)[key]); }
    retainNative(raw);
    try { terminalInventory = inventoryUserTree(armRoot); } catch { return stop('terminal_snapshot_unavailable'); }
    turnCompleted = true; stage = 'done'; channel.end();
  };
  const output = ({ stream, chunk }) => {
    if (stream === 'stdout') { stdoutHash.update(chunk); stdoutBytes += chunk.length; }
    if (failure) return;
    outputBytes += chunk.length; if (outputBytes > MAX_BYTES) return stop('output_limit');
    if (stream !== 'stdout') return stop('unexpected_stderr');
    wire = Buffer.concat([wire, chunk]);
    for (;;) {
      const end = wire.indexOf(10);
      if (end < 0) { if (wire.length > MAX_LINE) stop('line_limit'); return; }
      if (end > MAX_LINE || ++lines > MAX_EVENTS) return stop('event_limit');
      const raw = wire.subarray(0, end); wire = wire.subarray(end + 1);
      try { const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw); assert.ok(decoded.charCodeAt(0) !== 0xfeff); const message = parseJsonRejectDuplicateKeys(decoded); accept(message, raw);
        // Private native rows are retained only after their semantic validation.
 }
      catch { return stop('invalid_or_unsupported_protocol'); }
      if (failure) return;
    }
  };
  signal?.addEventListener('abort', interrupt, { once: true }); if (signal?.aborted) interrupt();
  let result;
  try {
    result = await executeCodexSession({ executable: plan.config.cli_bin, argv: ['app-server', '--listen', 'stdio://'], cwd: workspace,
      input: '', retainOutput: false, terminationScope: 'direct_child', timeoutMs, signal: controller.signal, onOutput: output,
      onStdinReady(value) { channel = value; send(initializeRequest()); } }, spawnProcess, runtime);
  } finally { signal?.removeEventListener('abort', interrupt); }
  const terminated = result.terminationConfirmed === true && !result.cleanupError;
  if (!failure && (!terminated || result.error || result.exitCode !== 0 || result.signal || result.outputLimited || !turnCompleted || wire.length)) failure = 'transport_or_lifecycle_incomplete';
  let verification = null;
  const latestAttempts = arm.verification.map(check => [...completed.values()].filter(pair => pair.type === 'commandExecution' && pair.command === check.rendered_event_command).at(-1));
  const selectedLines = new Set(latestAttempts.filter(Boolean).flatMap(pair => [pair.start_line, pair.completion_line]));
  const selectedCommands = commandLines.filter((_, index) => selectedLines.has(commandIndexes[index]));
  if (selectedCommands.length) verification = inspectSuppliedPrimaryAppServerVerification(plan.primary_execution_input, condition, Buffer.from(selectedCommands.join('\n') + '\n'), { threadId, turnId });
  if (!failure) {
    if (verification?.status !== 'supplied_verification_segment_complete' || latestAttempts.some(pair => !pair || pair.status !== 'completed' || pair.exit_code !== 0)) failure = 'verification_pairs_incomplete';
    const lastEdit = Math.max(-1, ...edits.map(edit => edit.completed_line));
    if (!failure && latestAttempts.some(pair => pair.start_line <= lastEdit)) failure = 'edit_after_verification';
  }
  try {
    finalInventory = inventoryUserTree(armRoot);
    if (terminalInventory && changed(terminalInventory, finalInventory).length) failure ??= 'post_turn_workspace_changed';
    if (verificationInventory && terminalInventory && changed(verificationInventory, terminalInventory).length) failure ??= 'unobserved_post_verification_edit';
    const differences = changed(before, finalInventory);
    if (differences.some(path => !mutable.has(path))) failure ??= 'scope_violation';
    const editPaths = new Set(edits.flatMap(edit => edit.changes.map(change => change.path)));
    if (differences.some(path => !editPaths.has(path))) failure ??= 'unobserved_candidate_edit';
    if (arm.work_products.some(product => !finalInventory[product.arm_relative_path])) failure ??= 'work_product_missing';
  } catch { failure ??= 'final_snapshot_unavailable'; }
  wire = Buffer.alloc(0);
  const projection = { kind: 'ask_primary_runtime_lineage_v2', contract: PRIMARY_RUNTIME_LINEAGE_CONTRACT, evidence_kind: 'synthetic', status: failure ? 'unavailable' : 'collected_synthetic', reason: failure,
    observed_stdout_digest: `sha256:${stdoutHash.digest('hex')}`, observed_stdout_bytes: stdoutBytes,
    semantic_replay_coverage: replayCoverage, condition, profile_id: binding.profile_id, run_id: binding.run_id, plan_digest: planDigest, binding_digest: binding.binding_digest, input_digest: arm.stdin.digest,
    thread_id: threadId, turn_id: turnId, requests, request_stream_digest: hash(requestBytes.join('')), native_configuration: threadConfiguration,
    native_reply_stream_digest: hash(Buffer.concat(replyRows.map(row => Buffer.concat([row.raw, Buffer.from('\n')])))),
    item_pairs: [...completed.values()], verification, edits, recorded_native_stream_digest: hash(Buffer.concat(nativeRows.map(row => Buffer.concat([row.raw, Buffer.from('\n')])))),
    final_response: finalResponse, usage, verification_snapshot_digest: verificationInventory === null ? null : canonicalDigest(verificationInventory),
    terminal_snapshot_digest: terminalInventory === null ? null : canonicalDigest(terminalInventory), final_snapshot_digest: finalInventory === null ? null : canonicalDigest(finalInventory),
    termination_confirmed: terminated, duration_ms: Number.isFinite(result.durationMs) && result.durationMs >= 0 ? result.durationMs : null,
    runtime_attestation: 'unknown', execution_authority: false, scoring_authority: false, quality: null, missing_runtime_evidence: [...missing] };
  const receipt = Object.freeze({ kind: 'ask_primary_runtime_lineage_owned_receipt_v2', evidence_kind: 'synthetic' });
  owned.set(receipt, { projection, binding, plan: structuredClone(plan), input, armRoot, before, finalInventory, retained, sourceDigests, fixedTrees, nativeRows, replyRows, requestBytes, itemProjection, inventoryUserTree });
  return receipt;
}

/** Same-process custody only. Serialized receipts/hashes are not issuers. */
export function verifyPrimaryRuntimeLineageReceipt(receipt) {
  assert.ok(receipt && owned.has(receipt), 'owned runtime receipt required; serialized or supplied evidence refused');
  const record = owned.get(receipt), current = buildPrimaryRuntimeV10Binding({ plan: record.plan, planDigest: record.projection.plan_digest });
  assert.deepEqual(current, record.binding);
  assert.equal(hash(record.input), record.binding.conditions[record.projection.condition].stdin.digest);
  for (const [path, digest] of Object.entries(record.retained)) assert.equal(hash(read(path)), digest, 'retained runtime plan/input changed');
  for (const [path, digest] of Object.entries(record.sourceDigests)) assert.equal(hash(read(join(SOURCE_ROOT, path))), digest, 'runtime source changed');
  for (const [root, inventory] of Object.entries(record.fixedTrees)) assert.deepEqual(record.inventoryUserTree(root), inventory, 'prepared source/baseline changed');
  assert.equal(hash(record.requestBytes.join('')), record.projection.request_stream_digest);
  assert.equal(hash(Buffer.concat(record.replyRows.map(row => Buffer.concat([row.raw, Buffer.from('\n')])))), record.projection.native_reply_stream_digest);
  // Replay the accepted native replies independently of the parser's cached
  // configuration. Initialize private fields are deliberately not retained.
  let nativeConfiguration = null, threadId = null, turnId = null;
  for (const [index, row] of record.replyRows.entries()) {
    const message = parseJsonRejectDuplicateKeys(new TextDecoder('utf-8', { fatal: true }).decode(row.raw));
    closed(message, ['id', 'result'], ['jsonrpc']); assert.ok(message.jsonrpc === undefined || message.jsonrpc === '2.0');
    if (index === 0) {
      assert.equal(message.id, 2); nativeConfiguration = projectThreadConfiguration(message.result, record.plan, current.conditions[record.projection.condition].launch_cwd);
      threadId = message.result.thread.id;
    } else {
      assert.equal(index, 1); assert.equal(message.id, 3); closed(message.result, ['turn']);
      const turn = message.result.turn; closed(turn, ['id', 'items', 'status'], ['error', 'itemsView', 'rootTurnId', 'startedAt', 'completedAt', 'durationMs']);
      assert.ok(turn.error === undefined || turn.error === null); identifier(turn.id); assert.equal(turn.status, 'inProgress'); assert.deepEqual(turn.items, []); turnId = turn.id;
    }
  }
  assert.deepEqual(nativeConfiguration, record.projection.native_configuration); assert.equal(threadId, record.projection.thread_id); assert.equal(turnId, record.projection.turn_id);
  const expectedRequests = [initializeRequest(), { method: 'initialized' }, threadRequest(record.plan, current.conditions[record.projection.condition].launch_cwd), turnRequest(record.plan, record.input, threadId)];
  assert.ok(record.requestBytes.length >= 0 && record.requestBytes.length <= 4);
  if (threadId !== null) assert.equal(record.requestBytes.length, 4);
  if (record.projection.status === 'collected_synthetic') { assert.equal(record.requestBytes.length, 4); assert.equal(record.replyRows.length, 2); }
  assert.deepEqual(record.requestBytes.map(raw => parseJsonRejectDuplicateKeys(raw)), expectedRequests.slice(0, record.requestBytes.length));
  assert.deepEqual(record.requestBytes.map(raw => { const message = parseJsonRejectDuplicateKeys(raw); return { method: message.method, ...(Object.hasOwn(message, 'id') ? { id: message.id } : {}), digest: hash(raw) }; }), record.projection.requests);
  assert.equal(record.projection.kind, 'ask_primary_runtime_lineage_v2'); assert.equal(record.projection.contract, PRIMARY_RUNTIME_LINEAGE_CONTRACT);
  assert.equal(record.projection.semantic_replay_coverage, replayCoverage);
  assert.equal(hash(Buffer.concat(record.nativeRows.map(row => Buffer.concat([row.raw, Buffer.from('\n')])))), record.projection.recorded_native_stream_digest);
  // Independently rebuild paired native observations from privately retained bytes.
  // The live parser's cached projections are never their own replay authority.
  const pending = new Map(), pairs = [], edits = []; let response = null, usage = null;
  for (const row of record.nativeRows) {
    const message = parseJsonRejectDuplicateKeys(new TextDecoder('utf-8', { fatal: true }).decode(row.raw)), params = message.params;
    assert.equal(params.threadId, record.projection.thread_id);
    if (message.method === 'thread/tokenUsage/updated') { assert.equal(params.turnId, record.projection.turn_id); usage = { last: { ...params.tokenUsage.last }, total: { ...params.tokenUsage.total } }; continue; }
    if (message.method === 'turn/completed') {
      assert.equal(params.turn.id, record.projection.turn_id); assert.equal(params.turn.status, 'completed'); assert.equal(pending.size, 0);
      assert.deepEqual(params.turn.items.map(item => item.id), pairs.map(item => item.id));
      for (const item of params.turn.items) for (const [key, value] of Object.entries(record.itemProjection(item, false))) assert.deepEqual(value, pairs.find(pair => pair.id === item.id)[key]);
      continue;
    }
    assert.equal(params.turnId, record.projection.turn_id);
    const started = message.method === 'item/started', item = record.itemProjection(params.item, started);
    if (started) { assert.ok(!pending.has(item.id) && !pairs.some(pair => pair.id === item.id)); pending.set(item.id, { item, line: row.line, digest: hash(row.raw), at_ms: params.startedAtMs }); continue; }
    assert.equal(message.method, 'item/completed'); const start = pending.get(item.id); assert.ok(start); assert.ok(params.completedAtMs >= start.at_ms);
    assert.equal(start.item.type, item.type);
    if (item.type === 'commandExecution') for (const key of ['id', 'type', 'command', 'cwd', 'source', 'plugin_id', 'script_path', 'command_actions_digest']) assert.deepEqual(item[key], start.item[key]);
    if (item.type === 'fileChange') assert.deepEqual(item, start.item);
    const pair = { ...item, start_line: start.line, completion_line: row.line, start_digest: start.digest, completion_digest: hash(row.raw) };
    pairs.push(pair); pending.delete(item.id);
    if (item.type === 'fileChange') edits.push({ ...item, completed_line: row.line });
    if (item.type === 'agentMessage' && item.phase !== 'commentary') response = { digest: item.text_digest, bytes: item.text_bytes, item_id: item.id };
  }
  assert.deepEqual(pairs, record.projection.item_pairs); assert.deepEqual(edits, record.projection.edits);
  assert.deepEqual(response, record.projection.final_response); assert.deepEqual(usage, record.projection.usage);
  if (record.finalInventory !== null) assert.deepEqual(record.inventoryUserTree(record.armRoot), record.finalInventory, 'final runtime workspace changed');
  return publicResult(record.projection);
}

/** Validate producer placement before any mkdir/write. No protected input tree can
 * be its own diagnostic output; normal realpath checks run in the producer. */
export function assertPrimaryRuntimeLineageOutput(receipt, outputRoot) {
  assert.ok(owned.has(receipt), 'owned runtime receipt required'); const record = owned.get(receipt), target = resolve(outputRoot);
  for (const root of [SOURCE_ROOT, record.plan.root, ...Object.keys(record.fixedTrees)]) {
    const below = relative(resolve(root), target), above = relative(target, resolve(root));
    assert.ok(below && (below.startsWith('..' + posix.sep) || isAbsolute(below)) && above && (above.startsWith('..' + posix.sep) || isAbsolute(above)), 'runtime producer output overlaps retained input/source');
  }
}
