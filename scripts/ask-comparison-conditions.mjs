// Separate actual condition identity; the original v1 renderer/selector stays unchanged.
import { comparisonConditions as legacyConditions, KERNEL_PRINCIPLES_ID } from './kernel-principles.mjs';
import { KERNEL_PRINCIPLES_V2_ID } from './kernel-principles-v2.mjs';
export function comparisonConditions(kernelCondition) {
  return kernelCondition === KERNEL_PRINCIPLES_V2_ID
    ? ['plain', KERNEL_PRINCIPLES_V2_ID, 'full_ask'] : legacyConditions(kernelCondition);
}
export const isKernelPrinciplesCondition = id => id === KERNEL_PRINCIPLES_ID || id === KERNEL_PRINCIPLES_V2_ID;
