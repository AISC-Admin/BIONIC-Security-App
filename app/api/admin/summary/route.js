import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

// GET /api/admin/summary?mois=YYYY-MM
// Totaux par salarie pour le mois, utilises par les cartes du tableau de bord.
export async function GET(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get('mois') || new Date().toISOString().slice(0, 7);

  const { rows } = await sql`
    SELECT e.id AS employee_id, e.nom, e.prenom,
           COALESCE(SUM(s.duree_heures), 0) AS total_heures,
           COALESCE(SUM(s.montant), 0) AS total_montant,
           COUNT(s.id) AS nb_vacations
    FROM employees e
    LEFT JOIN shifts s
      ON s.employee_id = e.id AND to_char(s.shift_date, 'YYYY-MM') = ${mois}
    WHERE e.actif = true
    GROUP BY e.id, e.nom, e.prenom
    ORDER BY e.nom, e.prenom;
  `;

  const totalGeneral = rows.reduce(
    (acc, r) => {
      acc.heures += Number(r.total_heures);
      acc.montant += Number(r.total_montant);
      return acc;
    },
    { heures: 0, montant: 0 }
  );

  // Detail par site : pour chaque site travaille ce mois-ci, qui y a
  // travaille et combien d'heures chacun. On ne remonte que les sites ayant
  // au moins une vacation dans le mois (INNER JOIN sur shifts).
  const { rows: rowsSite } = await sql`
    SELECT st.id AS site_id, st.nom AS site_nom,
           e.id AS employee_id, e.nom, e.prenom,
           SUM(s.duree_heures) AS total_heures,
           SUM(s.montant) AS total_montant
    FROM shifts s
    JOIN sites st ON st.id = s.site_id
    JOIN employees e ON e.id = s.employee_id
    WHERE to_char(s.shift_date, 'YYYY-MM') = ${mois}
    GROUP BY st.id, st.nom, e.id, e.nom, e.prenom
    ORDER BY st.nom, e.nom, e.prenom;
  `;

  const sitesParId = new Map();
  for (const r of rowsSite) {
    if (!sitesParId.has(r.site_id)) {
      sitesParId.set(r.site_id, {
        siteId: r.site_id,
        nom: r.site_nom,
        totalHeures: 0,
        totalMontant: 0,
        parEmploye: []
      });
    }
    const site = sitesParId.get(r.site_id);
    const heures = Number(r.total_heures);
    const montant = Number(r.total_montant);
    site.totalHeures += heures;
    site.totalMontant += montant;
    site.parEmploye.push({
      employeeId: r.employee_id,
      nom: r.nom,
      prenom: r.prenom,
      totalHeures: heures,
      totalMontant: montant
    });
  }
  const parSite = Array.from(sitesParId.values()).sort((a, b) => a.nom.localeCompare(b.nom));

  return NextResponse.json({
    mois,
    parEmploye: rows.map((r) => ({
      employeeId: r.employee_id,
      nom: r.nom,
      prenom: r.prenom,
      totalHeures: Number(r.total_heures),
      totalMontant: Number(r.total_montant),
      nbVacations: Number(r.nb_vacations)
    })),
    parSite,
    totalGeneral
  });
}
