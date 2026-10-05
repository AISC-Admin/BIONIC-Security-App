import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { ensureClientsSchema } from '@/lib/clients';

// PUT : repartit les heures d'une prestation (mois + site + poste) entre les
// societes emettrices. Corps : { mois, site_id, poste_id, heures: { [societe_id]: nombre } }.
// heures vide ({}) => repartition supprimee (tout revient a la societe par defaut).
export async function PUT(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureClientsSchema();
  const { mois, site_id, poste_id, heures } = await request.json();
  if (!/^\d{4}-\d{2}$/.test(mois || '') || !site_id || !poste_id) {
    return NextResponse.json({ erreur: 'Prestation invalide.' }, { status: 400 });
  }

  const valeurs = [];
  for (const [societeId, v] of Object.entries(heures || {})) {
    if (v === '' || v === null || v === undefined) continue;
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ erreur: 'Les heures doivent etre des nombres positifs.' }, { status: 400 });
    }
    valeurs.push([Number(societeId), Math.round(n * 100) / 100]);
  }

  // Controle : on ne peut pas repartir plus d'heures que les heures validees.
  if (valeurs.length > 0) {
    const { rows } = await sql`
      SELECT coalesce(SUM(duree_heures), 0)::float AS total
      FROM shifts
      WHERE valide = true AND site_id = ${site_id} AND poste_id = ${poste_id}
        AND to_char(shift_date, 'YYYY-MM') = ${mois};
    `;
    const total = rows[0].total;
    const saisi = valeurs.reduce((a, [, h]) => a + h, 0);
    if (saisi > total + 0.001) {
      return NextResponse.json(
        { erreur: `Repartition de ${saisi} h superieure aux ${total} h validees pour cette prestation.` },
        { status: 400 }
      );
    }
  }

  await sql`DELETE FROM repartition_facturation WHERE mois = ${mois} AND site_id = ${site_id} AND poste_id = ${poste_id};`;
  for (const [societeId, h] of valeurs) {
    await sql`
      INSERT INTO repartition_facturation (mois, site_id, poste_id, societe_id, heures)
      VALUES (${mois}, ${site_id}, ${poste_id}, ${societeId}, ${h});
    `;
  }
  return NextResponse.json({ ok: true });
}
