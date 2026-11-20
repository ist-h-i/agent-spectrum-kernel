export function messages() {
  return [
    { id: "message-read", subject: "Release notes", body: "The release is complete.", unread: false },
    { id: "message-unread", subject: "Rollback check", body: "Confirm the rollback window.", unread: true },
    { id: "message-follow-up", subject: "Pilot follow-up", body: "Send the list of open decisions.", unread: true },
    { id: "message-closure", subject: "Pilot closure", body: "Check the exit notes.", unread: true },
  ];
}
