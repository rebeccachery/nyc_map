const BOROUGH_BY_PREFIX: [string, string][] = [
  ["103", "Staten Island"],
  ["104", "Bronx"],
  ["112", "Brooklyn"],
  ["110", "Queens"],
  ["111", "Queens"],
  ["113", "Queens"],
  ["114", "Queens"],
  ["116", "Queens"],
  ["100", "Manhattan"],
  ["101", "Manhattan"],
  ["102", "Manhattan"],
];

export function zctaToBorough(zcta: string): string {
  const prefix = zcta.slice(0, 3);
  for (const [code, borough] of BOROUGH_BY_PREFIX) {
    if (prefix === code) return borough;
  }
  return "Unknown";
}

export function isNycZcta(zcta: string): boolean {
  return zctaToBorough(zcta) !== "Unknown";
}
