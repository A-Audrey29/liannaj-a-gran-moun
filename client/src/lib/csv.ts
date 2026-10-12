/**
 * Export CSV pour Excel français.
 *
 * Deux contraintes qui expliquent le format :
 *  - séparateur `;` : Excel en locale FR découpe sur le point-virgule, pas sur
 *    la virgule ;
 *  - BOM UTF-8 en tête : sans lui, Excel lit le fichier en ANSI et les accents
 *    ressortent en mojibake.
 */

/** Échappe une cellule : guillemets doublés, entourage si séparateur/saut de ligne. */
export function csvEscape(value: string): string {
  if (value.includes(";") || value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Neutralises spreadsheet formulas. A cell starting with = + - @ (or tab / CR),
 * possibly after leading whitespace or a line break that some tools trim on
 * import, is executed when the file is opened in Excel: a free-text comment
 * such as `=HYPERLINK(...)` would run on whoever receives the export. A
 * leading apostrophe makes it inert.
 *
 * buildCsv applies it to every string cell; numbers are left alone, so a
 * numeric -1 stays a number.
 */
export function csvSafeText(value: string): string {
  return /^\s*[=+\-@]|^[\t\r]/.test(value) ? `'${value}` : value;
}

export function buildCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const bom = "﻿";
  const lines = [
    header.map((h) => csvEscape(h)).join(";"),
    ...rows.map((row) =>
      row
        .map((cell) => csvEscape(cell == null ? "" : typeof cell === "string" ? csvSafeText(cell) : String(cell)))
        .join(";")
    ),
  ];
  return bom + lines.join("\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
