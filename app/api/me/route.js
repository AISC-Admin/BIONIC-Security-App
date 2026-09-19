import { NextResponse } from 'next/server';
import { requireEmployeeSession } from '@/lib/auth';

export async function GET() {
  const session = await requireEmployeeSession();
  if (!session) {
    return NextResponse.json({ erreur: 'Non connecte.' }, { status: 401 });
  }
  return NextResponse.json({
    id: session.employeeId,
    nom: session.nom,
    prenom: session.prenom
  });
}
