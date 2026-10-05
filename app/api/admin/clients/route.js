import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { ensureClientsSchema, nettoyerClient } from '@/lib/clients';

// GET : listing complet des clients, avec leurs sites et documents.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureClientsSchema();
  const [{ rows: clients }, { rows: sites }, { rows: documents }, { rows: tarifs }, { rows: societes }] = await Promise.all([
    sql`SELECT * FROM clients ORDER BY lower(raison_sociale);`,
    sql`SELECT id, nom, actif, client_id FROM sites WHERE coalesce(supprime, false) = false ORDER BY lower(nom);`,
    sql`
      SELECT id, client_id, type, nom, url, to_char(date_expiration, 'YYYY-MM-DD') AS date_expiration, created_at
      FROM client_documents ORDER BY created_at DESC;
    `,
    sql`SELECT site_id, poste_id, taux::float AS taux FROM tarifs_facturation;`,
    sql`SELECT id, nom, actif FROM societes_facturation ORDER BY ordre, id;`
  ]);
  return NextResponse.json({ clients, sites, documents, tarifs, societes });
}

export async function POST(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureClientsSchema();
  const c = nettoyerClient(await request.json());
  if (!c.raison_sociale) return NextResponse.json({ erreur: 'La raison sociale est obligatoire.' }, { status: 400 });
  const { rows } = await sql`
    INSERT INTO clients (raison_sociale, forme_juridique, siret, tva_intra, adresse, code_postal, ville, pays,
      contact_nom, contact_fonction, contact_email, contact_telephone, email_facturation, conditions_paiement, notes, actif, societe_id)
    VALUES (${c.raison_sociale}, ${c.forme_juridique}, ${c.siret}, ${c.tva_intra}, ${c.adresse}, ${c.code_postal},
      ${c.ville}, ${c.pays}, ${c.contact_nom}, ${c.contact_fonction}, ${c.contact_email}, ${c.contact_telephone},
      ${c.email_facturation}, ${c.conditions_paiement}, ${c.notes}, ${c.actif}, ${c.societe_id})
    RETURNING id;
  `;
  return NextResponse.json({ id: rows[0].id });
}
