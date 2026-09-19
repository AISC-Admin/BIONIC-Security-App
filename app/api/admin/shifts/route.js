import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

// GET /api/admin/shifts?mois=YYYY-MM&employee_id=&site_id=
export async function GET(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get('mois') || new Date().toISOString().slice(0, 7);
  const employeeId = searchParams.get('employee_id');
  const siteId = searchParams.get('site_id');

  const { rows } = await sql`
    SELECT s.id, s.employee_id, e.nom, e.prenom, s.shift_date, s.heure_debut, s.heure_fin,
           s.duree_heures, s.taux_horaire, s.montant, s.valide, s.modifie_par_manager,
           st.nom AS site, po.nom AS poste
    FROM shifts s
    JOIN employees e ON e.id = s.employee_id
    JOIN sites st ON st.id = s.site_id
    JOIN postes po ON po.id = s.poste_id
    WHERE to_char(s.shift_date, 'YYYY-MM') = ${mois}
      AND (${employeeId}::int IS NULL OR s.employee_id = ${employeeId}::int)
      AND (${siteId}::int IS NULL OR s.site_id = ${siteId}::int)
    ORDER BY s.shift_date DESC, e.nom, s.heure_debut;
  `;

  return NextResponse.json({ mois, vacations: rows });
}
