import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql, ensureSchema } from '@/lib/db';
import { poserCookieSession, getIdentifiantsManager } from '@/lib/auth';

export async function POST(request) {
  await ensureSchema();
  const { nom, code } = await request.json();

  if (!nom || !code) {
    return NextResponse.json({ erreur: 'Nom et code requis.', code: 'missing_fields' }, { status: 400 });
  }

  // Meme ecran de connexion pour tout le monde : si le nom et le code
  // correspondent aux identifiants du responsable, on ouvre directement
  // l'espace admin plutot que l'espace salarie.
  const manager = getIdentifiantsManager();
  if (nom.trim().toLowerCase() === manager.nom.toLowerCase() && String(code).trim() === manager.code) {
    await poserCookieSession({ role: 'admin' });
    return NextResponse.json({ role: 'admin' });
  }

  // Plusieurs salaries peuvent partager le meme nom de famille : on
  // recupere tous les comptes actifs correspondants et on verifie le code
  // sur chacun, jusqu'a trouver le bon (le code est ce qui identifie la
  // personne de facon unique, pas le nom seul).
  const { rows } = await sql`
    SELECT id, nom, prenom, code_hash, actif
    FROM employees
    WHERE lower(nom) = lower(${nom.trim()}) AND actif = true;
  `;

  let employe = null;
  for (const candidat of rows) {
    if (await bcrypt.compare(String(code).trim(), candidat.code_hash)) {
      employe = candidat;
      break;
    }
  }

  if (!employe) {
    return NextResponse.json({ erreur: 'Nom ou code incorrect.', code: 'invalid_credentials' }, { status: 401 });
  }

  await poserCookieSession({
    role: 'employee',
    employeeId: employe.id,
    nom: employe.nom,
    prenom: employe.prenom
  });

  return NextResponse.json({
    id: employe.id,
    nom: employe.nom,
    prenom: employe.prenom
  });
}
