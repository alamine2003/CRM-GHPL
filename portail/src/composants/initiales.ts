export function initiales(prenom: string, nom: string): string {
  return `${prenom.trim().charAt(0)}${nom.trim().charAt(0)}`.toUpperCase();
}
