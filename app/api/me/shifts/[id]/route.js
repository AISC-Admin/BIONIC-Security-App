import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireEmployeeSession } from '@/lib/auth';

// Un salarie ne peut supprimer que sa propre vacation, et seulement si
// elle n'a pas deja ete validee par le responsable.
export async function DELETE(request, { params }) {
  const session = await requireEmployeeSession();
  if (!session) {
    return NextResponse.json({ erreur: 'Non connecte.' }, { status: 401 });
  }
  await ensureSchema();
  const { id } = await params;

  const { rows } = await sql`
    SELECT id, valide FROM shifts WHERE id = ${id} AND employee_id = ${session.employeeId} LIMIT 1;
  `;
  if (rows.length === 0) {
    return NextResponse.json({ erreur: 'Vacation introuvable.', code: 'shift_not_found' }, { status: 404 });
  }
  if (rows[0].valide) {
    return NextResponse.json(
      {
        erreur: 'Cette vacation a deja ete validee et ne peut plus etre supprimee.',
        code: 'shift_locked'
      },
      { status: 403 }
    );
  }

  await sql`DELETE FROM shifts WHERE id = ${id};`;
  return NextResponse.json({ ok: true });
}
