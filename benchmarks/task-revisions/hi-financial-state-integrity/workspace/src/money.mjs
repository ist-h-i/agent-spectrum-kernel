export const wire = value => String(value);

export function fromMajor(value) {
  return String(Math.round(Number(value) * 100));
}

// The branch gateway originally supplied a single rate on each plan.
export function charge(plan, gross) {
  const firstRate = plan.bands[0].bps;
  return BigInt(Math.min(Number(plan.ceiling), Math.round(Number(gross) * firstRate / 10000)));
}
