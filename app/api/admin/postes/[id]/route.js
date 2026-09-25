import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { resynchroniserMontants } from '@/lib/vacations';

export async function PATCH(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  const { nom, taux_horaire, actif } = await request.json();

  if (nom !== undefined && (typeof nom !== 'string' || !nom.trim())) {
    return NextResponse.json({ erreur: 'Le nom du poste est requis.' }, { status: 400 });
  }
  if (taux_horaire !== undefined && !(Number(taux_horaire) > 0)) {
    return NextResponse.json({ erreur: 'Le taux horaire doit etre superieur a 0.' }, { status: 400 });
  }

  if (nom !== undefined) {
    try {
      await sql`UPDATE postes SET nom = ${nom.trim()} WHERE id = ${id};`;
    } catch {
      return NextResponse.json(
        { erreur: 'Un autre poste porte deja ce nom (eventuellement un poste supprime).' },
        { status: 409 }
      );
    }
  }
  if (taux_horaire !== undefined) {
    await sql`UPDATE postes SET taux_horaire = ${Number(taux_horaire)} WHERE id = ${id};`;
    // Toutes les vacations de ce poste passent au nouveau taux.
    await resynchroniserMontants({ posteId: Number(id) });
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
