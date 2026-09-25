import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { get } from '@vercel/blob';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

// Recupere la photo (store Blob prive) et la renvoie en data URL, format
// attendu par la fiche salarie / carte d'agent. Echec silencieux : la
// photo pourra toujours etre ajoutee plus tard depuis "Carte d'agent".
async function photoEnDataUrl(pathname) {
  if (!pathname) return null;
  try {
    const r = await get(pathname, { access: 'private' });
    if (r?.statusCode !== 200) return null;
    const buffer = Buffer.from(await new Response(r.stream).arrayBuffer());
    if (buffer.length > 1.5 * 1024 * 1024) return null;
    return `data:${r.blob.contentType || 'image/jpeg'};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

// POST /api/admin/base-salaries/[id]/embaucher
// body: { code, dateEntree?, tauxHoraire?, lierExistant? }
// Transforme une fiche de la base en salarie effectif (compte de pointage) :
// nom, prenom, date de naissance, carte pro, poste (fonction), taux et photo
// sont repris. Si un salarie du meme nom/prenom existe deja, renvoie 409 ;
// avec `lierExistant`, la fiche est simplement rattachee a ce salarie (et
// complete ses champs vides) sans creer de doublon.
export async function POST(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  const b = await request.json().catch(() => ({}));

  const { rows } = await sql`
    SELECT id, nom, prenom, to_char(date_naissance, 'YYYY-MM-DD') AS date_naissance,
           carte_pro_numero, taux_horaire, poste, photo_pathname, employee_id
    FROM staff_profiles WHERE id = ${id};
  `;
  const f = rows[0];
  if (!f) return NextResponse.json({ erreur: 'Fiche introuvable.' }, { status: 404 });
  if (f.employee_id) {
    return NextResponse.json({ erreur: 'Cette fiche est deja rattachee a un salarie.' }, { status: 400 });
  }

  const dateEntree = b.dateEntree && /^\d{4}-\d{2}-\d{2}$/.test(b.dateEntree) ? b.dateEntree : null;
  const tauxSaisi = b.tauxHoraire !== undefined && b.tauxHoraire !== '' && b.tauxHoraire !== null ? Number(b.tauxHoraire) : null;
  if (tauxSaisi !== null && (Number.isNaN(tauxSaisi) || tauxSaisi <= 0)) {
    return NextResponse.json({ erreur: 'Le taux horaire doit etre un nombre positif.' }, { status: 400 });
  }
  const taux = tauxSaisi ?? (f.taux_horaire != null ? Number(f.taux_horaire) : null);

  const { rows: existants } = await sql`
    SELECT id, nom, prenom FROM employees
    WHERE lower(nom) = lower(${f.nom}) AND lower(coalesce(prenom, '')) = lower(${f.prenom || ''})
    LIMIT 1;
  `;
  const existant = existants[0];

  if (existant && !b.lierExistant) {
    return NextResponse.json(
      {
        existant: true,
        erreur: `Un salarie "${existant.prenom ? `${existant.prenom} ${existant.nom}` : existant.nom}" existe deja.`
      },
      { status: 409 }
    );
  }

  let employeeId;
  if (existant) {
    employeeId = existant.id;
    // Complete uniquement les champs encore vides du salarie existant.
    await sql`
      UPDATE employees SET
        date_naissance = coalesce(date_naissance, ${f.date_naissance}),
        carte_pro_numero = coalesce(carte_pro_numero, ${f.carte_pro_numero}),
        fonction = coalesce(fonction, ${f.poste}),
        taux_horaire = coalesce(taux_horaire, ${taux}),
        date_entree = coalesce(date_entree, ${dateEntree})
      WHERE id = ${employeeId};
    `;
  } else {
    const code = String(b.code || '').trim();
    if (code.length < 4) {
      return NextResponse.json({ erreur: 'Le code de connexion doit faire au moins 4 caracteres.' }, { status: 400 });
    }
    const codeHash = await bcrypt.hash(code, 10);
    const photo = await photoEnDataUrl(f.photo_pathname);
    const { rows: crees } = await sql`
      INSERT INTO employees
        (nom, prenom, code_hash, taux_horaire, date_naissance, carte_pro_numero, fonction, date_entree, photo_data)
      VALUES
        (${f.nom}, ${f.prenom}, ${codeHash}, ${taux}, ${f.date_naissance}, ${f.carte_pro_numero},
         ${f.poste}, ${dateEntree}, ${photo})
      RETURNING id;
    `;
    employeeId = crees[0].id;
  }

  await sql`UPDATE staff_profiles SET employee_id = ${employeeId}, updated_at = now() WHERE id = ${f.id};`;
  return NextResponse.json({ ok: true, employeeId, lie: Boolean(existant) });
}
