import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Liste des sites et des postes actifs, utilisee par le formulaire de
// pointage cote salarie et par les ecrans admin.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ erreur: 'Non connecte.' }, { status: 401 });
  }
  await ensureSchema();

  const [sites, postes] = await Promise.all([
    sql`SELECT id, nom FROM sites WHERE actif = true AND supprime = false ORDER BY nom;`,
    sql`SELECT id, nom, taux_horaire FROM postes WHERE actif = true AND supprime = false ORDER BY nom;`
  ]);

  return NextResponse.json({ sites: sites.rows, postes: postes.rows });
}
