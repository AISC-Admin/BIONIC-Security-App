// Outils de calcul pour le planning site (creneaux a pourvoir).

export function enMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

export function versHeure(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function ajouterJours(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Jour ISO : 1 = lundi ... 7 = dimanche.
export function jourSemaine(iso) {
  const j = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return j === 0 ? 7 : j;
}

// Intervalle absolu [debut, fin[ en minutes depuis l'epoque, pour comparer
// des creneaux de dates differentes (gere les vacations de nuit).
export function intervalle(dateIso, heureDebut, heureFin) {
  const base = Date.parse(`${dateIso}T00:00:00Z`) / 60000;
  const debut = base + enMinutes(heureDebut);
  let fin = base + enMinutes(heureFin);
  if (fin <= debut) fin += 1440;
  return [debut, fin];
}

// Decoupe un creneau (date, debut, fin) en tranches de `pasHeures` heures.
// Une tranche qui commence apres minuit est rattachee au lendemain.
export function decouper(dateIso, heureDebut, heureFin, pasHeures) {
  const debut = enMinutes(heureDebut);
  let fin = enMinutes(heureFin);
  if (fin <= debut) fin += 1440;
  const pas = pasHeures ? Math.round(pasHeures * 60) : fin - debut;
  const tranches = [];
  for (let t = debut; t < fin; t += pas) {
    const tFin = Math.min(t + pas, fin);
    tranches.push({
      date: ajouterJours(dateIso, Math.floor(t / 1440)),
      heureDebut: versHeure(t),
      heureFin: versHeure(tFin)
    });
  }
  return tranches;
}
