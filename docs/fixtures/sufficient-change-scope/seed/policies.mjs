export function isInvoiceReminderDue(daysOverdue) {
  return daysOverdue >= 30;
}

export function isDraftDeletionDue(daysInactive) {
  return daysInactive >= 30;
}
