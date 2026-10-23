export function reserveOnline({ partySize, availableSeats }) {
  if (partySize < 1) return { accepted: false, reason: "invalid_party_size" };
  if (partySize > availableSeats) return { accepted: false, reason: "insufficient_capacity" };
  return { accepted: true, seats: partySize };
}

export function reserveImport({ partySize, availableSeats }) {
  if (partySize < 1) return { accepted: false, reason: "invalid_party_size" };
  if (partySize > availableSeats) return { accepted: false, reason: "insufficient_capacity" };
  return { accepted: true, seats: partySize };
}
