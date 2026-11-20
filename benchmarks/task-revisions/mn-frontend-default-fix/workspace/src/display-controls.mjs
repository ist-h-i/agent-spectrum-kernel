export function displayControls(state) {
  return [
    { id: "compactRows", label: "Compact rows", checked: state.compactRows },
    { id: "showDetails", label: "Show details", checked: state.showDetails },
  ];
}
