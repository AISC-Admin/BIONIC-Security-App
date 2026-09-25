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
  const corps = await request.json();
  const { employeeId, forcer } = corps;

  const { rows: slots } = await sql`
    SELECT id, site_id, poste_id, to_char(slot_date, 'YYYY-MM-DD') AS slot_date,
           heure_debut, heure_fin, note
    FROM site_slots WHERE id = ${id};
  `;
  const slot = slots[0];
  if (!slot) return NextResponse.json({ erreur: 'Creneau introuvable.' }, { status: 404 });

  if (corps.modification) return modifierCreneau(slot, corps.modification, forcer);

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

const HEURE_RE = /^\d{2}:\d{2}$/;

// Modification d'un creneau (poste, horaires, note), qu'il soit a pourvoir
// ou deja attribue. Si un agent est attribue, son planning est mis a jour
// aussi (l'agent reste le meme). Une vacation deja creee a partir de ce
// creneau ("effectue") n'est pas modifiee : on le signale en retour.
async function modifierCreneau(slot, m, forcer) {
  const posteId = m.posteId ? Number(m.posteId) : null;
  const heureDebut = String(m.heureDebut || '');
  const heureFin = String(m.heureFin || '');
  const note = m.note ? String(m.note).trim() || null : null;

  if (!HEURE_RE.test(heureDebut) || !HEURE_RE.test(heureFin)) {
    return NextResponse.json({ erreur: 'Heures de debut et de fin requises (HH:MM).' }, { status: 400 });
  }
  if (heureDebut === heureFin) {
    return NextResponse.json({ erreur: "L'heure de fin doit etre differente de l'heure de debut." }, { status: 400 });
  }
  if (posteId) {
    const { rows } = await sql`SELECT id FROM postes WHERE id = ${posteId} AND supprime = false;`;
    if (!rows[0]) return NextResponse.json({ erreur: 'Poste introuvable.' }, { status: 400 });
  }

  const { rows: entrees } = await sql`
    SELECT id, employee_id FROM planning_entries WHERE site_slot_id = ${slot.id};
  `;
  const entree = entrees[0];

  // Horaires modifies sur un creneau attribue : on verifie que l'agent
  // n'a pas deja autre chose au meme moment (sauf si on force).
  const horairesChanges = heureDebut !== slot.heure_debut || heureFin !== slot.heure_fin;
  if (entree && horairesChanges && !forcer) {
    const { rows: autres } = await sql`
      SELECT to_char(p.planning_date, 'YYYY-MM-DD') AS planning_date,
             p.heure_debut, p.heure_fin, st.nom AS site
      FROM planning_entries p
      JOIN sites st ON st.id = p.site_id
      WHERE p.employee_id = ${entree.employee_id}
        AND p.id <> ${entree.id}
        AND p.planning_date BETWEEN ${ajouterJours(slot.slot_date, -1)} AND ${ajouterJours(slot.slot_date, 1)};
    `;
    const [d1, f1] = intervalle(slot.slot_date, heureDebut, heureFin);
    const conflit = autres.find((a) => {
      const [d2, f2] = intervalle(a.planning_date, a.heure_debut, a.heure_fin);
      return d1 < f2 && d2 < f1;
    });
    if (conflit) {
      const [a, mo, j] = conflit.planning_date.split('-');
      return NextResponse.json(
        {
          conflit: true,
          erreur: `Avec ces horaires, l'agent serait en double : il est deja planifie le ${j}/${mo}/${a} de ${conflit.heure_debut} a ${conflit.heure_fin} (${conflit.site}).`
        },
        { status: 409 }
      );
    }
  }

  await sql`
    UPDATE site_slots
    SET poste_id = ${posteId}, heure_debut = ${heureDebut}, heure_fin = ${heureFin}, note = ${note}
    WHERE id = ${slot.id};
  `;

  let dejaEffectue = false;
  if (entree) {
    await sql`
      UPDATE planning_entries
      SET poste_id = ${posteId}, heure_debut = ${heureDebut}, heure_fin = ${heureFin}, note = ${note}
      WHERE id = ${entree.id};
    `;
    const { rows: vacs } = await sql`SELECT id FROM shifts WHERE planning_entry_id = ${entree.id} LIMIT 1;`;
    dejaEffectue = Boolean(vacs[0]);
  }
  return NextResponse.json({ ok: true, dejaEffectue });
}
