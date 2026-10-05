import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { ensureClientsSchema } from '@/lib/clients';

// POST : enregistre un document deja envoye sur Vercel Blob (le navigateur
// envoie le fichier puis transmet ici son URL). Corps : { type, nom, url, date_expiration }.
export async function POST(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureClientsSchema();
  const { id } = await params;
  const { type, nom, url, date_expiration } = await request.json();
  if (!url || !type) return NextResponse.json({ erreur: 'Type et fichier obligatoires.' }, { status: 400 });
  let cible;
  try {
    cible = new URL(url);
  } catch {
    return NextResponse.json({ erreur: 'URL invalide.' }, { status: 400 });
  }
  if (!cible.hostname.endsWith('.blob.vercel-storage.com') || !cible.pathname.startsWith('/clients/')) {
    return NextResponse.json({ erreur: 'Fichier non autorise.' }, { status: 400 });
  }
  const { rows } = await sql`
    INSERT INTO client_documents (client_id, type, nom, url, date_expiration)
    VALUES (${id}, ${String(type).trim()}, ${nom ? String(nom).trim() : null}, ${url}, ${date_expiration || null})
    RETURNING id;
  `;
  return NextResponse.json({ id: rows[0].id });
}
