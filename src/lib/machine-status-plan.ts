export type MachineStatusRow = { id: string; label: string; position: number };

export function planStatusDefinitionChanges(currentRows: MachineStatusRow[], labels: string[]) {
  const existingByLabel = new Map(currentRows.map((row) => [row.label.toLowerCase(), row]));
  const desiredLabels = new Set(labels.map((label) => label.toLowerCase()));

  return {
    removed: currentRows.filter((row) => !desiredLabels.has(row.label.toLowerCase())),
    retained: labels.flatMap((label, index) => {
      const row = existingByLabel.get(label.toLowerCase());
      return row ? [{ row, position: index + 1 }] : [];
    }),
    added: labels.flatMap((label, index) =>
      existingByLabel.has(label.toLowerCase()) ? [] : [{ label, position: index + 1 }],
    ),
  };
}
