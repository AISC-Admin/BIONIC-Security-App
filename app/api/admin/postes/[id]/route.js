import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

export async function PATCH(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  const { nom, taux_horaire, actif } = await request.json();

  if (nom !== undefined) await sql`UPDATE postes SET nom = ${nom.trim()} WHERE id = ${id};`;
  if (taux_horaire !== undefined) {
    await sql`UPDATE postes SET taux_horaire = ${Number(taux_horaire)} WHERE id = ${id};`;
  }
  if (actif !== undefined) await sql`UPDATE postes SET actif = ${actif} WHERE id = ${id};`;

  const { rows } = await sql`SELECT id, nom, taux_horaire, actif FROM postes WHERE id = ${id};`;
  return NextResponse.json({ poste: rows[0] });
}

export async function DELETE(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  try {
    await sql`DELETE FROM postes WHERE id = ${id};`;
  } catch {
    // Deja utilise par des vacations ou un planning : suppression
    // impossible sans perdre l'historique, on le masque a la place.
    await sql`UPDATE postes SET supprime = true, actif = false WHERE id = ${id};`;
    return NextResponse.json({ ok: true, archive: true });
  }
  return NextResponse.json({ ok: true });
}
