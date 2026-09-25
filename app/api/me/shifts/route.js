import { NextResponse } from 'next/server';
import { sql, ensureSchema, calculerDureeHeures } from '@/lib/db';
import { requireEmployeeSession } from '@/lib/auth';
import { resynchroniserMontants } from '@/lib/vacations';

// GET /api/me/shifts?mois=YYYY-MM  (par defaut : mois en cours)
export async function GET(request) {
  const session = await requireEmployeeSession();
  if (!session) {
    return NextResponse.json({ erreur: 'Non connecte.' }, { status: 401 });
  }
  await ensureSchema();
  await resynchroniserMontants();

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get('mois') || new Date().toISOString().slice(0, 7);

  const { rows } = await sql`
    SELECT s.id, s.shift_date, s.heure_debut, s.heure_fin, s.duree_heures,
           s.taux_horaire, s.montant, s.valide, s.modifie_par_manager,
           st.nom AS site, po.nom AS poste
    FROM shifts s
    JOIN sites st ON st.id = s.site_id
    JOIN postes po ON po.id = s.poste_id
    WHERE s.employee_id = ${session.employeeId}
      AND to_char(s.shift_date, 'YYYY-MM') = ${mois}
    ORDER BY s.shift_date DESC, s.heure_debut DESC;
  `;

  return NextResponse.json({ mois, vacations: rows });
}

// POST /api/me/shifts
// body: { date: 'YYYY-MM-DD', entries: [{ site_id, poste_id, heure_debut, heure_fin }, ...] }
// Une seule entree = "vacation simple". Plusieurs entrees le meme jour = "multivacation".
export async function POST(request) {
  const session = await requireEmployeeSession();
  if (!session) {
    return NextResponse.json({ erreur: 'Non connecte.' }, { status: 401 });
  }
  await ensureSchema();

  const body = await request.json();
  const { date, entries } = body || {};

  if (!date || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json(
      { erreur: 'Date et au moins une vacation sont requises.', code: 'missing_shift_fields' },
      { status: 400 }
    );
  }
  if (entries.length > 6) {
    return NextResponse.json(
      { erreur: 'Trop de vacations pour une seule journee (max 6).', code: 'too_many_shifts' },
      { status: 400 }
    );
  }

  // Le taux horaire vient toujours du poste choisi.

  const crees = [];
  for (const entree of entries) {
    const { site_id, poste_id, heure_debut, heure_fin } = entree;
    if (!site_id || !poste_id || !heure_debut || !heure_fin) {
      return NextResponse.json(
        {
          erreur: 'Chaque vacation doit avoir un site, un poste, une heure de debut et de fin.',
          code: 'incomplete_entry'
        },
        { status: 400 }
      );
    }

    const { rows: posteRows } = await sql`
      SELECT taux_horaire FROM postes WHERE id = ${poste_id} AND actif = true LIMIT 1;
    `;
    if (posteRows.length === 0) {
      return NextResponse.json({ erreur: 'Poste invalide.', code: 'invalid_poste' }, { status: 400 });
    }
    const tauxHoraire = Number(posteRows[0].taux_horaire);
    const dureeHeures = calculerDureeHeures(heure_debut, heure_fin);
    const montant = Math.round(dureeHeures * tauxHoraire * 100) / 100;

    const { rows } = await sql`
      INSERT INTO shifts
        (employee_id, site_id, poste_id, shift_date, heure_debut, heure_fin,
         duree_heures, taux_horaire, montant)
      VALUES
        (${session.employeeId}, ${site_id}, ${poste_id}, ${date}, ${heure_debut}, ${heure_fin},
         ${dureeHeures}, ${tauxHoraire}, ${montant})
      RETURNING id;
    `;
    crees.push(rows[0].id);
  }

  return NextResponse.json({ ok: true, ids: crees });
}
