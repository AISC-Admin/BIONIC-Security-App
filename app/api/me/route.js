import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireEmployeeSession } from '@/lib/auth';

// Profil complet du salarie connecte : au-dela de nom/prenom (deja dans la
// session), on relit la base pour recuperer les champs de la carte d'agent
// (fonction, date de naissance, matricule, photo, carte pro CNAPS) qui
// peuvent avoir ete mis a jour par le responsable depuis la connexion.
export async function GET() {
  const session = await requireEmployeeSession();
  if (!session) {
    return NextResponse.json({ erreur: 'Non connecte.' }, { status: 401 });
  }
  await ensureSchema();
  const { rows } = await sql`
    SELECT id, nom, prenom, fonction, matricule, photo_data,
           to_char(date_naissance, 'YYYY-MM-DD') AS date_naissance,
           carte_pro_numero,
           to_char(carte_pro_expiration, 'YYYY-MM-DD') AS carte_pro_expiration
    FROM employees WHERE id = ${session.employeeId};
  `;
  if (!rows[0]) {
    return NextResponse.json({ erreur: 'Salarie introuvable.' }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}
