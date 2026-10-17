const decimalFormatters = new Map<number, Intl.NumberFormat>();

/** Bounds optional UI precision to decimal places that a JavaScript number can meaningfully hold. */
export function numberPrecision(precision?: number): number | undefined {
  return precision !== undefined && Number.isFinite(precision)
    ? Math.max(0, Math.min(15, Math.trunc(precision)))
    : undefined;
}

/** Formats display only; the bounded formatter cache avoids allocation for every field or edit. */
export function numericDisplay(value: number | null, precision?: number): string {
  if (value === null) {
    return '';
  }
  const places = numberPrecision(precision);
  if (places === undefined || !Number.isFinite(value)) {
    const rounded = Number(value.toPrecision(15));
    return String(Number.isFinite(rounded) && (rounded !== 0 || value === 0) ? rounded : value);
  }
  let formatter = decimalFormatters.get(places);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      useGrouping: false,
      maximumFractionDigits: places,
    });
    decimalFormatters.set(places, formatter);
  }
  const display = formatter.format(value);
  return display === '-0' ? '0' : display;
}

/** Limits complete edited numbers while preserving intermediate text and invalid drafts for recovery. */
export function numericDraft(text: string, precision?: number): string {
  const places = numberPrecision(precision);
  if (places === undefined) {
    return text;
  }
  const match = /^[+-]?(?:\d+(?:\.(\d*))?|\.(\d+))(e[+-]?\d+)?$/i.exec(text.trim());
  const value = Number(text);
  if (!match || !Number.isFinite(value)) {
    return text;
  }
  return (match[1] ?? match[2] ?? '').length > places || match[3]
    ? numericDisplay(value, places)
    : text;
}
