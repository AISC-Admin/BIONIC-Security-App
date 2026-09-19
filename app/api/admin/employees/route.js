import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  // carte_pro_expiration est castee en texte (to_char) plutot que renvoyee
  // comme DATE brute : selon le driver Postgres et le fuseau horaire du
  // serveur, une DATE peut etre reinterpretee comme un instant et decalee
  // d'un jour a la conversion JSON. En texte "YYYY-MM-DD", aucune ambiguite.
  // photo_data n'est volontairement pas incluse ici (elle peut peser
  // plusieurs dizaines de Ko par salarie) : elle est recuperee a la demande
  // via GET /api/admin/employees/[id] quand on ouvre la carte d'agent.
  const { rows } = await sql`
    SELECT id, nom, prenom, taux_horaire, actif, created_at,
           carte_pro_numero,
           to_char(carte_pro_expiration, 'YYYY-MM-DD') AS carte_pro_expiration,
           to_char(carte_pro_date_verification, 'YYYY-MM-DD') AS carte_pro_date_verification,
           to_char(date_entree, 'YYYY-MM-DD') AS date_entree,
           to_char(date_sortie, 'YYYY-MM-DD') AS date_sortie,
           fonction, matricule,
           to_char(date_naissance, 'YYYY-MM-DD') AS date_naissance,
           (photo_data IS NOT NULL) AS a_photo
    FROM employees
    ORDER BY nom, prenom;
  `;
  return NextResponse.json({ employees: rows });
}

export async function POST(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  const { nom, prenom, code, taux_horaire } = await request.json();
  if (!nom || !code) {
    return NextResponse.json({ erreur: 'Nom et code requis.' }, { status: 400 });
  }
  if (String(code).trim().length < 4) {
    return NextResponse.json({ erreur: 'Le code doit faire au moins 4 caracteres.' }, { status: 400 });
  }
  const tauxPersonnel =
    taux_horaire !== undefined && taux_horaire !== null && taux_horaire !== ''
      ? Number(taux_horaire)
      : null;
  if (tauxPersonnel !== null && (Number.isNaN(tauxPersonnel) || tauxPersonnel <= 0)) {
    return NextResponse.json({ erreur: 'Le taux horaire doit etre un nombre positif.' }, { status: 400 });
  }

  const codeHash = await bcrypt.hash(String(code).trim(), 10);
  const { rows } = await sql`
    INSERT INTO employees (nom, prenom, code_hash, taux_horaire)
    VALUES (${nom.trim()}, ${prenom ? prenom.trim() : null}, ${codeHash}, ${tauxPersonnel})
    RETURNING id, nom, prenom, taux_horaire, actif, created_at;
  `;
  return NextResponse.json({ employee: rows[0] });
}
