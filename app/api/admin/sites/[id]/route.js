import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

export async function PATCH(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  const { nom, actif } = await request.json();

  if (nom !== undefined) await sql`UPDATE sites SET nom = ${nom.trim()} WHERE id = ${id};`;
  if (actif !== undefined) await sql`UPDATE sites SET actif = ${actif} WHERE id = ${id};`;

  const { rows } = await sql`SELECT id, nom, actif FROM sites WHERE id = ${id};`;
  return NextResponse.json({ site: rows[0] });
}

export async function DELETE(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  try {
    await sql`DELETE FROM sites WHERE id = ${id};`;
  } catch {
    // Deja utilise par des vacations ou un planning : suppression
    // impossible sans perdre l'historique, on le masque a la place.
    await sql`UPDATE sites SET supprime = true, actif = false WHERE id = ${id};`;
    return NextResponse.json({ ok: true, archive: true });
  }
  return NextResponse.json({ ok: true });
}
