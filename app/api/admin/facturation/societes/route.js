import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { ensureClientsSchema } from '@/lib/clients';

// Societes emettrices des factures.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureClientsSchema();
  const { rows } = await sql`SELECT id, nom, actif FROM societes_facturation ORDER BY ordre, id;`;
  return NextResponse.json({ societes: rows });
}

// POST { nom } : ajoute une societe emettrice.
export async function POST(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureClientsSchema();
  const { nom } = await request.json();
  const propre = String(nom || '').trim();
  if (!propre) return NextResponse.json({ erreur: 'Nom de la societe requis.' }, { status: 400 });
  try {
    const { rows } = await sql`
      INSERT INTO societes_facturation (nom, ordre)
      VALUES (${propre}, (SELECT coalesce(MAX(ordre), 0) + 1 FROM societes_facturation))
      RETURNING id, nom, actif;
    `;
    return NextResponse.json({ societe: rows[0] });
  } catch {
    return NextResponse.json({ erreur: 'Cette societe existe deja.' }, { status: 409 });
  }
}
