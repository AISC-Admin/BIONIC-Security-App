import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { intervalle, ajouterJours } from '@/lib/planningSite';

// PATCH /api/admin/site-planning/[id]  body: { employeeId | null, forcer? }
// Attribue le creneau a un agent (= cree le creneau dans SON planning) ou le
// remet "a pourvoir" (employeeId null => retire le creneau de son planning).
// Si l'agent a deja un creneau qui chevauche, renvoie 409 avec le detail,
// sauf si `forcer` est vrai.
export async function PATCH(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  const { employeeId, forcer } = await request.json();

  const { rows: slots } = await sql`
    SELECT id, site_id, poste_id, to_char(slot_date, 'YYYY-MM-DD') AS slot_date,
           heure_debut, heure_fin, note
    FROM site_slots WHERE id = ${id};
  `;
  const slot = slots[0];
  if (!slot) return NextResponse.json({ erreur: 'Creneau introuvable.' }, { status: 404 });

  if (employeeId && !forcer) {
    const { rows: autres } = await sql`
      SELECT to_char(p.planning_date, 'YYYY-MM-DD') AS planning_date,
             p.heure_debut, p.heure_fin, st.nom AS site
      FROM planning_entries p
      JOIN sites st ON st.id = p.site_id
      WHERE p.employee_id = ${employeeId}
        AND p.planning_date BETWEEN ${ajouterJours(slot.slot_date, -1)} AND ${ajouterJours(slot.slot_date, 1)}
        AND (p.site_slot_id IS NULL OR p.site_slot_id <> ${slot.id});
    `;
    const [d1, f1] = intervalle(slot.slot_date, slot.heure_debut, slot.heure_fin);
    const conflit = autres.find((a) => {
      const [d2, f2] = intervalle(a.planning_date, a.heure_debut, a.heure_fin);
      return d1 < f2 && d2 < f1;
    });
    if (conflit) {
      const [a, m, j] = conflit.planning_date.split('-');
      return NextResponse.json(
        {
          conflit: true,
          erreur: `Cet agent est deja planifie le ${j}/${m}/${a} de ${conflit.heure_debut} a ${conflit.heure_fin} (${conflit.site}).`
        },
        { status: 409 }
      );
    }
  }

  await sql`DELETE FROM planning_entries WHERE site_slot_id = ${slot.id};`;
  if (employeeId) {
    await sql`
      INSERT INTO planning_entries
        (employee_id, site_id, poste_id, planning_date, heure_debut, heure_fin, note, site_slot_id)
      VALUES
        (${employeeId}, ${slot.site_id}, ${slot.poste_id}, ${slot.slot_date},
         ${slot.heure_debut}, ${slot.heure_fin}, ${slot.note}, ${slot.id});
    `;
  }
  return NextResponse.json({ ok: true });
}

// DELETE : supprime le creneau du site (et donc aussi du planning de l'agent
// s'il etait attribue, via ON DELETE CASCADE).
export async function DELETE(request, { params }) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();
  const { id } = await params;
  await sql`DELETE FROM site_slots WHERE id = ${id};`;
  return NextResponse.json({ ok: true });
}
