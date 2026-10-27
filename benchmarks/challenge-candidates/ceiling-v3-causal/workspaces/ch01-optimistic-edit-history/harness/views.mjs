export function mountList(editor, rowId) { return mount(editor, rowId, 'list'); }
export function mountDetail(editor, rowId) { return mount(editor, rowId, 'detail'); }
function mount(editor, rowId, kind) {
  const frames = [];
  const close = editor.open(rowId, state => frames.push(structuredClone(state)));
  return { kind, frames, close, current: () => structuredClone(frames.at(-1)) };
}
