/**
 * Minimal CSV helpers shared by the bulk-upload dialogs (patients, guidebooks).
 * Handles simple double-quoted fields; no external dependency.
 */

/** Splits one CSV line, honouring simple double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i += 1; } else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; } else { cur += ch; }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Parses CSV text into a 2-D cell grid, skipping blank lines. */
export function csvTextToGrid(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map(splitCsvLine);
}
