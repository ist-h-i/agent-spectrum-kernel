// Closed, text-only diagnostic classes. They grant no execution permission and
// do not establish an OS failure, syscall, source actor or runtime authority.
const PATH_WARNING = 'WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted (os error 1)';
const LIMIT = 4096;
const RULES = Object.freeze([
  ['arg0_cleanup_warning', 'WARNING: failed to clean up stale arg0 temp dirs: ', 'known_nonfatal_warning'],
  ['sqlite_state_runtime_error', 'Error: failed to initialize sqlite state runtime under ', 'startup_error_text'],
  ['config_overrides_error', 'Error: error parsing -c overrides: ', 'startup_error_text'],
  ['default_config_error', 'Error: error loading default config after config error: ', 'startup_error_text'],
  ['otel_configuration_error', 'Error: error loading otel config: ', 'startup_error_text'],
].map(Object.freeze));
const unknown = () => ({ kind: 'unknown', severity: 'unclassified', os_error_text: 'not_classified' });
export function classifyPrimaryStderrLine(line) {
  if (typeof line !== 'string' || !line.length || Buffer.byteLength(line) > LIMIT || /[\u0000-\u001f\u007f]/u.test(line)) return unknown();
  if (line === PATH_WARNING) return { kind: 'path_alias_warning', severity: 'known_nonfatal_warning', os_error_text: 'permission_text' };
  for (const [kind, prefix, severity] of RULES) if (line.startsWith(prefix) && line.length > prefix.length) {
    return { kind, severity, os_error_text: /\(os error (?:1|13)\)$/u.test(line) ? 'permission_text'
      : /\(os error 2\)$/u.test(line) ? 'missing_resource_text' : 'not_classified' };
  }
  return unknown();
}
export function createPrimaryStderrDiagnostics() {
  let pending = Buffer.alloc(0), reason = null, warningCount = 0, bytes = 0;
  const records = [];
  const prefixes = [PATH_WARNING, ...RULES.map(rule => rule[1])].map(value => Buffer.from(value));
  const refuse = (code, value = unknown()) => { if (!reason) { reason = code; records.push(value); pending = Buffer.alloc(0); } return reason; };
  const complete = raw => {
    let line;
    try { line = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
    catch { return refuse('stderr_invalid_encoding'); }
    const value = classifyPrimaryStderrLine(line);
    if (value.kind === 'path_alias_warning') {
      warningCount++;
      if (warningCount > 1) return refuse('stderr_known_warning_repeat', value);
      records.push(value); return null;
    }
    return refuse(value.severity === 'startup_error_text' ? 'stderr_startup_error'
      : value.severity === 'known_nonfatal_warning' ? 'stderr_known_warning_requires_review' : 'stderr_unknown', value);
  };
  return Object.freeze({
    push(chunk) {
      if (reason) return reason;
      if (!Buffer.isBuffer(chunk)) return refuse('stderr_unknown');
      bytes += chunk.length;
      if (bytes > 64 * 1024) return refuse('stderr_limit');
      for (let offset = 0; offset < chunk.length;) {
        const newline = chunk.indexOf(10, offset), end = newline < 0 ? chunk.length : newline;
        if (pending.length + end - offset > LIMIT) return refuse('stderr_limit');
        pending = Buffer.concat([pending, chunk.subarray(offset, end)]);
        if (newline >= 0) {
          const raw = pending; pending = Buffer.alloc(0); const stopped = complete(raw);
          if (stopped) return stopped;
          offset = end + 1;
        } else {
          // Match only the finite ASCII prefixes while a line is incomplete;
          // UTF8 in an unexported dynamic tail is decoded only at newline.
          if (!prefixes.some(prefix => { const size = Math.min(prefix.length, pending.length);
            return prefix.subarray(0, size).equals(pending.subarray(0, size)); })) return refuse('stderr_unknown');
          break;
        }
      }
      return null;
    },
    finish() { return reason ?? (pending.length ? refuse('stderr_unterminated') : null); },
    summary() { return { policy: 'closed_stderr_diagnostics_v2', records: records.map(value => ({ ...value })),
      path_alias_warning_count: warningCount, raw_values_exported: false }; },
  });
}
