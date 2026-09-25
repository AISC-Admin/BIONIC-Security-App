import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { ajouterJours, jourSemaine, decouper } from '@/lib/planningSite';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE_RE = /^\d{2}:\d{2}$/;

// GET /api/admin/site-planning?site_id=&du=YYYY-MM-DD&au=YYYY-MM-DD
// Creneaux du site sur la periode, avec l'agent attribue (s'il y en a un).
export async function GET(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  const params = request.nextUrl.searchParams;
  const siteId = params.get('site_id');
  const du = params.get('du');
  const au = params.get('au');
  if (!siteId || !DATE_RE.test(du || '') || !DATE_RE.test(au || '')) {
    return NextResponse.json({ erreur: 'site_id, du et au sont requis.' }, { status: 400 });
  }

  const { rows } = await sql`
    SELECT s.id, s.site_id, s.poste_id, po.nom AS poste,
           to_char(s.slot_date, 'YYYY-MM-DD') AS slot_date,
           s.heure_debut, s.heure_fin, s.note,
           pe.id AS planning_id, pe.employee_id, e.nom, e.prenom
    FROM site_slots s
    LEFT JOIN postes po ON po.id = s.poste_id
    LEFT JOIN planning_entries pe ON pe.site_slot_id = s.id
    LEFT JOIN employees e ON e.id = pe.employee_id
    WHERE s.site_id = ${siteId} AND s.slot_date BETWEEN ${du} AND ${au}
    ORDER BY s.slot_date, s.heure_debut, s.id;
  `;
  return NextResponse.json({ creneaux: rows });
}

// POST /api/admin/site-planning
// body: { siteId, posteId, dateDebut, dateFin, jours: [1..7], heureDebut,
//         heureFin, nbAgents, decoupage (heures, optionnel), note }
// Genere les creneaux "a pourvoir" : chaque jour coche de la periode, autant
// de fois que d'agents necessaires, eventuellement decoupes par tranches.
export async function POST(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  const b = await request.json();
  const siteId = Number(b.siteId);
  const posteId = b.posteId ? Number(b.posteId) : null;
  const jours = Array.isArray(b.jours) ? b.jours.map(Number) : [];
  const nbAgents = Math.max(1, Math.min(20, Number(b.nbAgents) || 1));
  const decoupage = b.decoupage ? Number(b.decoupage) : null;
  const note = b.note ? String(b.note).trim() || null : null;

  if (!siteId) return NextResponse.json({ erreur: 'Choisissez un site.' }, { status: 400 });
  if (!DATE_RE.test(b.dateDebut || '') || !DATE_RE.test(b.dateFin || '')) {
    return NextResponse.json({ erreur: 'Dates de debut et de fin requises.' }, { status: 400 });
  }
  if (b.dateFin < b.dateDebut) {
    return NextResponse.json({ erreur: 'La date de fin est avant la date de debut.' }, { status: 400 });
  }
  if (!HEURE_RE.test(b.heureDebut || '') || !HEURE_RE.test(b.heureFin || '')) {
    return NextResponse.json({ erreur: 'Heures de debut et de fin requises.' }, { status: 400 });
  }
  if (jours.length === 0) return NextResponse.json({ erreur: 'Cochez au moins un jour.' }, { status: 400 });
  if (decoupage !== null && (Number.isNaN(decoupage) || decoupage <= 0)) {
    return NextResponse.json({ erreur: 'Decoupage invalide.' }, { status: 400 });
  }

  const aCreer = [];
  for (let d = b.dateDebut; d <= b.dateFin; d = ajouterJours(d, 1)) {
    if (!jours.includes(jourSemaine(d))) continue;
    for (const t of decouper(d, b.heureDebut, b.heureFin, decoupage)) {
      for (let i = 0; i < nbAgents; i += 1) aCreer.push(t);
    }
    if (aCreer.length > 1000) break;
  }
  if (aCreer.length === 0) {
    return NextResponse.json({ erreur: 'Aucun jour coche dans cette periode.' }, { status: 400 });
  }
  if (aCreer.length > 1000) {
    return NextResponse.json(
      { erreur: 'Trop de creneaux en une fois (1000 max.) : reduisez la periode ou le decoupage.' },
      { status: 400 }
    );
  }

  // Insertion en une seule requete (json_to_recordset) : rapide meme pour
  // plusieurs centaines de creneaux.
  await sql`
    INSERT INTO site_slots (site_id, poste_id, slot_date, heure_debut, heure_fin, note)
    SELECT ${siteId}, ${posteId}, t.d::date, t.hd, t.hf, ${note}
    FROM json_to_recordset(${JSON.stringify(aCreer.map((t) => ({ d: t.date, hd: t.heureDebut, hf: t.heureFin })))}::json)
      AS t(d text, hd text, hf text);
  `;
  return NextResponse.json({ ok: true, crees: aCreer.length });
}
