/** Formats de date de l'interface, dans la langue courante. */
export function dateCourte(iso: string | null | undefined, langue: string): string {
  if (!iso) return '—';
  const date = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return new Intl.DateTimeFormat(langue, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** « il y a 3 heures », « dans 2 jours »… */
export function depuis(iso: string | null | undefined, langue: string): string {
  if (!iso) return '—';
  const secondes = (new Date(iso).getTime() - Date.now()) / 1000;
  const unites: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const format = new Intl.RelativeTimeFormat(langue, { numeric: 'auto' });
  for (const [unite, duree] of unites) {
    if (Math.abs(secondes) >= duree) return format.format(Math.round(secondes / duree), unite);
  }
  return format.format(Math.round(secondes / 60), 'minute');
}

export function aujourdhuiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Drapeau du pays à partir de son code ISO (indicateurs régionaux Unicode). */
export function drapeau(code: string): string {
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}
