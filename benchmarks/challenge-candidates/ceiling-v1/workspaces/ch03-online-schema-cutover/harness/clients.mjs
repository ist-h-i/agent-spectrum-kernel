export function legacyClient(service, store, writerId) {
  const epoch = store.registerWriter(writerId, 'v1');
  return {
    read: id => service.readV1(id),
    write: (id, value) => service.writeV1(id, value, { writerId, epoch }),
    queue: (queueId, id, value) => store.enqueue(queueId, { version: 'v1', id, value, writerId, epoch }),
    close: () => store.retireWriter(writerId),
  };
}
export function modernClient(service, store, writerId) {
  const epoch = store.registerWriter(writerId, 'v2');
  return {
    read: id => service.readV2(id),
    write: (id, value) => service.writeV2(id, value, { writerId, epoch }),
    close: () => store.retireWriter(writerId),
  };
}
