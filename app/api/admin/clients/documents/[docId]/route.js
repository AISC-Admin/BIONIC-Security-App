import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { sql } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { ensureClientsSchema } from '@/lib/clients';

export async function DELETE(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureClientsSchema();
  const { docId } = await params;
  const { rows } = await sql`DELETE FROM client_documents WHERE id = ${docId} RETURNING url;`;
  if (rows.length > 0) {
    try {
      await del(rows[0].url);
    } catch (e) {
      console.error('Suppression Blob impossible :', e);
    }
  }
  return NextResponse.json({ ok: true });
}
