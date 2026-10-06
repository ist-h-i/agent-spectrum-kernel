import { AsyncLocalStorage } from 'node:async_hooks';
import { verifyCoreCaptureProducer } from './ask-core-capture-producer.mjs';
import { verifyPublicEvaluatorReference } from './ask-benchmark-evaluator-boundary.mjs';
import { join } from 'node:path';

const scope = new AsyncLocalStorage();
export function activeCoreProducer() {
  const state = scope.getStore();
  return state?.active ? true : null;
}

/** A schema/derived-evidence scope, never execution, private-read or admission authority. */
export function withCoreCaptureProducer(options, callback) {
  const verified = verifyCoreCaptureProducer(options);
  const state = { active: true, options: Object.freeze({ ...options }), verified };
  return scope.run(state, () => {
    try {
      const result = callback(verified);
      if (result && typeof result.then === 'function') throw new Error('core_producer_async_scope_forbidden');
      return result;
    } finally { state.active = false; }
  });
}

export function coreProducerInspection(options) {
  const state = scope.getStore();
  if (!state?.active) return null;
  const verified = verifyCoreCaptureProducer(state.options);
  for (const key of ['planPath', 'materializedPath', 'selectionState', 'runDir']) {
    if (options[key] !== verified.executionOptions[key]) throw new Error('core_producer_execution_path_changed');
  }
  if (options.root !== verified.executionOptions.root) {
    // Only the original frozen public source is an alternate helper root.
    verifyPublicEvaluatorReference({ root: options.root, referencePath: join(verified.executionOptions.root, verified.capture.evaluator_reference.path) });
  }
  if (options.config !== null) throw new Error('core_producer_legacy_config_refused');
  return verified.inspection;
}
