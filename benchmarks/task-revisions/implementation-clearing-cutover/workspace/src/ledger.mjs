import { orderKey, restore } from './archive.mjs';
import { ingest } from './clearing.mjs';

export function openBook(snapshot) {
  const book = restore(snapshot);

  function balance(account) {
    const reserved = Object.values(book.cards)
      .filter(card => card.from === account && !card.final)
      .reduce((sum, card) => sum + BigInt(card.limit) - BigInt(card.gross), 0n);
    return {posted: book.cash[account], available: String(BigInt(book.cash[account]) - reserved)};
  }

  function place(order) {
    const key = orderKey(order.ticket);
    const existing = book.cards[key];
    if (existing) {
      return existing.from === order.from && existing.to === order.to && existing.limit === order.limit
        ? 'replayed' : 'conflict';
    }
    if (BigInt(balance(order.from).available) < BigInt(order.limit)) return 'unfunded';
    const plan = book.tariffs.filter(plan => plan.from <= order.ticket.day).at(-1);
    book.cards[key] = {...structuredClone(order), plan: plan.code, gross: '0', revision: 0, final: false};
    return 'opened';
  }

  return {
    place, balance,
    receive: page => ingest(book, page),
    turn(firstOpen) { book.firstOpen = firstOpen; },
    statement(account, day) {
      return book.lines.filter(row => row.account === account && row.posted === day).map(row => structuredClone(row.entry));
    },
    dump() { return structuredClone(book); }
  };
}
