import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

// GET /api/admin/planning?mois=YYYY-MM
// Liste tout le planning envoye pour ce mois, tous salaries confondus.
export async function GET(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get('mois') || new Date().toISOString().slice(0, 7);

  const { rows } = await sql`
    SELECT p.id, p.employee_id, e.nom, e.prenom,
           to_char(p.planning_date, 'YYYY-MM-DD') AS planning_date,
           p.heure_debut, p.heure_fin, p.note,
           st.nom AS site, po.nom AS poste
    FROM planning_entries p
    JOIN employees e ON e.id = p.employee_id
    JOIN sites st ON st.id = p.site_id
    LEFT JOIN postes po ON po.id = p.poste_id
    WHERE to_char(p.planning_date, 'YYYY-MM') = ${mois}
    ORDER BY e.nom, e.prenom, p.planning_date, p.heure_debut;
  `;
  return NextResponse.json({ mois, planning: rows });
}

// POST /api/admin/planning
// body: { employeeIds: [1,2,...], entries: [{ date, siteId, posteId, heureDebut, heureFin, note }, ...] }
// Cree une entree de planning pour CHAQUE salarie choisi x CHAQUE creneau
// saisi (produit croise) : pratique pour envoyer le meme planning de semaine
// a toute une equipe en une fois.
export async function POST(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  const body = await request.json();
  const { employeeIds, entries } = body || {};

  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    return NextResponse.json({ erreur: 'Choisissez au moins un salarie.' }, { status: 400 });
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ erreur: 'Ajoutez au moins un creneau au planning.' }, { status: 400 });
  }
  if (entries.length > 62) {
    return NextResponse.json({ erreur: 'Trop de creneaux en un seul envoi (max 62, soit environ deux mois).' }, { status: 400 });
  }

  for (const entree of entries) {
    const { date, siteId, heureDebut, heureFin } = entree;
    if (!date || !siteId || !heureDebut || !heureFin) {
      return NextResponse.json(
        { erreur: 'Chaque creneau doit avoir une date, un site, une heure de debut et de fin.' },
        { status: 400 }
      );
    }
  }

  let creees = 0;
  for (const employeeId of employeeIds) {
    for (const entree of entries) {
      const { date, siteId, posteId, heureDebut, heureFin, note } = entree;
      await sql`
        INSERT INTO planning_entries (employee_id, site_id, poste_id, planning_date, heure_debut, heure_fin, note)
        VALUES (${employeeId}, ${siteId}, ${posteId || null}, ${date}, ${heureDebut}, ${heureFin}, ${note || null});
      `;
      creees += 1;
    }
  }

  return NextResponse.json({ ok: true, creees });
}

// DELETE /api/admin/planning?employee_id=&mois=
// Efface d'un coup tout le planning d'un salarie pour un mois donne (pratique
// pour renvoyer une version corrigee sans supprimer creneau par creneau).
export async function DELETE(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employee_id');
  const mois = searchParams.get('mois');
  if (!employeeId || !mois) {
    return NextResponse.json({ erreur: 'employee_id et mois sont requis.' }, { status: 400 });
  }

  await sql`
    DELETE FROM planning_entries
    WHERE employee_id = ${employeeId} AND to_char(planning_date, 'YYYY-MM') = ${mois};
  `;
  return NextResponse.json({ ok: true });
}
