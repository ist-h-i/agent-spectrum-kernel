import { createHash, timingSafeEqual } from 'node:crypto';

export function hashRefreshToken(rawToken) {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function sameDigest(left, right) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
