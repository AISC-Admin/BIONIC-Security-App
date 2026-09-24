import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { rows } = await sql`SELECT id, nom, taux_horaire, actif FROM postes WHERE supprime = false ORDER BY nom;`;
  return NextResponse.json({ postes: rows });
}

export async function POST(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { nom, taux_horaire } = await request.json();
  if (!nom || !taux_horaire || Number(taux_horaire) <= 0) {
    return NextResponse.json({ erreur: 'Nom du poste et taux horaire (> 0) requis.' }, { status: 400 });
  }

  const { rows: archives } = await sql`
    UPDATE postes SET supprime = false, actif = true, taux_horaire = ${Number(taux_horaire)}
    WHERE lower(nom) = lower(${nom.trim()}) AND supprime = true
    RETURNING id, nom, taux_horaire, actif;
  `;
  if (archives[0]) return NextResponse.json({ poste: archives[0] });

  try {
    const { rows } = await sql`
      INSERT INTO postes (nom, taux_horaire)
      VALUES (${nom.trim()}, ${Number(taux_horaire)})
      RETURNING id, nom, taux_horaire, actif;
    `;
    return NextResponse.json({ poste: rows[0] });
  } catch {
    return NextResponse.json({ erreur: 'Ce poste existe deja.' }, { status: 409 });
  }
}
