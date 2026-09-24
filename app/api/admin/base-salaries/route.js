import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { validerFiche } from '@/lib/baseSalaries';

// GET : toutes les fiches de la base salaries (le filtrage par recherche /
// disponibilite / poste se fait cote navigateur, le volume restant modeste).
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { rows } = await sql`
    SELECT id, nom, prenom,
           to_char(date_naissance, 'YYYY-MM-DD') AS date_naissance,
           telephone, email, carte_pro_numero, taille_cm, poids_kg, ville, pays,
           taux_horaire, poste, dispo_ete, dispo_hiver,
           photo_pathname, cv_pathname, cv_nom_fichier, created_at, updated_at
    FROM staff_profiles
    ORDER BY nom, prenom;
  `;
  return NextResponse.json({ profils: rows });
}

// POST : nouvelle fiche. Photo et CV sont deja envoyes vers Vercel Blob par
// le navigateur (voir ./upload) : on recoit seulement leur chemin.
export async function POST(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  const { erreur, valeurs: v } = validerFiche(await request.json());
  if (erreur) return NextResponse.json({ erreur }, { status: 400 });

  const { rows } = await sql`
    INSERT INTO staff_profiles (
      nom, prenom, date_naissance, telephone, email, carte_pro_numero,
      taille_cm, poids_kg, ville, pays, taux_horaire, poste,
      dispo_ete, dispo_hiver, photo_pathname, cv_pathname, cv_nom_fichier
    ) VALUES (
      ${v.nom}, ${v.prenom}, ${v.date_naissance}, ${v.telephone}, ${v.email}, ${v.carte_pro_numero},
      ${v.taille_cm}, ${v.poids_kg}, ${v.ville}, ${v.pays}, ${v.taux_horaire}, ${v.poste},
      ${v.dispo_ete}, ${v.dispo_hiver}, ${v.photo_pathname}, ${v.cv_pathname}, ${v.cv_nom_fichier}
    )
    RETURNING id;
  `;
  return NextResponse.json({ id: rows[0].id });
}
