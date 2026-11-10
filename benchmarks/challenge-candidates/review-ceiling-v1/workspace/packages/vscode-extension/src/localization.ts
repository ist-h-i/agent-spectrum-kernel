import * as vscode from 'vscode';

type LocalizeArg = string | number | boolean;

export function localize(message: string, ...args: LocalizeArg[]): string {
  const l10n = vscode.l10n;
  if (l10n !== undefined) {
    return l10n.t(message, ...args);
  }

  return formatFallbackMessage(message, args);
}

function formatFallbackMessage(message: string, args: LocalizeArg[]): string {
  return message.replaceAll(/\{(\d+)\}/gu, (match, index) => {
    const value = args[Number(index)];
    return value === undefined ? match : String(value);
  });
}
