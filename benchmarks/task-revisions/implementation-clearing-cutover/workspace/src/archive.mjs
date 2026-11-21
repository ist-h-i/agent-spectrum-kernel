import { fromMajor } from './money.mjs';

export function iso(compact) {
  return compact.slice(0, 4) + '-' + compact.slice(4, 6) + '-' + compact.slice(6);
}

export function tapeTicket(row) {
  return {office: row.branch, day: iso(row.issueDate), serial: String(Number(row.slip))};
}

export function orderKey(ticket) {
  return ticket.office + '/' + ticket.serial;
}

export function restore(snapshot) {
  if (snapshot.format === 2) return structuredClone(snapshot);
  const book = {
    format: 2,
    firstOpen: snapshot.firstOpen,
    tariffs: structuredClone(snapshot.tariffs),
    cash: Object.fromEntries(Object.entries(snapshot.balances).map(([account, balance]) => [account, fromMajor(balance)])),
    cards: {},
    positions: {...snapshot.feeds},
    lines: []
  };
  for (const card of snapshot.cards) {
    const ticket = tapeTicket(card);
    book.cards[orderKey(ticket)] = {
      ticket, from: card.source, to: card.destination, limit: fromMajor(card.face),
      plan: card.plan, gross: '0', final: false, revision: 0
    };
  }
  for (const row of snapshot.advice) {
    const card = book.cards[orderKey(tapeTicket(row))];
    card.gross = String(BigInt(card.gross) + BigInt(fromMajor(row.movement)));
    card.revision = row.edition;
    card.final = row.release === 'Y';
  }
  for (const row of snapshot.lines) {
    book.lines.push({
      account: row.account, posted: iso(row.postingDate),
      entry: {ticket: tapeTicket(row), revision: row.edition, valueDay: iso(row.valueDate), movement: fromMajor(row.movement)}
    });
  }
  return book;
}
