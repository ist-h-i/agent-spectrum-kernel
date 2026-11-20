import { visibleMessages } from "./inbox-state.mjs";

export function buildInboxView(state) {
  const visible = visibleMessages(state);
  let selectedMessage = visible.find(({ id }) => id === state.selectedMessageId) ?? null;
  if (state.lastReadSelectionId != null && state.filter === "unread") {
    const readIndex = state.messages.findIndex(({ id }) => id === state.lastReadSelectionId);
    selectedMessage = state.messages.slice(readIndex + 1).find(({ unread }) => unread) ?? visible[0] ?? null;
  }
  return {
    rows: visible.map((message) => ({
      id: message.id,
      subject: message.subject,
      selected: message.id === state.selectedMessageId,
      expanded: state.expandedThreadIds.includes(message.id),
    })),
    details: selectedMessage ? { id: selectedMessage.id, subject: selectedMessage.subject, body: selectedMessage.body } : null,
  };
}
