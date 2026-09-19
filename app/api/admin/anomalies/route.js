import { NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { requireAdminSession } from '@/lib/auth';

// GET /api/admin/anomalies?mois=YYYY-MM
//
// Detecte les infractions au droit du travail (regles applicables aux
// agents de securite/gardiennage) sur les vacations enregistrees :
//
//  1. Poste de 12h consecutives ou plus (plusieurs vacations enchainees
//     bout a bout, sans coupure, comptent comme un seul poste continu).
//  2. Apres un tel poste de 12h+, il doit y avoir au moins 24h de repos
//     avant la vacation suivante du meme salarie.
//  3. Depassement du seuil mensuel de 151h (duree legale mensuelle de
//     reference, avertissement).
//  4. Depassement du seuil mensuel de 170h (alerte plus grave).
//
// Ces seuils sont volontairement en constantes ici (pas de config en base) :
// ce sont des regles fixes du droit du travail / de la convention, pas des
// parametres metier amenes a changer souvent.
const DUREE_MAX_CONTINUE_H = 12;
const REPOS_MIN_H = 24;
const SEUIL_MENSUEL_ATTENTION_H = 151;
const SEUIL_MENSUEL_CRITIQUE_H = 170;

function decalerJours(dateIso, delta) {
  const [a, m, j] = dateIso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + delta));
  return d.toISOString().slice(0, 10);
}

function dernierJourMois(mois) {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return d.toISOString().slice(0, 10);
}

function formatHeure(date) {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

function formatDateFr(dateIso) {
  const [a, m, j] = dateIso.split('-');
  return `${j}/${m}/${a}`;
}

// Construit un objet Date (UTC, arbitraire pour le fuseau : seules les
// durees/ecarts entre deux dates sont utilises, jamais la valeur absolue)
// a partir d'une date 'YYYY-MM-DD' et d'une heure 'HH:MM'.
function combinerDateHeure(dateIso, heure) {
  const [a, m, j] = dateIso.split('-').map(Number);
  const [h, min] = heure.split(':').map(Number);
  return new Date(Date.UTC(a, m - 1, j, h, min));
}

export async function GET(request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ erreur: 'Acces refuse.' }, { status: 403 });
  await ensureSchema();

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get('mois') || new Date().toISOString().slice(0, 7);
  const debutMois = `${mois}-01`;
  const finMois = dernierJourMois(mois);
  // Fenetre elargie de part et d'autre du mois pour detecter correctement
  // les infractions a cheval sur un changement de mois (poste de 12h le
  // 31, vacation trop proche le 1er, etc.).
  const debutFenetre = decalerJours(debutMois, -2);
  const finFenetre = decalerJours(finMois, 2);

  // shift_date est castee en texte 'YYYY-MM-DD' via to_char : le driver Neon
  // renvoie sinon un objet Date que le fuseau du serveur peut decaler d'un
  // jour, ce qui fausserait tous les calculs d'enchainement ci-dessous.
  const { rows } = await sql`
    SELECT s.id, s.employee_id, e.nom, e.prenom,
           to_char(s.shift_date, 'YYYY-MM-DD') AS shift_date,
           s.heure_debut, s.heure_fin, s.duree_heures
    FROM shifts s
    JOIN employees e ON e.id = s.employee_id
    WHERE s.shift_date BETWEEN ${debutFenetre} AND ${finFenetre}
    ORDER BY s.employee_id, s.shift_date, s.heure_debut;
  `;

  // --- Regroupement par salarie ---
  const parEmploye = new Map();
  for (const r of rows) {
    if (!parEmploye.has(r.employee_id)) {
      parEmploye.set(r.employee_id, { nom: r.nom, prenom: r.prenom, vacations: [] });
    }
    parEmploye.get(r.employee_id).vacations.push(r);
  }

  const anomalies = [];

  for (const [employeeId, info] of parEmploye) {
    const nomComplet = info.prenom ? `${info.prenom} ${info.nom}` : info.nom;

    // Vacations deja triees par date/heure (ORDER BY de la requete) :
    // on calcule chaque debut/fin en datetime puis on fusionne celles qui
    // s'enchainent sans coupure (fin de l'une == debut de la suivante, ou
    // chevauchement) en "postes" continus.
    const vacs = info.vacations.map((v) => {
      const debut = combinerDateHeure(v.shift_date, v.heure_debut);
      const fin = new Date(debut.getTime() + Number(v.duree_heures) * 3600000);
      return { ...v, debutDate: debut, finDate: fin };
    });

    const postes = [];
    for (const v of vacs) {
      const dernier = postes[postes.length - 1];
      if (dernier && v.debutDate.getTime() <= dernier.finDate.getTime()) {
        // Vacation enchainee (ou chevauchante) : prolonge le poste en cours.
        if (v.finDate.getTime() > dernier.finDate.getTime()) dernier.finDate = v.finDate;
        dernier.vacations.push(v);
      } else {
        postes.push({ debutDate: v.debutDate, finDate: v.finDate, vacations: [v] });
      }
    }

    // 1) Postes de 12h consecutives ou plus + 2) repos insuffisant derriere.
    postes.forEach((poste, idx) => {
      const dureeH = (poste.finDate.getTime() - poste.debutDate.getTime()) / 3600000;
      const dateDebutPoste = poste.debutDate.toISOString().slice(0, 10);

      if (dureeH >= DUREE_MAX_CONTINUE_H && dateDebutPoste >= debutMois && dateDebutPoste <= finMois) {
        anomalies.push({
          type: 'poste_12h',
          gravite: 'attention',
          employeeId,
          nom: nomComplet,
          date: dateDebutPoste,
          message: `Poste de ${dureeH.toFixed(2)} h consecutives le ${formatDateFr(dateDebutPoste)} (${formatHeure(poste.debutDate)} → ${formatHeure(poste.finDate)}), au-dela du maximum de ${DUREE_MAX_CONTINUE_H} h de travail continu.`
        });
      }

      if (dureeH >= DUREE_MAX_CONTINUE_H) {
        const suivant = postes[idx + 1];
        if (suivant) {
          const reposH = (suivant.debutDate.getTime() - poste.finDate.getTime()) / 3600000;
          const dateVacationSuivante = suivant.debutDate.toISOString().slice(0, 10);
          const concerneMois =
            (dateDebutPoste >= debutMois && dateDebutPoste <= finMois) ||
            (dateVacationSuivante >= debutMois && dateVacationSuivante <= finMois);
          if (reposH < REPOS_MIN_H && concerneMois) {
            anomalies.push({
              type: 'repos_insuffisant',
              gravite: 'critique',
              employeeId,
              nom: nomComplet,
              date: dateVacationSuivante,
              message: `Repos de seulement ${reposH.toFixed(2)} h apres le poste de ${dureeH.toFixed(2)} h du ${formatDateFr(dateDebutPoste)} (fin ${formatHeure(poste.finDate)}) avant la vacation suivante le ${formatDateFr(dateVacationSuivante)} a ${formatHeure(suivant.debutDate)} — minimum legal : ${REPOS_MIN_H} h.`
            });
          }
        }
      }
    });

    // 3) et 4) Total mensuel (strictement dans le mois demande, sans la
    // fenetre elargie utilisee ci-dessus pour les postes/repos).
    const totalMoisH = vacs
      .filter((v) => v.shift_date >= debutMois && v.shift_date <= finMois)
      .reduce((acc, v) => acc + Number(v.duree_heures), 0);

    if (totalMoisH > SEUIL_MENSUEL_CRITIQUE_H) {
      anomalies.push({
        type: 'depassement_170h',
        gravite: 'critique',
        employeeId,
        nom: nomComplet,
        date: finMois,
        message: `${totalMoisH.toFixed(2)} h travaillees sur le mois, au-dela du seuil de ${SEUIL_MENSUEL_CRITIQUE_H} h.`
      });
    } else if (totalMoisH > SEUIL_MENSUEL_ATTENTION_H) {
      anomalies.push({
        type: 'depassement_151h',
        gravite: 'attention',
        employeeId,
        nom: nomComplet,
        date: finMois,
        message: `${totalMoisH.toFixed(2)} h travaillees sur le mois, au-dela du seuil de ${SEUIL_MENSUEL_ATTENTION_H} h.`
      });
    }
  }

  anomalies.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.nom.localeCompare(b.nom)));

  return NextResponse.json({ mois, anomalies });
}
