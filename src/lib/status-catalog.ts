export type StatusPreset = { code: string; name: string };

// Final production status list. Labels are stored as "CODE - Name" so the
// dashboard stays readable while devices can post just the short code.
export const STATUS_CATALOG: StatusPreset[] = [
  { code: "S", name: "Set up (New Run)" },
  { code: "E1", name: "Engineering Downtime (Corrective Maintenance)" },
  { code: "E2", name: "Preventive Maintenance" },
  { code: "R", name: "Run" },
  { code: "P1", name: "Down time due to Wire break or quality defects" },
  { code: "P2", name: "Lack of Work in Process items and/or Raw Materials" },
  { code: "P3", name: "No operator" },
  { code: "O1", name: "Power interruption" },
  { code: "O2", name: "Work stoppage due to external issues" },
  { code: "NS", name: "No Schedule" },
];

export function presetLabel(preset: StatusPreset) {
  return `${preset.code} - ${preset.name}`;
}

export const STATUS_PRESET_LABELS = STATUS_CATALOG.map(presetLabel);
export const STATUS_LABEL_FORMAT_HELP = 'Use format "code - name" (for example, "T - Testing").';

export function isStatusLabelFormatted(label: string) {
  const separator = label.indexOf(" - ");
  if (separator <= 0) return false;

  const code = label.slice(0, separator);
  const name = label.slice(separator + 3);
  return code.trim() === code && name.length > 0 && name.trim() === name;
}

export function validateStatusLabels(labels: string[], existingLabels: string[] = []) {
  const existing = new Set(existingLabels.map((label) => label.trim().toLowerCase()));
  const invalid = labels.find(
    (label) => !existing.has(label.toLowerCase()) && !isStatusLabelFormatted(label),
  );
  if (invalid) {
    throw new Error(`Custom status "${invalid}" is invalid. ${STATUS_LABEL_FORMAT_HELP}`);
  }
}

// "S - Set up (New Run)" -> "S"
export function statusCode(label: string) {
  const [code] = label.split(" - ");
  return (code ?? label).trim();
}
