import { NextResponse } from 'next/server';
import { sql, ensureSchema, calculerDureeHeures } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

const HEURE_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// PATCH /api/admin/shifts/[id]
// Deux usages distincts, selon le corps envoye :
//  - { valide: true|false }               -> bascule le statut de validation.
//  - { heure_debut, heure_fin }           -> le responsable corrige les
//    horaires declares par le salarie. La duree et le montant sont
//    recalcules (au taux deja fige sur cette vacation, inchangé), et la
//    vacation est marquee "modifiee par le responsable" : ce statut est
//    ensuite visible aussi bien ici que sur la page du salarie.
export async function PATCH(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  const body = await request.json();

  if (body.heure_debut !== undefined || body.heure_fin !== undefined || body.poste_id !== undefined) {
    const { rows } = await sql`
      SELECT heure_debut, heure_fin, poste_id FROM shifts WHERE id = ${id} LIMIT 1;
    `;
    if (rows.length === 0) {
      return NextResponse.json({ erreur: 'Vacation introuvable.' }, { status: 404 });
    }
    const existant = rows[0];
    const heureDebut = body.heure_debut || existant.heure_debut;
    const heureFin = body.heure_fin || existant.heure_fin;
    if (!HEURE_RE.test(heureDebut) || !HEURE_RE.test(heureFin)) {
      return NextResponse.json({ erreur: 'Heures invalides (format HH:MM attendu).' }, { status: 400 });
    }

    // Le taux vient toujours du poste (eventuellement change ici).
    const posteId = body.poste_id ? Number(body.poste_id) : Number(existant.poste_id);
    const { rows: postes } = await sql`SELECT taux_horaire FROM postes WHERE id = ${posteId} LIMIT 1;`;
    if (!postes[0]) return NextResponse.json({ erreur: 'Poste introuvable.' }, { status: 400 });
    const taux = Number(postes[0].taux_horaire);

    const dureeHeures = calculerDureeHeures(heureDebut, heureFin);
    const montant = Math.round(dureeHeures * taux * 100) / 100;

    await sql`
      UPDATE shifts
      SET heure_debut = ${heureDebut},
          heure_fin = ${heureFin},
          poste_id = ${posteId},
          duree_heures = ${dureeHeures},
          taux_horaire = ${taux},
          montant = ${montant},
          modifie_par_manager = true,
          modifie_le = now()
      WHERE id = ${id};
    `;
    return NextResponse.json({ ok: true });
  }

  if (body.valide !== undefined) {
    await sql`UPDATE shifts SET valide = ${body.valide} WHERE id = ${id};`;
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erreur: 'Aucune modification fournie.' }, { status: 400 });
}

export async function DELETE(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  await sql`DELETE FROM shifts WHERE id = ${id};`;
  return NextResponse.json({ ok: true });
}
