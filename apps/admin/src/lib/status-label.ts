export function formatStatusLabel(status: string) {
  const label = status.replaceAll("_", " ");
  return label ? `${label[0].toUpperCase()}${label.slice(1)}` : label;
}
