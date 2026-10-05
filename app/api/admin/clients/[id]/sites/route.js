import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { ensureClientsSchema } from '@/lib/clients';

// POST : rattache ({ site_id, rattacher: true }) ou detache
// ({ site_id, rattacher: false }) un site de ce client.
export async function POST(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureClientsSchema();
  const { id } = await params;
  const { site_id, rattacher } = await request.json();
  if (!site_id) return NextResponse.json({ erreur: 'Site manquant.' }, { status: 400 });
  if (rattacher) {
    await sql`UPDATE sites SET client_id = ${id} WHERE id = ${site_id};`;
  } else {
    await sql`UPDATE sites SET client_id = NULL WHERE id = ${site_id} AND client_id = ${id};`;
  }
  return NextResponse.json({ ok: true });
}
