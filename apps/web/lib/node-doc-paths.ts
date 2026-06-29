export function docSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function nodeDocAnchorForField(fieldKey: string) {
  return docSlug(fieldKey);
}

export function nodeDocFieldUrl(path: string, fieldKey: string) {
  return `${path}#${nodeDocAnchorForField(fieldKey)}`;
}

export function nodeDocPathForConnectorOperation(provider: string, operation: string) {
  return `/docs/nodes/connectors/${docSlug(provider)}/${docSlug(operation)}`;
}
