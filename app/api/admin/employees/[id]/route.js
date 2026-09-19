import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

// GET : fiche complete d'un salarie, y compris la photo (volontairement
// exclue de la liste GET /api/admin/employees pour ne pas alourdir chaque
// rafraichissement) — utilisee a l'ouverture du panneau "Carte d'agent".
export async function GET(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  const { rows } = await sql`
    SELECT id, nom, prenom, taux_horaire, actif, created_at,
           carte_pro_numero,
           to_char(carte_pro_expiration, 'YYYY-MM-DD') AS carte_pro_expiration,
           to_char(carte_pro_date_verification, 'YYYY-MM-DD') AS carte_pro_date_verification,
           to_char(date_entree, 'YYYY-MM-DD') AS date_entree,
           to_char(date_sortie, 'YYYY-MM-DD') AS date_sortie,
           fonction, matricule, photo_data,
           to_char(date_naissance, 'YYYY-MM-DD') AS date_naissance
    FROM employees WHERE id = ${id};
  `;
  if (!rows[0]) return NextResponse.json({ erreur: 'Salarie introuvable.' }, { status: 404 });
  return NextResponse.json({ employee: rows[0] });
}

// PATCH : modifier nom / prenom / actif / reinitialiser le code
export async function PATCH(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  const body = await request.json();
  const { nom, prenom, actif, nouveauCode } = body;

  if (nom !== undefined) {
    await sql`UPDATE employees SET nom = ${nom.trim()} WHERE id = ${id};`;
  }
  if (prenom !== undefined) {
    await sql`UPDATE employees SET prenom = ${prenom ? prenom.trim() : null} WHERE id = ${id};`;
  }
  if (actif !== undefined) {
    await sql`UPDATE employees SET actif = ${actif} WHERE id = ${id};`;
  }
  if (nouveauCode) {
    if (String(nouveauCode).trim().length < 4) {
      return NextResponse.json({ erreur: 'Le code doit faire au moins 4 caracteres.' }, { status: 400 });
    }
    const codeHash = await bcrypt.hash(String(nouveauCode).trim(), 10);
    await sql`UPDATE employees SET code_hash = ${codeHash} WHERE id = ${id};`;
  }
  // tauxHoraire : cle presente mais vide/null => on efface (le poste refait
  // foi) ; cle presente avec un nombre => on impose ce taux au salarie.
  if (Object.prototype.hasOwnProperty.call(body, 'tauxHoraire')) {
    const { tauxHoraire } = body;
    if (tauxHoraire === null || tauxHoraire === '') {
      await sql`UPDATE employees SET taux_horaire = NULL WHERE id = ${id};`;
    } else {
      const valeur = Number(tauxHoraire);
      if (Number.isNaN(valeur) || valeur <= 0) {
        return NextResponse.json({ erreur: 'Le taux horaire doit etre un nombre positif.' }, { status: 400 });
      }
      await sql`UPDATE employees SET taux_horaire = ${valeur} WHERE id = ${id};`;
    }
  }

  // Carte professionnelle CNAPS : numero (NUB), date d'expiration du titre
  // et date a laquelle le responsable a enregistre avoir verifie la carte
  // sur le site du CNAPS (pas d'API publique disponible, voir lib/db.js).
  if (Object.prototype.hasOwnProperty.call(body, 'cartePro')) {
    const { numero, expiration, dateVerification } = body.cartePro || {};
    const numeroPropre = numero !== undefined && numero !== null ? String(numero).trim() : '';
    await sql`UPDATE employees SET carte_pro_numero = ${numeroPropre || null} WHERE id = ${id};`;
    await sql`UPDATE employees SET carte_pro_expiration = ${expiration || null} WHERE id = ${id};`;
    await sql`UPDATE employees SET carte_pro_date_verification = ${dateVerification || null} WHERE id = ${id};`;
  }

  // Dates d'entree / de sortie du salarie dans la societe.
  if (Object.prototype.hasOwnProperty.call(body, 'dates')) {
    const { entree, sortie } = body.dates || {};
    await sql`UPDATE employees SET date_entree = ${entree || null} WHERE id = ${id};`;
    await sql`UPDATE employees SET date_sortie = ${sortie || null} WHERE id = ${id};`;
  }

  // Fiche "carte d'agent" : fonction affichee sur le badge, date de
  // naissance, matricule (laisser vide => auto-suggere a l'affichage, voir
  // components/CarteAgent.js).
  if (Object.prototype.hasOwnProperty.call(body, 'identite')) {
    const { fonction, dateNaissance, matricule } = body.identite || {};
    await sql`UPDATE employees SET fonction = ${fonction ? fonction.trim() : null} WHERE id = ${id};`;
    await sql`UPDATE employees SET date_naissance = ${dateNaissance || null} WHERE id = ${id};`;
    await sql`UPDATE employees SET matricule = ${matricule ? matricule.trim() : null} WHERE id = ${id};`;
  }

  // Photo (scannee ou prise en photo) : deja redimensionnee/compressee en
  // data URL cote navigateur avant l'envoi. `photo: null` efface la photo
  // enregistree ; cle absente => on ne touche pas a la photo existante.
  if (Object.prototype.hasOwnProperty.call(body, 'photo')) {
    await sql`UPDATE employees SET photo_data = ${body.photo || null} WHERE id = ${id};`;
  }

  const { rows } = await sql`
    SELECT id, nom, prenom, taux_horaire, actif, created_at,
           carte_pro_numero,
           to_char(carte_pro_expiration, 'YYYY-MM-DD') AS carte_pro_expiration,
           to_char(carte_pro_date_verification, 'YYYY-MM-DD') AS carte_pro_date_verification,
           to_char(date_entree, 'YYYY-MM-DD') AS date_entree,
           to_char(date_sortie, 'YYYY-MM-DD') AS date_sortie,
           fonction, matricule, photo_data,
           to_char(date_naissance, 'YYYY-MM-DD') AS date_naissance
    FROM employees WHERE id = ${id};
  `;
  return NextResponse.json({ employee: rows[0] });
}

// DELETE : supprime le salarie ET ses vacations (garder une trace ?
// preferez plutot desactiver via PATCH { actif: false } pour conserver
// l'historique dans le recap Excel).
export async function DELETE(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  await sql`DELETE FROM employees WHERE id = ${id};`;
  return NextResponse.json({ ok: true });
}
