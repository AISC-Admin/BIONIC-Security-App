import { sql, ensureSchema } from '@/lib/db';

// "Base clients facturation" : fiches clients (coordonnees, contacts,
// infos de facturation), rattachement des sites a un client (un client peut
// avoir plusieurs sites, un site appartient a un seul client), grille des
// taux horaires de FACTURATION par site et par poste (distincts des taux de
// paie des salaries), et documents contractuels (RIB, KBIS, contrat...)
// stockes en prive sur Vercel Blob (seule l'URL est gardee ici).
let pret = false;

export async function ensureClientsSchema() {
  if (pret) return;
  await ensureSchema();
  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      raison_sociale TEXT NOT NULL,
      forme_juridique TEXT,
      siret TEXT,
      tva_intra TEXT,
      adresse TEXT,
      code_postal TEXT,
      ville TEXT,
      pays TEXT,
      contact_nom TEXT,
      contact_fonction TEXT,
      contact_email TEXT,
      contact_telephone TEXT,
      email_facturation TEXT,
      conditions_paiement TEXT,
      notes TEXT,
      actif BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;`;
  await sql`
    CREATE TABLE IF NOT EXISTS tarifs_facturation (
      id SERIAL PRIMARY KEY,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      poste_id INTEGER NOT NULL REFERENCES postes(id) ON DELETE CASCADE,
      taux NUMERIC(10,2) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (site_id, poste_id)
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS client_documents (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      nom TEXT,
      url TEXT NOT NULL,
      date_expiration DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_client_documents_client ON client_documents(client_id);`;

  // Societes emettrices des factures : BIONIC Stratom SAS (par defaut, la
  // premiere par ordre) puis BIONIC Stratom LLC.
  await sql`
    CREATE TABLE IF NOT EXISTS societes_facturation (
      id SERIAL PRIMARY KEY,
      nom TEXT NOT NULL UNIQUE,
      ordre INTEGER NOT NULL DEFAULT 0,
      actif BOOLEAN NOT NULL DEFAULT true
    );
  `;
  // Mise a jour unique des bases deja creees avec l'ancienne liste
  // (BIONIC Stratom LLC, SovereignMan) : tant que la SAS n'existe pas, on
  // passe la LLC en 2e position et on retire SovereignMan (supprimee si elle
  // n'a jamais servi, sinon simplement desactivee pour garder l'historique).
  const { rows: sas } = await sql`SELECT id FROM societes_facturation WHERE nom = 'BIONIC Stratom SAS';`;
  if (!sas[0]) {
    await sql`UPDATE societes_facturation SET ordre = 2 WHERE nom = 'BIONIC Stratom LLC';`;
    await sql`
      DELETE FROM societes_facturation s
      WHERE s.nom = 'SovereignMan'
        AND NOT EXISTS (SELECT 1 FROM repartition_facturation r WHERE r.societe_id = s.id);
    `.catch(() => {});
    await sql`UPDATE societes_facturation SET actif = false, ordre = 99 WHERE nom = 'SovereignMan';`;
  }
  await sql`
    INSERT INTO societes_facturation (nom, ordre) VALUES ('BIONIC Stratom SAS', 1), ('BIONIC Stratom LLC', 2)
    ON CONFLICT (nom) DO NOTHING;
  `;
  // Societe qui facture par defaut ce client (sinon : la societe par defaut).
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS societe_id INTEGER REFERENCES societes_facturation(id) ON DELETE SET NULL;`;
  // Repartition des heures d'une prestation (mois + site + poste) entre les
  // societes emettrices. Les heures non reparties vont a la societe par
  // defaut du client (ou a la societe par defaut globale).
  await sql`
    CREATE TABLE IF NOT EXISTS repartition_facturation (
      mois TEXT NOT NULL,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      poste_id INTEGER NOT NULL REFERENCES postes(id) ON DELETE CASCADE,
      societe_id INTEGER NOT NULL REFERENCES societes_facturation(id) ON DELETE CASCADE,
      heures NUMERIC(8,2) NOT NULL,
      PRIMARY KEY (mois, site_id, poste_id, societe_id)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sites_client ON sites(client_id);`;
  pret = true;
}

export const TYPES_DOCUMENTS = [
  'RIB',
  'KBIS',
  "Certificat d'enregistrement",
  'Contrat',
  'Avenant',
  'Attestation URSSAF',
  'Attestation d\'assurance',
  'Bon de commande',
  'Autre'
];

export function nettoyerClient(data) {
  const txt = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  };
  return {
    raison_sociale: txt(data.raison_sociale),
    forme_juridique: txt(data.forme_juridique),
    siret: txt(data.siret),
    tva_intra: txt(data.tva_intra),
    adresse: txt(data.adresse),
    code_postal: txt(data.code_postal),
    ville: txt(data.ville),
    pays: txt(data.pays),
    contact_nom: txt(data.contact_nom),
    contact_fonction: txt(data.contact_fonction),
    contact_email: txt(data.contact_email),
    contact_telephone: txt(data.contact_telephone),
    email_facturation: txt(data.email_facturation),
    conditions_paiement: txt(data.conditions_paiement),
    notes: txt(data.notes),
    actif: data.actif === undefined ? true : !!data.actif,
    societe_id: data.societe_id === '' || data.societe_id == null ? null : Number(data.societe_id)
  };
}

// Listing de facturation d'un mois (YYYY-MM) : uniquement les vacations
// VALIDEES par le manager, regroupees par site puis par poste, avec le taux
// de facturation de la grille (null si non renseigne).
export async function calculerFacturation(mois) {
  await ensureClientsSchema();
  const { rows } = await sql`
    SELECT st.id AS site_id, st.nom AS site, c.id AS client_id, c.raison_sociale AS client,
           c.societe_id AS client_societe_id,
           po.id AS poste_id, po.nom AS poste,
           SUM(s.duree_heures)::float AS heures,
           COUNT(*)::int AS nb_vacations,
           tf.taux::float AS tarif
    FROM shifts s
    JOIN sites st ON st.id = s.site_id
    JOIN postes po ON po.id = s.poste_id
    LEFT JOIN clients c ON c.id = st.client_id
    LEFT JOIN tarifs_facturation tf ON tf.site_id = s.site_id AND tf.poste_id = s.poste_id
    WHERE s.valide = true AND to_char(s.shift_date, 'YYYY-MM') = ${mois}
    GROUP BY st.id, st.nom, c.id, c.raison_sociale, c.societe_id, po.id, po.nom, tf.taux
    ORDER BY lower(coalesce(c.raison_sociale, 'zzz')), lower(st.nom), lower(po.nom);
  `;
  const { rows: attente } = await sql`
    SELECT COUNT(*)::int AS nb, coalesce(SUM(duree_heures), 0)::float AS heures
    FROM shifts WHERE valide = false AND to_char(shift_date, 'YYYY-MM') = ${mois};
  `;

  const { rows: societes } = await sql`
    SELECT id, nom, actif FROM societes_facturation ORDER BY ordre, id;
  `;
  const { rows: reps } = await sql`
    SELECT site_id, poste_id, societe_id, heures::float AS heures
    FROM repartition_facturation WHERE mois = ${mois};
  `;
  const repParLigne = new Map();
  for (const r of reps) {
    const cle = `${r.site_id}_${r.poste_id}`;
    if (!repParLigne.has(cle)) repParLigne.set(cle, new Map());
    repParLigne.get(cle).set(r.societe_id, r.heures);
  }
  const defautGlobal = (societes.find((x) => x.actif) || societes[0])?.id ?? null;
  const arrondi = (v) => Math.round(v * 100) / 100;
  const totauxSocietes = new Map(societes.map((x) => [x.id, { societe_id: x.id, societe: x.nom, heures: 0, montant: 0 }]));

  const sitesMap = new Map();
  for (const r of rows) {
    if (!sitesMap.has(r.site_id)) {
      sitesMap.set(r.site_id, {
        site_id: r.site_id,
        site: r.site,
        client_id: r.client_id,
        client: r.client,
        lignes: [],
        heures: 0,
        montant: 0,
        tarifsManquants: 0
      });
    }
    const site = sitesMap.get(r.site_id);
    const heures = Math.round(r.heures * 100) / 100;
    const montant = r.tarif !== null ? Math.round(heures * r.tarif * 100) / 100 : null;
    // Repartition entre societes : heures saisies + reste a la societe par defaut.
    const defaut = r.client_societe_id ?? defautGlobal;
    const saisies = repParLigne.get(`${r.site_id}_${r.poste_id}`) || new Map();
    const totalSaisi = [...saisies.values()].reduce((a, h) => a + h, 0);
    const reste = arrondi(heures - totalSaisi);
    const parSociete = new Map(saisies);
    if (reste > 0 && defaut !== null) parSociete.set(defaut, arrondi((parSociete.get(defaut) || 0) + reste));
    const repartition = [...parSociete.entries()]
      .filter(([, h]) => h > 0)
      .map(([societe_id, h]) => {
        const m = r.tarif !== null ? arrondi(h * r.tarif) : null;
        const t = totauxSocietes.get(societe_id);
        if (t) {
          t.heures += h;
          if (m !== null) t.montant += m;
        }
        return { societe_id, societe: t?.societe || '?', heures: arrondi(h), montant: m };
      });
    site.lignes.push({
      poste_id: r.poste_id,
      poste: r.poste,
      heures,
      nb_vacations: r.nb_vacations,
      tarif: r.tarif,
      montant,
      repartition,
      repartie: saisies.size > 0,
      societe_defaut_id: defaut,
      ecart: reste < 0 ? -reste : 0
    });
    site.heures += heures;
    if (montant !== null) site.montant += montant;
    else site.tarifsManquants += 1;
  }
  const sites = [...sitesMap.values()].map((s) => ({
    ...s,
    heures: Math.round(s.heures * 100) / 100,
    montant: Math.round(s.montant * 100) / 100
  }));
  return {
    mois,
    sites,
    total: {
      heures: Math.round(sites.reduce((a, s) => a + s.heures, 0) * 100) / 100,
      montant: Math.round(sites.reduce((a, s) => a + s.montant, 0) * 100) / 100,
      tarifsManquants: sites.reduce((a, s) => a + s.tarifsManquants, 0),
      sitesSansClient: sites.filter((s) => !s.client_id).length,
      ecarts: sites.reduce((a, s) => a + s.lignes.filter((l) => l.ecart > 0).length, 0)
    },
    societes,
    parSociete: [...totauxSocietes.values()]
      .filter((t) => t.heures > 0)
      .map((t) => ({ ...t, heures: arrondi(t.heures), montant: arrondi(t.montant) })),
    enAttente: attente[0]
  };
}
