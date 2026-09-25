import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireEmployeeSession } from '@/lib/auth';
import { resynchroniserMontants } from '@/lib/vacations';

// GET /api/me/earnings?mois=YYYY-MM
// Estimation en temps reel : recalculee a partir des vacations enregistrees,
// donc toujours a jour des que le salarie ajoute ou supprime une vacation.
export async function GET(request) {
  const session = await requireEmployeeSession();
  if (!session) {
    return NextResponse.json({ erreur: 'Non connecte.' }, { status: 401 });
  }
  await ensureSchema();
  await resynchroniserMontants();

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get('mois') || new Date().toISOString().slice(0, 7);

  const { rows } = await sql`
    SELECT
      COALESCE(SUM(duree_heures), 0) AS total_heures,
      COALESCE(SUM(montant), 0) AS total_montant,
      COUNT(*) AS nb_vacations
    FROM shifts
    WHERE employee_id = ${session.employeeId}
      AND to_char(shift_date, 'YYYY-MM') = ${mois};
  `;

  const r = rows[0];
  return NextResponse.json({
    mois,
    totalHeures: Number(r.total_heures),
    totalMontant: Number(r.total_montant),
    nbVacations: Number(r.nb_vacations)
  });
}
