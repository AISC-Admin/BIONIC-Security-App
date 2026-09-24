import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { validerFiche, supprimerFichiers } from '@/lib/baseSalaries';

async function lireFichiers(id) {
  const { rows } = await sql`
    SELECT photo_pathname, cv_pathname, passeport_pathname FROM staff_profiles WHERE id = ${id};
  `;
  return rows[0] || null;
}

// PUT : remplace toute la fiche. Si la photo ou le CV ont change (ou ont
// ete retires), l'ancien fichier est supprime du store Blob.
export async function PUT(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;

  const avant = await lireFichiers(id);
  if (!avant) return NextResponse.json({ erreur: 'Fiche introuvable.' }, { status: 404 });

  const { erreur, valeurs: v } = validerFiche(await request.json());
  if (erreur) return NextResponse.json({ erreur }, { status: 400 });

  await sql`
    UPDATE staff_profiles SET
      nom = ${v.nom}, prenom = ${v.prenom}, date_naissance = ${v.date_naissance},
      telephone = ${v.telephone}, email = ${v.email}, carte_pro_numero = ${v.carte_pro_numero},
      num_secu = ${v.num_secu}, iban = ${v.iban}, bic = ${v.bic},
      taille_cm = ${v.taille_cm}, poids_kg = ${v.poids_kg}, ville = ${v.ville}, pays = ${v.pays},
      taux_horaire = ${v.taux_horaire}, poste = ${v.poste},
      dispo_ete = ${v.dispo_ete}, dispo_hiver = ${v.dispo_hiver},
      photo_pathname = ${v.photo_pathname}, cv_pathname = ${v.cv_pathname},
      cv_nom_fichier = ${v.cv_nom_fichier},
      passeport_pathname = ${v.passeport_pathname}, passeport_nom_fichier = ${v.passeport_nom_fichier},
      updated_at = now()
    WHERE id = ${id};
  `;

  await supprimerFichiers([
    avant.photo_pathname !== v.photo_pathname ? avant.photo_pathname : null,
    avant.cv_pathname !== v.cv_pathname ? avant.cv_pathname : null,
    avant.passeport_pathname !== v.passeport_pathname ? avant.passeport_pathname : null
  ]);
  return NextResponse.json({ ok: true });
}

// DELETE : supprime la fiche et ses fichiers (photo, CV).
export async function DELETE(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  const avant = await lireFichiers(id);
  if (!avant) return NextResponse.json({ ok: true });
  await sql`DELETE FROM staff_profiles WHERE id = ${id};`;
  await supprimerFichiers([avant.photo_pathname, avant.cv_pathname, avant.passeport_pathname]);
  return NextResponse.json({ ok: true });
}
