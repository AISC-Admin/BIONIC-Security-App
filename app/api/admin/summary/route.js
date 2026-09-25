import { NextResponse } from 'next/server';
import { sql, ensureSchema, calculerDureeHeures } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';
import { resynchroniserMontants } from '@/lib/vacations';

// GET /api/admin/summary?mois=YYYY-MM
// Totaux du mois par salarie et par site. Deux sources sont additionnees :
// - les vacations enregistrees (table shifts : pointages des salaries et
//   creneaux deja marques comme effectues) -> "effectue" ;
// - les creneaux du planning (planning agents + planning site attribue)
//   pas encore transformes en vacation -> "prevu". Leur montant est estime
//   avec le taux actuel du poste.
// Un creneau deja effectue n'est compte qu'une fois (via sa vacation).
export async function GET(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get('mois') || new Date().toISOString().slice(0, 7);
  await resynchroniserMontants();

  const [{ rows: employes }, { rows: effectues }, { rows: prevus }] = await Promise.all([
    sql`
      SELECT id, nom, prenom, actif FROM employees ORDER BY nom, prenom;
    `,
    sql`
      SELECT s.employee_id, s.site_id, st.nom AS site_nom,
             COUNT(s.id)::int AS nb,
             COALESCE(SUM(s.duree_heures), 0) AS heures,
             COALESCE(SUM(s.montant), 0) AS montant
      FROM shifts s
      JOIN sites st ON st.id = s.site_id
      WHERE to_char(s.shift_date, 'YYYY-MM') = ${mois}
      GROUP BY s.employee_id, s.site_id, st.nom;
    `,
    sql`
      SELECT p.employee_id, p.site_id, st.nom AS site_nom,
             p.heure_debut, p.heure_fin,
             po.taux_horaire AS taux_poste
      FROM planning_entries p
      JOIN sites st ON st.id = p.site_id
      JOIN employees e ON e.id = p.employee_id
      LEFT JOIN postes po ON po.id = p.poste_id
      WHERE to_char(p.planning_date, 'YYYY-MM') = ${mois}
        AND NOT EXISTS (SELECT 1 FROM shifts sh WHERE sh.planning_entry_id = p.id);
    `
  ]);

  const vide = () => ({ nb: 0, heures: 0, montant: 0, nbPrevus: 0, heuresPrevues: 0, montantPrevu: 0, sansTaux: 0 });
  const parEmp = new Map(); // employee_id -> totaux
  const parSiteEmp = new Map(); // site_id -> { nom, emp: Map(employee_id -> totaux) }

  function cellule(employeeId, siteId, siteNom) {
    if (!parEmp.has(employeeId)) parEmp.set(employeeId, vide());
    if (!parSiteEmp.has(siteId)) parSiteEmp.set(siteId, { nom: siteNom, emp: new Map() });
    const site = parSiteEmp.get(siteId);
    if (!site.emp.has(employeeId)) site.emp.set(employeeId, vide());
    return [parEmp.get(employeeId), site.emp.get(employeeId)];
  }

  for (const r of effectues) {
    for (const t of cellule(r.employee_id, r.site_id, r.site_nom)) {
      t.nb += r.nb;
      t.heures += Number(r.heures);
      t.montant += Number(r.montant);
    }
  }

  for (const r of prevus) {
    const duree = calculerDureeHeures(r.heure_debut, r.heure_fin);
    const taux = r.taux_poste != null ? Number(r.taux_poste) : null;
    const montant = taux != null ? Math.round(duree * taux * 100) / 100 : 0;
    for (const t of cellule(r.employee_id, r.site_id, r.site_nom)) {
      t.nbPrevus += 1;
      t.heuresPrevues += duree;
      t.montantPrevu += montant;
      if (taux == null) t.sansTaux += 1;
    }
  }

  const empParId = new Map(employes.map((e) => [e.id, e]));
  const formater = (id, t) => {
    const e = empParId.get(id) || {};
    return {
      employeeId: id,
      nom: e.nom,
      prenom: e.prenom,
      nbVacations: t.nb + t.nbPrevus,
      totalHeures: t.heures + t.heuresPrevues,
      totalMontant: Math.round((t.montant + t.montantPrevu) * 100) / 100,
      nbEffectuees: t.nb,
      heuresEffectuees: t.heures,
      montantEffectue: t.montant,
      nbPrevues: t.nbPrevus,
      heuresPrevues: t.heuresPrevues,
      montantPrevu: Math.round(t.montantPrevu * 100) / 100,
      sansTaux: t.sansTaux
    };
  };

  // Recap par salarie : tous les salaries actifs, plus les inactifs qui ont
  // quand meme de l'activite ce mois-ci.
  const parEmploye = employes
    .filter((e) => e.actif || parEmp.has(e.id))
    .map((e) => formater(e.id, parEmp.get(e.id) || vide()));

  const parSite = Array.from(parSiteEmp.entries())
    .map(([siteId, s]) => {
      const lignes = Array.from(s.emp.entries())
        .map(([id, t]) => formater(id, t))
        .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`));
      const somme = (champ) => lignes.reduce((acc, l) => acc + l[champ], 0);
      return {
        siteId,
        nom: s.nom,
        totalHeures: somme('totalHeures'),
        totalMontant: Math.round(somme('totalMontant') * 100) / 100,
        heuresPrevues: somme('heuresPrevues'),
        montantPrevu: Math.round(somme('montantPrevu') * 100) / 100,
        parEmploye: lignes
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom));

  const totalGeneral = parEmploye.reduce(
    (acc, r) => {
      acc.heures += r.totalHeures;
      acc.montant += r.totalMontant;
      acc.heuresPrevues += r.heuresPrevues;
      acc.montantPrevu += r.montantPrevu;
      return acc;
    },
    { heures: 0, montant: 0, heuresPrevues: 0, montantPrevu: 0 }
  );

  return NextResponse.json({
    mois,
    parEmploye,
    parSite,
    totalGeneral,
    nbSalariesActifs: employes.filter((e) => e.actif).length
  });
}
