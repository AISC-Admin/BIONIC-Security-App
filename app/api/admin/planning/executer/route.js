import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { executerCreneau } from '@/lib/vacations';

// POST /api/admin/planning/executer   body: { ids: [..], posteId? }
// Le responsable marque des creneaux du planning comme executes : chacun
// devient une vacation deja validee (comptee dans les recaps et l'export).
export async function POST(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { ids, posteId } = await request.json().catch(() => ({}));
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ erreur: 'Aucun creneau choisi.' }, { status: 400 });
  }

  let executes = 0;
  let sansPoste = 0;
  for (const id of ids.slice(0, 500)) {
    const r = await executerCreneau(Number(id), { posteIdSecours: posteId ? Number(posteId) : null, valide: true });
    if (r.code === 'poste_requis') sansPoste += 1;
    else if (r.shiftId && !r.deja) executes += 1;
  }
  return NextResponse.json({ ok: true, executes, sansPoste });
}
