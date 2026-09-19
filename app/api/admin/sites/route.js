import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { rows } = await sql`SELECT id, nom, actif FROM sites ORDER BY nom;`;
  return NextResponse.json({ sites: rows });
}

export async function POST(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { nom } = await request.json();
  if (!nom) return NextResponse.json({ erreur: 'Nom du site requis.' }, { status: 400 });

  try {
    const { rows } = await sql`
      INSERT INTO sites (nom) VALUES (${nom.trim()}) RETURNING id, nom, actif;
    `;
    return NextResponse.json({ site: rows[0] });
  } catch {
    return NextResponse.json({ erreur: 'Ce site existe deja.' }, { status: 409 });
  }
}
