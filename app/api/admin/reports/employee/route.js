import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

// GET /api/admin/reports/employee?employee_id=123
// Tableau croise (pivot) : mois en lignes, sites en colonnes, pour un
// salarie donne, sur tout son historique.
export async function GET(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employee_id');
  if (!employeeId) {
    return NextResponse.json({ erreur: 'employee_id requis.' }, { status: 400 });
  }

  const { rows: employeRows } = await sql`
    SELECT id, nom, prenom, taux_horaire, actif FROM employees WHERE id = ${employeeId} LIMIT 1;
  `;
  if (employeRows.length === 0) {
    return NextResponse.json({ erreur: 'Salarie introuvable.' }, { status: 404 });
  }
  const employee = employeRows[0];

  const { rows: lignes } = await sql`
    SELECT to_char(s.shift_date, 'YYYY-MM') AS mois, s.site_id, st.nom AS site,
           SUM(s.duree_heures) AS heures, SUM(s.montant) AS montant
    FROM shifts s
    JOIN sites st ON st.id = s.site_id
    WHERE s.employee_id = ${employeeId}
    GROUP BY mois, s.site_id, st.nom
    ORDER BY mois ASC, st.nom ASC;
  `;

  // Sites distincts rencontres (colonnes du tableau), tries par nom.
  const sitesMap = new Map();
  for (const l of lignes) {
    if (!sitesMap.has(l.site_id)) sitesMap.set(l.site_id, l.site);
  }
  const sites = Array.from(sitesMap.entries())
    .map(([id, nom]) => ({ id, nom }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  // Regroupement par mois (lignes du tableau).
  const parMois = new Map();
  for (const l of lignes) {
    if (!parMois.has(l.mois)) {
      parMois.set(l.mois, { mois: l.mois, parSite: {}, totalHeures: 0, totalMontant: 0 });
    }
    const entree = parMois.get(l.mois);
    const heures = Number(l.heures);
    const montant = Number(l.montant);
    entree.parSite[l.site_id] = { heures, montant };
    entree.totalHeures += heures;
    entree.totalMontant += montant;
  }
  const rows = Array.from(parMois.values()).sort((a, b) => a.mois.localeCompare(b.mois));

  // Totaux par colonne (site) et grand total.
  const totalsBySite = {};
  for (const s of sites) totalsBySite[s.id] = { heures: 0, montant: 0 };
  const grandTotal = { heures: 0, montant: 0 };
  for (const row of rows) {
    for (const s of sites) {
      const cellule = row.parSite[s.id];
      if (cellule) {
        totalsBySite[s.id].heures += cellule.heures;
        totalsBySite[s.id].montant += cellule.montant;
      }
    }
    grandTotal.heures += row.totalHeures;
    grandTotal.montant += row.totalMontant;
  }

  return NextResponse.json({ employee, sites, rows, totalsBySite, grandTotal });
}
