import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { sql } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { ensureClientsSchema, nettoyerClient } from '@/lib/clients';

export async function PATCH(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureClientsSchema();
  const { id } = await params;
  const c = nettoyerClient(await request.json());
  if (!c.raison_sociale) return NextResponse.json({ erreur: 'La raison sociale est obligatoire.' }, { status: 400 });
  const { rows } = await sql`
    UPDATE clients SET
      raison_sociale = ${c.raison_sociale}, forme_juridique = ${c.forme_juridique}, siret = ${c.siret},
      tva_intra = ${c.tva_intra}, adresse = ${c.adresse}, code_postal = ${c.code_postal}, ville = ${c.ville},
      pays = ${c.pays}, contact_nom = ${c.contact_nom}, contact_fonction = ${c.contact_fonction},
      contact_email = ${c.contact_email}, contact_telephone = ${c.contact_telephone},
      email_facturation = ${c.email_facturation}, conditions_paiement = ${c.conditions_paiement},
      notes = ${c.notes}, actif = ${c.actif}, societe_id = ${c.societe_id}, updated_at = now()
    WHERE id = ${id} RETURNING id;
  `;
  if (rows.length === 0) return NextResponse.json({ erreur: 'Client introuvable.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// Supprime le client et ses documents. Ses sites ne sont pas supprimes
// (les vacations y sont rattachees) : ils redeviennent "sans client".
export async function DELETE(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureClientsSchema();
  const { id } = await params;
  const { rows: docs } = await sql`SELECT url FROM client_documents WHERE client_id = ${id};`;
  await sql`DELETE FROM clients WHERE id = ${id};`;
  if (docs.length > 0) {
    try {
      await del(docs.map((d) => d.url));
    } catch (e) {
      console.error('Suppression Blob impossible :', e);
    }
  }
  return NextResponse.json({ ok: true });
}
