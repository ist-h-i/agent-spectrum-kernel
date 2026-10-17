export function lookupEvents(events, requests) {
 return requests.map(request => ({request_id: request?.request_id, events: events.filter(event =>
  event !== null && typeof event === 'object' && request !== null && typeof request === 'object' &&
  Number.isFinite(request.start) && Number.isFinite(request.end) && request.start <= request.end &&
  Number.isFinite(event.timestamp) && event.tenant === request.tenant && event.kind === request.kind &&
  event.timestamp >= request.start && event.timestamp <= request.end)}));
}
