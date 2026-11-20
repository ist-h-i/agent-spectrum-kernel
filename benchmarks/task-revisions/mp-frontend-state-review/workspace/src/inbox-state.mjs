const FILTERS = new Set(["all", "unread"]);

function assertMessageId(messages, id) {
  if (!messages.some((message) => message.id === id)) throw new Error(`unknown message: ${id}`);
}

export function createInboxState(messages) {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error("messages are required");
  const ids = messages.map(({ id }) => id);
  if (ids.some((id) => typeof id !== "string" || id.length === 0) || new Set(ids).size !== ids.length) throw new Error("message IDs must be unique non-empty strings");
  return { messages: structuredClone(messages), filter: "all", selectedMessageId: null, lastReadSelectionId: null, expandedThreadIds: [] };
}

export function visibleMessages(state) {
  return state.filter === "unread" ? state.messages.filter(({ unread }) => unread) : [...state.messages];
}

export function selectMessage(state, messageId) {
  assertMessageId(visibleMessages(state), messageId);
  return { ...state, selectedMessageId: messageId, lastReadSelectionId: null };
}

export function toggleThread(state, messageId) {
  assertMessageId(state.messages, messageId);
  const expanded = new Set(state.expandedThreadIds);
  if (expanded.has(messageId)) expanded.delete(messageId);
  else expanded.add(messageId);
  return { ...state, expandedThreadIds: [...expanded] };
}

export function changeFilter(state, filter) {
  if (!FILTERS.has(filter)) throw new Error(`unknown filter: ${filter}`);
  const next = { ...state, filter, lastReadSelectionId: null };
  if (!visibleMessages(next).some(({ id }) => id === state.selectedMessageId)) next.selectedMessageId = null;
  return next;
}

export function markMessageRead(state, messageId) {
  assertMessageId(state.messages, messageId);
  const messages = state.messages.map((message) => message.id === messageId ? { ...message, unread: false } : message);
  const next = { ...state, messages, lastReadSelectionId: null };
  if (state.filter === "unread" && state.selectedMessageId === messageId) {
    next.selectedMessageId = visibleMessages(next)[0]?.id ?? null;
    next.lastReadSelectionId = messageId;
  }
  return next;
}
