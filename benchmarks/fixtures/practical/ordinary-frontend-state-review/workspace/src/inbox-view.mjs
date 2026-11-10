import { visibleMessages } from "./inbox-state.mjs";

export function buildInboxView(state) {
  const visible = visibleMessages(state);
  const selectedMessage = state.messages.find(({ id }) => id === state.selectedMessageId) ?? null;
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
