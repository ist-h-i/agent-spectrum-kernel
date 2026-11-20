export function toolbarButtons(count = 3) {
  return Array.from({ length: count }, (_, index) => ({
    tabIndex: index === 0 ? 0 : -1,
    focused: false,
    focus() {
      for (const button of this.collection) button.focused = false;
      this.focused = true;
    },
  })).map((button, _index, collection) => Object.assign(button, { collection }));
}

export function keyboardEvent(key, currentTarget) {
  return {
    key,
    currentTarget,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
}
