// Synthetic fixture values only. IDs are local to a team, like core run IDs.
export const teams = [
  { id: "alpha", name: "Atlas Platform" },
  { id: "beta", name: "Beacon Experience" },
];
export const memberships = {
  alex: { alpha: "maintainer", beta: "maintainer" },
  blair: { alpha: "reader" },
  casey: { beta: "maintainer" },
};
export function seedReviews(count = 18) {
  return teams.flatMap((team, teamIndex) =>
    Array.from({ length: count }, (_, i) => ({
      id: `review-${String(i + 1).padStart(3, "0")}`,
      teamId: team.id,
      title:
        [
          "Slow queue hydration",
          "Fast artifact rendering",
          "Preserve review evidence",
          "Tighten response normalization",
          "Refresh local test catalog",
          "Validate plan readiness",
        ][i % 6] + ` ${i + 1}`,
      repository: `synthetic/${team.id}-console`,
      pullRequest: 101 + i,
      headSha: `${teamIndex + 1}${String(i + 1).padStart(39, "0")}`,
      status: i % 5 === 0 ? "approved" : i % 7 === 0 ? "published" : "open",
      version: 1,
      updatedAt: new Date(Date.UTC(2026, 10, 1, 12, 0, i)).toISOString(),
      summary: `${team.name}: review of the response/import workflow.`,
      findings: [
        {
          id: `finding-${i + 1}`,
          title: "Preserve response context",
          category: "bug-risk",
          severity:
            team.id === "alpha" && i === 17
              ? "critical"
              : i % 3 === 0
                ? "major"
                : "minor",
          summary: `${team.name} inspection of response conversion`,
          evidence: `Synthetic ${team.id} fixture at src/response.ts:${20 + i}`,
          recommendation:
            "Retain the evidence when exporting the normalized response.",
        },
      ],
      legacy: {
        structured: true,
        requiresUserEdit: i === 2,
        warnings: i === 2 ? ["Response needed manual reconciliation."] : [],
        actionPlan: [
          {
            id: `action-${i + 1}`,
            title: "Inspect response conversion",
            priority: "P1",
            steps: ["Read response evidence", "Run focused checks"],
          },
        ],
        replyDrafts: [],
        ruleCandidates: [],
        knowledgeCandidates: [],
      },
      history: [
        {
          type: "imported",
          actor: "fixture",
          at: "2026-11-01T12:00:00.000Z",
          version: 1,
        },
      ],
    })),
  );
}
