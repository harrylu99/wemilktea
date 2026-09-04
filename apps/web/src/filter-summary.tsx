export function summarizeFilterLabels(
  labels: readonly string[],
  maxVisible = 2
) {
  const visibleLabels = labels.map((label) => label.trim()).filter(Boolean);

  if (visibleLabels.length <= maxVisible) {
    return visibleLabels.join(", ");
  }

  return `${visibleLabels.slice(0, maxVisible).join(", ")} +${visibleLabels.length - maxVisible}`;
}
