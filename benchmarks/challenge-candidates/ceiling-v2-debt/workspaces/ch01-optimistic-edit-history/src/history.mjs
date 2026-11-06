export class EditHistory {
  entries = [];
  record(operation) { this.entries.push(operation); }
  latest(rowId) { return this.entries.findLast(e => e.rowId === rowId && !e.undone); }
}
