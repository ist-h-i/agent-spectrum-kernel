// Bounded public-prose recognition. No scoring, I/O, private cases or grants.
// A future private consumer owns adoption and its independently fixed version.
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export function classifyTargetRequirement(actionText, target) {
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
