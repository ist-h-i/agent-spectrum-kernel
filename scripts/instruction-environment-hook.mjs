#!/usr/bin/env node
// Optional local Claude hook. The caller explicitly installs this command and
// supplies its reviewed config; default ASK hooks/telemetry are unchanged.
import { readFileSync } from 'node:fs';
import { readJsonFileStrict, parseJsonRejectDuplicateKeys } from './content-addressed-store.mjs';
import { importSkillUsageEvidence } from './skill-usage-evidence.mjs';
try {
  const config = readJsonFileStrict(process.argv[2], 'local Skill hook configuration');
  if (config.enabled === true) {
    const bytes = readFileSync(0);
    if (bytes.length > 256 * 1024) throw new Error('oversize');
    const event = parseJsonRejectDuplicateKeys(bytes.toString('utf8'), 'local Skill hook');
    if (['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].includes(event.hook_event_name) && event.tool_name === 'Skill'
      || event.hook_event_name === 'UserPromptExpansion' && event.expansion_type === 'slash_command') {
      importSkillUsageEvidence({ ...config, input: [event], captureState: 'available', selfReportedSkillIds: null });
    }
  }
} catch {
  process.stderr.write('ASK Skill hook: evidence unavailable; task outcome unchanged.\n');
}
// Hook collection is always non-blocking and emits no decision or context.
