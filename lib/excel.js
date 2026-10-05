import ExcelJS from 'exceljs';

// rows attendus : { nom, prenom, shift_date, site, poste, heure_debut,
//                    heure_fin, duree_heures, taux_horaire, montant, valide }
export async function construireClasseurPointages(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Application de pointage';
  workbook.created = new Date();

  // --- Feuille 1 : le detail de chaque vacation, toujours a jour ---
  const feuillePointages = workbook.addWorksheet('Pointages');
  feuillePointages.columns = [
    { header: 'Nom', key: 'nom', width: 16 },
    { header: 'Prenom', key: 'prenom', width: 14 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Site', key: 'site', width: 20 },
    { header: 'Poste', key: 'poste', width: 18 },
    { header: 'Debut', key: 'debut', width: 8 },
    { header: 'Fin', key: 'fin', width: 8 },
    { header: 'Heures', key: 'heures', width: 10 },
    { header: 'Taux horaire (EUR)', key: 'taux', width: 16 },
    { header: 'Montant (EUR)', key: 'montant', width: 14 },
    { header: 'Validee', key: 'valide', width: 10 }
  ];
  feuillePointages.getRow(1).font = { bold: true };

  for (const r of rows) {
    feuillePointages.addRow({
      nom: r.nom,
      prenom: r.prenom || '',
      date: r.shift_date,
      site: r.site,
      poste: r.poste,
      debut: r.heure_debut,
      fin: r.heure_fin,
      heures: Number(r.duree_heures),
      taux: Number(r.taux_horaire),
      montant: Number(r.montant),
      valide: r.valide ? 'Oui' : 'Non'
    });
  }
  feuillePointages.getColumn('heures').numFmt = '0.00';
  feuillePointages.getColumn('taux').numFmt = '#,##0.00';
  feuillePointages.getColumn('montant').numFmt = '#,##0.00';

  // --- Feuille 2 : recapitulatif mensuel par salarie ---
  const totauxParCle = new Map();
  for (const r of rows) {
    const mois = String(r.shift_date).slice(0, 7); // YYYY-MM
    const cle = `${r.employee_id}__${mois}`;
    if (!totauxParCle.has(cle)) {
      totauxParCle.set(cle, {
        nom: r.nom,
        prenom: r.prenom || '',
        mois,
        heures: 0,
        montant: 0
      });
    }
    const total = totauxParCle.get(cle);
    total.heures += Number(r.duree_heures);
    total.montant += Number(r.montant);
  }

  const feuilleRecap = workbook.addWorksheet('Recap mensuel');
  feuilleRecap.columns = [
    { header: 'Nom', key: 'nom', width: 16 },
    { header: 'Prenom', key: 'prenom', width: 14 },
    { header: 'Mois', key: 'mois', width: 10 },
    { header: 'Total heures', key: 'heures', width: 14 },
    { header: 'Total montant (EUR)', key: 'montant', width: 18 }
  ];
  feuilleRecap.getRow(1).font = { bold: true };

  const totauxTries = [...totauxParCle.values()].sort(
    (a, b) => a.mois.localeCompare(b.mois) || a.nom.localeCompare(b.nom)
  );
  for (const t of totauxTries) {
    feuilleRecap.addRow({
      nom: t.nom,
      prenom: t.prenom,
      mois: t.mois,
      heures: Math.round(t.heures * 100) / 100,
      montant: Math.round(t.montant * 100) / 100
    });
  }
  feuilleRecap.getColumn('heures').numFmt = '0.00';
  feuilleRecap.getColumn('montant').numFmt = '#,##0.00';

  return workbook;
}

// Classeur de facturation mensuelle pour la compta.
// facturation : resultat de calculerFacturation(mois) (lib/clients.js)
// detail : vacations validees du mois { shift_date, site, client, poste, nom, prenom, heure_debut, heure_fin, duree_heures }
export async function construireClasseurFacturation(facturation, detail) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Application de pointage';
  workbook.created = new Date();
  const euros = '#,##0.00 "EUR"';

  // --- Feuille 1 : recapitulatif par site (Poste, heures, tarif, montant),
  // une ligne par societe emettrice quand la prestation est repartie ---
  const f = workbook.addWorksheet('Facturation');
  f.columns = [
    { header: 'Client', key: 'client', width: 28 },
    { header: 'Site', key: 'site', width: 24 },
    { header: 'Poste', key: 'poste', width: 20 },
    { header: 'Societe emettrice', key: 'societe', width: 22 },
    { header: 'Heures', key: 'heures', width: 10 },
    { header: 'Tarif horaire HT', key: 'tarif', width: 17 },
    { header: 'Montant HT', key: 'montant', width: 15 }
  ];
  f.getRow(1).font = { bold: true };
  f.views = [{ state: 'frozen', ySplit: 1 }];

  // Lignes par societe pour les feuilles dediees.
  const parSociete = new Map();

  for (const s of facturation.sites) {
    for (const l of s.lignes) {
      const parts = l.repartition && l.repartition.length > 0 ? l.repartition : [{ societe: '', heures: l.heures, montant: l.montant }];
      for (const p of parts) {
        const row = f.addRow({
          client: s.client || '(site sans client)',
          site: s.site,
          poste: l.poste,
          societe: p.societe,
          heures: p.heures,
          tarif: l.tarif ?? 'A renseigner',
          montant: p.montant ?? ''
        });
        if (l.tarif === null) row.getCell('tarif').font = { color: { argb: 'FFD94C4C' }, bold: true };
        if (p.societe) {
          if (!parSociete.has(p.societe)) parSociete.set(p.societe, []);
          parSociete.get(p.societe).push({ client: s.client || '(site sans client)', site: s.site, poste: l.poste, heures: p.heures, tarif: l.tarif, montant: p.montant });
        }
      }
    }
    const total = f.addRow({ client: '', site: `Total ${s.site}`, heures: s.heures, montant: s.montant });
    total.font = { bold: true };
    total.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EBF1' } };
    });
    f.addRow({});
  }
  const g = f.addRow({ client: 'TOTAL GENERAL', heures: facturation.total.heures, montant: facturation.total.montant });
  g.font = { bold: true, size: 12 };
  for (const t of facturation.parSociete || []) {
    const r = f.addRow({ client: `Total ${t.societe}`, heures: t.heures, montant: t.montant });
    r.font = { bold: true };
  }
  f.getColumn('heures').numFmt = '0.00';
  f.getColumn('tarif').numFmt = euros;
  f.getColumn('montant').numFmt = euros;

  // --- Une feuille par societe emettrice : ce qu'elle doit facturer ---
  for (const [societe, lignes] of parSociete) {
    const nomFeuille = societe.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    const fs = workbook.addWorksheet(nomFeuille);
    fs.columns = [
      { header: 'Client', key: 'client', width: 28 },
      { header: 'Site', key: 'site', width: 24 },
      { header: 'Poste', key: 'poste', width: 20 },
      { header: 'Heures', key: 'heures', width: 10 },
      { header: 'Tarif horaire HT', key: 'tarif', width: 17 },
      { header: 'Montant HT', key: 'montant', width: 15 }
    ];
    fs.getRow(1).font = { bold: true };
    fs.views = [{ state: 'frozen', ySplit: 1 }];
    let h = 0;
    let m = 0;
    for (const l of lignes) {
      fs.addRow({ client: l.client, site: l.site, poste: l.poste, heures: l.heures, tarif: l.tarif ?? 'A renseigner', montant: l.montant ?? '' });
      h += l.heures;
      m += l.montant || 0;
    }
    const tot = fs.addRow({ client: `TOTAL ${societe}`, heures: Math.round(h * 100) / 100, montant: Math.round(m * 100) / 100 });
    tot.font = { bold: true };
    fs.getColumn('heures').numFmt = '0.00';
    fs.getColumn('tarif').numFmt = euros;
    fs.getColumn('montant').numFmt = euros;
  }

  // --- Feuille 2 : detail des vacations validees (justificatif) ---
  const d = workbook.addWorksheet('Detail vacations');
  d.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Client', key: 'client', width: 26 },
    { header: 'Site', key: 'site', width: 22 },
    { header: 'Poste', key: 'poste', width: 18 },
    { header: 'Nom', key: 'nom', width: 16 },
    { header: 'Prenom', key: 'prenom', width: 14 },
    { header: 'Debut', key: 'debut', width: 8 },
    { header: 'Fin', key: 'fin', width: 8 },
    { header: 'Heures', key: 'heures', width: 10 }
  ];
  d.getRow(1).font = { bold: true };
  d.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of detail) {
    d.addRow({
      date: r.shift_date,
      client: r.client || '',
      site: r.site,
      poste: r.poste,
      nom: r.nom,
      prenom: r.prenom || '',
      debut: r.heure_debut,
      fin: r.heure_fin,
      heures: Number(r.duree_heures)
    });
  }
  d.getColumn('heures').numFmt = '0.00';

  return workbook;
}
