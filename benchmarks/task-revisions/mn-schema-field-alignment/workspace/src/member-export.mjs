export function exportMember(member) {
  return { memberId: member.memberId, displayName: member.displayName, enabled: member.enabled ?? true };
}
