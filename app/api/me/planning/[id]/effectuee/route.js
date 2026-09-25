import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireEmployeeSession } from '@/lib/auth';
import { executerCreneau } from '@/lib/vacations';

// POST /api/me/planning/[id]/effectuee   body: { posteId? }
// Le salarie confirme avoir effectue un creneau de son planning : il devient
// une vacation (en attente de validation par le responsable), comptee dans
// ses gains. Impossible pour un creneau a venir.
export async function POST(request, { params }) {
  const session = await requireEmployeeSession();
  if (!session) return NextResponse.json({ erreur: 'Non connecte.' }, { status: 401 });
  await ensureSchema();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const { rows } = await sql`
    SELECT (planning_date <= (now() AT TIME ZONE 'Europe/Paris')::date) AS passe
    FROM planning_entries WHERE id = ${id} AND employee_id = ${session.employeeId};
  `;
  if (!rows[0]) return NextResponse.json({ erreur: 'Creneau introuvable.' }, { status: 404 });
  if (!rows[0].passe) {
    return NextResponse.json(
      { erreur: 'Ce creneau est a venir : il ne peut pas encore etre declare effectue.', code: 'future_slot' },
      { status: 400 }
    );
  }

  const r = await executerCreneau(id, {
    employeeId: session.employeeId,
    posteIdSecours: body.posteId ? Number(body.posteId) : null,
    valide: false
  });
  if (r.erreur) return NextResponse.json({ erreur: r.erreur, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true, shiftId: r.shiftId || null });
}
