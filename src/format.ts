export function prettyDate(date: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Warsaw",
  }).format(new Date(`${date}T12:00:00Z`));
}
export function periodLabel(period: string) {
  const d = new Date(`${period}-10T12:00:00Z`);
  const value = new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  }).format(d);
  return value.charAt(0).toUpperCase() + value.slice(1);
}
