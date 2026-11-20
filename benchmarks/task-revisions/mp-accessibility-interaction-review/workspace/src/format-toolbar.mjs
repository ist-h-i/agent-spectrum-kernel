export function setRovingTabStop(buttons, nextIndex) {
  buttons.forEach((button, index) => {
    button.tabIndex = index === nextIndex ? 0 : -1;
  });
}

export function handleToolbarKeydown(event, buttons) {
  const currentIndex = buttons.indexOf(event.currentTarget);
  if (currentIndex < 0 || buttons.length === 0) return false;

  let nextIndex;
  switch (event.key) {
    case "ArrowRight":
      nextIndex = currentIndex + 1;
      break;
    case "ArrowLeft":
      nextIndex = currentIndex - 1;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = buttons.length - 1;
      break;
    default:
      return false;
  }

  event.preventDefault();
  const tabStop = Math.min(buttons.length - 1, Math.max(0, nextIndex));
  setRovingTabStop(buttons, tabStop);
  const focusedIndex = (nextIndex + buttons.length) % buttons.length;
  buttons[focusedIndex].focus();
  return true;
}

export function connectToolbar(toolbar) {
  const buttons = [...toolbar.querySelectorAll("button")];
  for (const button of buttons) {
    button.addEventListener("keydown", (event) => handleToolbarKeydown(event, buttons));
  }
}
