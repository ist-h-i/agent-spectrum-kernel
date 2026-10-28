export function evaluate(policy, request) {
  if (!policy?.users.includes(request.user) || !policy.resources[request.resource]) return false;
  return policy.rules.some(rule => rule.subject === `user:${request.user}` && rule.resource === request.resource && rule.action === request.action && rule.effect === 'allow');
}
