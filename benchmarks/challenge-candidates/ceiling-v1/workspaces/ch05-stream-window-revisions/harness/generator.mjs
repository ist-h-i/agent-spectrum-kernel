const decimalString = String;
export function* steadyLoad(recipe) {
  for (let round = 0; round < recipe.steadyRounds; round++) {
    for (let tenant = 0; tenant < recipe.tenants; tenant++) {
      const tenantId = `tenant-${tenant}`;
      for (let revision = 0; revision < recipe.revisionsPerId; revision++) {
        for (let id = 0; id < recipe.idsPerTenantPerRound; id++) {
          yield { tenantId, eventId: `${round}:${id}`, revision, eventTime: round * recipe.windowSize + id,
            amountMinor: decimalString((id + 1) * (revision + 1)), deleted: revision === 2 && id % 7 === 0 };
        }
      }
      yield { kind: 'watermark', tenantId, value: (round + 1) * recipe.windowSize + recipe.allowedLateness };
    }
  }
}

export function* activeGrowthLoad(recipe) {
  for (let id = 0; id < recipe.activeGrowthIdsPerTenant; id++) {
    for (let tenant = 0; tenant < recipe.tenants; tenant++) {
      yield { tenantId: `tenant-${tenant}`, eventId: decimalString(id), revision: 0,
        eventTime: id * recipe.windowSize, amountMinor: decimalString(id + 1), deleted: false };
    }
  }
}
