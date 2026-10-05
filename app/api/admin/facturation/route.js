import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth';
import { calculerFacturation } from '@/lib/clients';

// GET /api/admin/facturation?mois=YYYY-MM : listing de facturation du mois
// (vacations validees uniquement), regroupe par site puis par poste.
export async function GET(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  const mois = new URL(request.url).searchParams.get('mois');
  if (!/^\d{4}-\d{2}$/.test(mois || '')) return NextResponse.json({ erreur: 'Mois invalide.' }, { status: 400 });
  return NextResponse.json(await calculerFacturation(mois));
}
