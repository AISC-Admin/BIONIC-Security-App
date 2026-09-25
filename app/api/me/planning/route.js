import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireEmployeeSession } from '@/lib/auth';

// GET /api/me/planning?mois=YYYY-MM (par defaut : mois en cours)
// Planning previsionnel envoye par le responsable pour le salarie connecte,
// en lecture seule (le salarie ne peut pas le modifier depuis son espace).
export async function GET(request) {
  const session = await requireEmployeeSession();
  if (!session) {
    return NextResponse.json({ erreur: 'Non connecte.' }, { status: 401 });
  }
  await ensureSchema();

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get('mois') || new Date().toISOString().slice(0, 7);

  const { rows } = await sql`
    SELECT p.id, to_char(p.planning_date, 'YYYY-MM-DD') AS planning_date,
           p.heure_debut, p.heure_fin, p.note, p.poste_id,
           (SELECT sh.id FROM shifts sh WHERE sh.planning_entry_id = p.id LIMIT 1) AS shift_id,
           (p.planning_date <= (now() AT TIME ZONE 'Europe/Paris')::date) AS passe,
           st.nom AS site, po.nom AS poste
    FROM planning_entries p
    JOIN sites st ON st.id = p.site_id
    LEFT JOIN postes po ON po.id = p.poste_id
    WHERE p.employee_id = ${session.employeeId}
      AND to_char(p.planning_date, 'YYYY-MM') = ${mois}
    ORDER BY p.planning_date, p.heure_debut;
  `;

  return NextResponse.json({ mois, planning: rows });
}
