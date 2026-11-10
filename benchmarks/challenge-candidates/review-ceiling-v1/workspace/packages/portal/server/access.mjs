import { memberships, teams } from "./fixtures.mjs";
import { requireValue } from "./errors.mjs";
export function teamAccess(userId, teamId, write = false) {
  const role = memberships[userId]?.[teamId];
  requireValue(role, 403, "No access to this team");
  requireValue(
    !write || role === "maintainer",
    403,
    "Maintainer role required",
  );
  return role;
}
export function visibleTeams(userId) {
  return teams
    .filter((t) => memberships[userId]?.[t.id])
    .map((t) => ({ ...t, role: memberships[userId][t.id] }));
}
