export function getPrimaryConnectionName(provider: string): string {
  return `${provider}:primary`;
}

export function isPrimaryConnectionName(provider: string, name: string): boolean {
  return name === getPrimaryConnectionName(provider);
}

export function getNextSecondaryConnectionName(
  provider: string,
  existingNames: string[],
): string {
  const taken = new Set(existingNames);
  let index = 2;

  while (taken.has(`${provider}:account-${index}`)) {
    index += 1;
  }

  return `${provider}:account-${index}`;
}
