import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

// DELETE : supprime un seul creneau de planning.
export async function DELETE(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  await sql`DELETE FROM planning_entries WHERE id = ${id};`;
  return NextResponse.json({ ok: true });
}
