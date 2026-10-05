import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { ensureClientsSchema } from '@/lib/clients';

// PUT : fixe le taux horaire de facturation d'un poste sur un site.
// Corps : { site_id, poste_id, taux } ; taux vide => le tarif est retire.
export async function PUT(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureClientsSchema();
  const { site_id, poste_id, taux } = await request.json();
  if (!site_id || !poste_id) return NextResponse.json({ erreur: 'Site et poste requis.' }, { status: 400 });

  if (taux === null || taux === undefined || String(taux).trim() === '') {
    await sql`DELETE FROM tarifs_facturation WHERE site_id = ${site_id} AND poste_id = ${poste_id};`;
    return NextResponse.json({ ok: true, taux: null });
  }
  const valeur = Number(String(taux).replace(',', '.'));
  if (!Number.isFinite(valeur) || valeur < 0) {
    return NextResponse.json({ erreur: 'Le taux doit etre un nombre positif.' }, { status: 400 });
  }
  await sql`
    INSERT INTO tarifs_facturation (site_id, poste_id, taux)
    VALUES (${site_id}, ${poste_id}, ${valeur})
    ON CONFLICT (site_id, poste_id) DO UPDATE SET taux = EXCLUDED.taux, updated_at = now();
  `;
  return NextResponse.json({ ok: true, taux: valeur });
}
