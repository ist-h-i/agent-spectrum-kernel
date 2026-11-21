import { iso, orderKey, tapeTicket } from './archive.mjs';
import { charge, fromMajor } from './money.mjs';

function readAdvice(codec, row, card) {
  if (codec === 'json') return row;
  return {
    ticket: tapeTicket(row), revision: row.edition,
    gross: String(BigInt(card.gross) + BigInt(fromMajor(row.movement))),
    final: row.release === 'Y', valueDay: iso(row.valueDate)
  };
}

function bookAdvice(book, card, advice) {
  if (advice.revision <= card.revision) return 'ok';
  const gross = BigInt(advice.gross);
  if (gross < 0n || gross > BigInt(card.limit)) return 'rejected';
  const delta = gross - BigInt(card.gross);
  const plan = book.tariffs.find(plan => plan.code === card.plan);
  const feeDelta = charge(plan, gross) - charge(plan, BigInt(card.gross));
  for (const [account, movement] of [[card.from, -delta], [card.to, delta - feeDelta], [plan.collector, feeDelta]]) {
    if (movement === 0n) continue;
    book.cash[account] = String(BigInt(book.cash[account]) + movement);
    book.lines.push({
      account, posted: advice.valueDay,
      entry: {ticket: structuredClone(card.ticket), revision: advice.revision, valueDay: advice.valueDay, movement: String(movement)}
    });
  }
  Object.assign(card, {gross: advice.gross, revision: advice.revision, final: advice.final});
  return 'ok';
}

export function ingest(book, page) {
  let through = book.positions[page.feed] ?? 0;
  if (page.after > through) return {status: 'gap', through};
  for (const [i, row] of page.rows.entries()) {
    const position = page.after + i + 1;
    if (position <= through) continue;
    const ticket = page.codec === 'json' ? row.ticket : tapeTicket(row);
    const card = book.cards[orderKey(ticket)];
    if (!card) return {status: 'waiting', through};
    const status = bookAdvice(book, card, readAdvice(page.codec, row, card));
    if (status !== 'ok') return {status, through};
    through = position;
    book.positions[page.feed] = through;
  }
  return {status: 'ok', through};
}
