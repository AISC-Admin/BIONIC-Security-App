import { sql, calculerDureeHeures } from '@/lib/db';

// Transforme un creneau du planning previsionnel en vacation effectuee
// (table shifts), pour qu'il compte dans les heures, les gains et l'export.
// - employeeId : si fourni, le creneau doit appartenir a ce salarie.
// - posteIdSecours : poste a utiliser si le creneau n'en a pas.
// - valide : vacation deja validee (true quand c'est le responsable).
// Renvoie { shiftId } ou { erreur, code, status }.
export async function executerCreneau(planningId, { employeeId = null, posteIdSecours = null, valide = false } = {}) {
  const { rows } = await sql`
    SELECT p.id, p.employee_id, p.site_id, p.poste_id,
           to_char(p.planning_date, 'YYYY-MM-DD') AS planning_date,
           p.heure_debut, p.heure_fin,
           (SELECT sh.id FROM shifts sh WHERE sh.planning_entry_id = p.id LIMIT 1) AS shift_id
    FROM planning_entries p WHERE p.id = ${planningId};
  `;
  const p = rows[0];
  if (!p || (employeeId && Number(p.employee_id) !== Number(employeeId))) {
    return { erreur: 'Creneau introuvable.', code: 'not_found', status: 404 };
  }
  if (p.shift_id) return { shiftId: p.shift_id, deja: true };

  const posteId = p.poste_id || posteIdSecours;
  if (!posteId) {
    return { erreur: 'Choisissez le poste occupe pour ce creneau.', code: 'poste_requis', status: 400 };
  }

  const { rows: taux } = await sql`
    SELECT e.taux_horaire AS perso, po.taux_horaire AS poste
    FROM employees e, postes po
    WHERE e.id = ${p.employee_id} AND po.id = ${posteId};
  `;
  if (!taux[0]) return { erreur: 'Poste invalide.', code: 'invalid_poste', status: 400 };
  const tauxHoraire = taux[0].perso != null ? Number(taux[0].perso) : Number(taux[0].poste);
  const duree = calculerDureeHeures(p.heure_debut, p.heure_fin);
  const montant = Math.round(duree * tauxHoraire * 100) / 100;

  try {
    const { rows: crees } = await sql`
      INSERT INTO shifts
        (employee_id, site_id, poste_id, shift_date, heure_debut, heure_fin,
         duree_heures, taux_horaire, montant, valide, planning_entry_id)
      VALUES
        (${p.employee_id}, ${p.site_id}, ${posteId}, ${p.planning_date}, ${p.heure_debut}, ${p.heure_fin},
         ${duree}, ${tauxHoraire}, ${montant}, ${valide}, ${p.id})
      RETURNING id;
    `;
    return { shiftId: crees[0].id };
  } catch {
    // Double clic : l'index unique a bloque un doublon, la vacation existe deja.
    return { deja: true };
  }
}
