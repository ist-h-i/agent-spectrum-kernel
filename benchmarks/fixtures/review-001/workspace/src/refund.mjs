export function canApproveRefund(user, amount, limit = 1000) {
  if (!user?.roles?.includes("manager")) return false;
  if (!Number.isFinite(amount) || amount <= 0) return false;

  return amount <= limit;
}
