// Bounded public-prose recognition. No scoring, I/O, private cases or grants.
// A future private consumer owns adoption and its independently fixed version.
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
export const PUBLIC_REVIEW_RECOGNITION_REVISION = '2';

function classifyTargetRequirementV1(actionText, target) {
  if (typeof actionText !== 'string' || !actionText.trim() || actionText.length > 8192
    || !Array.isArray(target?.aliases) || !target.aliases.length || target.aliases.length > 8
    || target.aliases.some(value => typeof value !== 'string' || !value.trim() || value.length > 80)) return 'unknown';
  // Proposals, quotations and conditions are not unconditional requirements.
  if (/["'`>?？]/u.test(actionText) || /\b(?:if|unless|may|might|could|would|consider|suggest|example)\b|(?:場合|もし|提案|例示)/iu.test(actionText)) return 'unknown';
  const aliases = '(?:' + target.aliases.map(escapeRegex).join('|') + ')';
  const subject = '(?:the\\s+)?' + aliases;
  const required = [
    new RegExp('^require\\s+' + subject + '(?:\\s+to\\s+(?:pass|succeed))?(?:\\s+before\\s+(?:merge|merging))?$', 'iu'),
    new RegExp('^(?:fix|repair)\\s+' + subject + '\\s+(?:before\\s+(?:merge|merging)|to\\s+(?:merge|unblock\\s+merge))$', 'iu'),
    new RegExp('^' + subject + '\\s+must\\s+(?:pass|succeed|be\\s+fixed)(?:\\s+before\\s+(?:merge|merging))?$', 'iu'),
    new RegExp('^' + aliases + '(?:の成功)?をマージの必須条件にする$', 'u'),
  ];
  const optional = [
    new RegExp('^(?:keep|leave)\\s+' + subject + '\\s+(?:non-blocking|nonblocking|optional)$', 'iu'),
    new RegExp('^' + subject + '\\s+(?:(?:is|remains)\\s+(?:optional|non-blocking|nonblocking|not\\s+required)|need\\s+not\\s+(?:pass|succeed))$', 'iu'),
    new RegExp('^(?:do\\s+not|never)\\s+require\\s+' + subject + '(?:\\s+before\\s+(?:merge|merging))?$', 'iu'),
    new RegExp('^' + aliases + 'は(?:必須ではない|任意|非blocking)$', 'u'),
  ];
  const states = new Set();
  const mentionsTarget = new RegExp(aliases, 'iu');
  for (const clause of actionText.split(/[.!?;。；\n]+/u).map(value => value.trim()).filter(Boolean)) {
    const positive = required.some(pattern => pattern.test(clause));
    const negative = optional.some(pattern => pattern.test(clause));
    if (mentionsTarget.test(clause) && !positive && !negative) return 'unknown';
    if (positive) states.add('required');
    if (negative) states.add('not_required');
  }
  return states.size === 1 ? [...states][0] : 'unknown';
}

function literalTarget(text, target) {
  if (typeof text !== 'string' || !text.trim() || text.length > 8192
    || !Array.isArray(target?.aliases) || !target.aliases.length || target.aliases.length > 8
    || target.aliases.some(value => typeof value !== 'string' || !value.trim() || value.length > 80)) return null;
  const alternatives = target.aliases.map(escapeRegex).join('|');
  return new RegExp('(?<![\\p{L}\\p{N}_])(?:' + alternatives + ')(?![\\p{L}\\p{N}_])', 'giu');
}

// Keep identifier/path/decimal dots. A dot within event.preventDefault() is not
// a sentence boundary. This is bounded text tokenization, never code execution.
function proseClauses(text) {
  const clauses = []; let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '.' && /[\p{L}\p{N}_/]/u.test(text[i - 1] ?? '') && /[\p{L}\p{N}_/]/u.test(text[i + 1] ?? '')) continue;
    if (!/[.;!?。；\n]/u.test(c)) continue;
    const clause = text.slice(start, i).trim(); if (clause) clauses.push(clause);
    start = i + 1;
  }
  const tail = text.slice(start).trim(); if (tail) clauses.push(tail);
  return clauses;
}

// Do not discard arbitrary targetless prose: a prefix, correction or quotation
// can qualify the next/previous sentence across a newline. Only these bounded,
// explicitly independent source/presentation notes may accompany a statement.
// Unknown vocabulary stays Unknown rather than being assumed irrelevant.
function independentExplanationClause(clause) {
  const source = '(?:the )?(?:synthetic )?(?:source(?: code)?|code|implementation)';
  const count = '(?:one|two|three|four|five|six|seven|eight|nine|ten|[1-9][0-9]{0,2})';
  const structure = '(?:handlers?|listeners?|functions?|modules?|files?|parameters?|imports?)';
  return new RegExp('^' + source + ' (?:has ' + count + ' ' + structure + '|was inspected)$', 'iu').test(clause)
    || /^preserve (?:the )?(?:synthetic )?(?:label|focus order|layout|spacing|names?)$/iu.test(clause);
}

export function classifyTargetRequirement(actionText, target, { revision = '1' } = {}) {
  if (revision === '1') return classifyTargetRequirementV1(actionText, target);
  if (revision !== '2') return 'unknown';
  const pattern = literalTarget(actionText, target);
  if (!pattern || /["'`>“”‘’«»?？]/u.test(actionText)) return 'unknown';
  const states = new Set();
  for (const clause of proseClauses(actionText)) {
    pattern.lastIndex = 0;
    if (!pattern.test(clause)) {
      if (!independentExplanationClause(clause)) return 'unknown';
      continue;
    }
    pattern.lastIndex = 0;
    const masked = clause.replace(pattern, 'ask_target');
    const state = /^call ask_target$/iu.test(masked) ? 'required'
      : classifyTargetRequirementV1(masked, { aliases: ['ask_target'] });
    if (state === 'unknown') return 'unknown';
    states.add(state);
  }
  return states.size === 1 ? [...states][0] : 'unknown';
}

// Classify an assertion, not its truth. A consumer must compare it with its
// independently established facts and preserve Unknown; state labels cannot
// provide those facts. This function knows no fixture answers or score rules.
export function classifyObservedVerification(conclusion, target, { revision = PUBLIC_REVIEW_RECOGNITION_REVISION } = {}) {
  if (revision !== PUBLIC_REVIEW_RECOGNITION_REVISION) return 'unknown';
  const pattern = literalTarget(conclusion, target);
  if (!pattern || /["'`>“”‘’«»?？]/u.test(conclusion)) return 'unknown';
  const states = new Set();
  for (const clause of proseClauses(conclusion)) {
    pattern.lastIndex = 0;
    if (!pattern.test(clause)) {
      if (!independentExplanationClause(clause)) return 'unknown';
      continue;
    }
    pattern.lastIndex = 0;
    const masked = clause.replace(pattern, 'ask_target').replace(/^(?:Verified|Observed):\s*/iu, '').trim();
    const result = /^(?:the )?ask_target (passed|succeeded|failed)$/iu.exec(masked);
    const absent = /^(?:the )?ask_target (?:was|were) not (?:run|executed)$/iu.test(masked);
    if (result) states.add(result[1].toLowerCase() === 'failed' ? 'failed' : 'passed');
    else if (absent) states.add('incomplete');
    else return 'unknown';
  }
  return states.size === 1 ? [...states][0] : 'unknown';
}
