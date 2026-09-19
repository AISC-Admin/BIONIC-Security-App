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
    return NextResponse.json(
      { erreur: 'Ce site a deja des vacations enregistrees : desactivez-le plutot que de le supprimer.' },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
