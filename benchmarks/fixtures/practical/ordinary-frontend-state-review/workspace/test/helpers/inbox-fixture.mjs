export function messages() {
  return [
    { id: "message-read", subject: "Release notes", body: "The release is complete.", unread: false },
    { id: "message-unread", subject: "Rollback check", body: "Confirm the rollback window.", unread: true },
  ];
}
