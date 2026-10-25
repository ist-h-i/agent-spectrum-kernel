export const decimals = { USD: 2, JPY: 0 };

export function toV2(value) {
  if (value === null) return null;
  const scale = decimals[value.currency];
  if (scale === undefined || !/^\d+(\.\d+)?$/.test(value.price)) throw new Error('invalid-money');
  return { amountMinor: String(Math.round(Number(value.price) * 10 ** scale)), currency: value.currency, taxMode: 'included' };
}

export function toV1(value) {
  if (value === null) return null;
  const scale = decimals[value.currency];
  return { price: (Number(value.amountMinor) / 10 ** scale).toFixed(scale), currency: value.currency };
}
