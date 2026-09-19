import { neon } from '@neondatabase/serverless';

// DATABASE_URL est la variable posee automatiquement par l'integration
// Neon de Vercel (POSTGRES_URL reste dispo pour compatibilite avec
// d'anciens templates : on la prend en repli). La connexion est creee au
// premier usage reel (jamais au chargement du module) pour que `next build`
// reussisse meme avant que la base ne soit branchee au projet.
let sqlClient = null;

function getSql() {
  if (sqlClient) return sqlClient;
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      "Aucune base de donnees connectee : ajoutez l'integration Neon a ce projet Vercel (onglet Storage) puis redeployez."
    );
  }
  // fullResults: true fait que chaque appel `sql\`...\`` renvoie
  // { rows, rowCount, ... } au lieu d'un simple tableau, ce qui garde le
  // meme usage que sur les autres clients Postgres (const { rows } = ...).
  sqlClient = neon(connectionString, { fullResults: true });
  return sqlClient;
}

// Proxy tagged-template : permet de continuer a ecrire `sql\`...\`` partout
// dans le code comme avec un client classique, tout en initialisant la
// vraie connexion seulement a ce moment-la.
export function sql(strings, ...values) {
  return getSql()(strings, ...values);
}

// Cree les tables si elles n'existent pas encore. Appelee au debut de
// chaque route API : sans etat serveur persistant (Vercel est serverless),
// c'est la facon la plus simple de garantir que le schema existe, sans
// etape d'installation manuelle a faire dans la console Postgres.
let schemaReady = false;

export async function ensureSchema() {
  if (schemaReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      nom TEXT NOT NULL,
      prenom TEXT,
      code_hash TEXT NOT NULL,
      taux_horaire NUMERIC(10,2),
      actif BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  // Ajoute la colonne si la table existait deja avant cette fonctionnalite
  // (deploiement existant qui se met a jour).
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS taux_horaire NUMERIC(10,2);`;

  // Carte professionnelle CNAPS (agents de securite) : numero (NUB, Numero
  // de Beneficiaire Unique a 7 chiffres) et date d'expiration. Il n'existe
  // pas d'API publique du CNAPS pour verifier automatiquement une carte (a
  // ce jour, seul un formulaire web existe sur leur "Espace de consultation
  // des titres") : la validite est donc deduite de la date d'expiration
  // saisie par le responsable, apres verification manuelle sur ce site.
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS carte_pro_numero TEXT;`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS carte_pro_expiration DATE;`;
  // Date a laquelle le responsable a enregistre avoir verifie la carte sur
  // le site du CNAPS (trace de controle, distincte de la date d'expiration
  // du titre lui-meme).
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS carte_pro_date_verification DATE;`;

  // Dates d'entree / de sortie du salarie dans la societe.
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_entree DATE;`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_sortie DATE;`;

  // Carte d'agent (badge professionnel imprimable) : fonction affichee sur
  // la carte, date de naissance, matricule interne (auto-suggere si vide,
  // voir components/CarteAgent.js), et la photo elle-meme. La photo est
  // stockee en base64 (data URL) directement en base : elle est redimensionnee
  // et compressee cote navigateur avant l'envoi (voir admin/page.js) pour
  // rester legere, ce qui evite d'avoir a brancher un service de stockage
  // de fichiers externe.
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS fonction TEXT;`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_naissance DATE;`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS matricule TEXT;`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_data TEXT;`;

  await sql`
    CREATE TABLE IF NOT EXISTS sites (
      id SERIAL PRIMARY KEY,
      nom TEXT NOT NULL UNIQUE,
      actif BOOLEAN NOT NULL DEFAULT true
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS postes (
      id SERIAL PRIMARY KEY,
      nom TEXT NOT NULL UNIQUE,
      taux_horaire NUMERIC(10,2) NOT NULL,
      actif BOOLEAN NOT NULL DEFAULT true
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS shifts (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      site_id INTEGER NOT NULL REFERENCES sites(id),
      poste_id INTEGER NOT NULL REFERENCES postes(id),
      shift_date DATE NOT NULL,
      heure_debut TEXT NOT NULL,
      heure_fin TEXT NOT NULL,
      duree_heures NUMERIC(6,2) NOT NULL,
      taux_horaire NUMERIC(10,2) NOT NULL,
      montant NUMERIC(10,2) NOT NULL,
      valide BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_shifts_employee ON shifts(employee_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(shift_date);`;

  // Planning previsionnel envoye par le responsable : des creneaux prevus
  // (pas encore travailles) que le salarie consulte en lecture seule depuis
  // son espace. Distinct de `shifts`, qui sont les heures reellement
  // pointees par le salarie apres coup.
  await sql`
    CREATE TABLE IF NOT EXISTS planning_entries (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      site_id INTEGER NOT NULL REFERENCES sites(id),
      poste_id INTEGER REFERENCES postes(id),
      planning_date DATE NOT NULL,
      heure_debut TEXT NOT NULL,
      heure_fin TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_planning_employee ON planning_entries(employee_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_planning_date ON planning_entries(planning_date);`;

  schemaReady = true;
}

// Duree en heures entre deux horaires "HH:MM". Gere les vacations de nuit
// (heure de fin plus petite que l'heure de debut => on ajoute 24h).
export function calculerDureeHeures(heureDebut, heureFin) {
  const [h1, m1] = heureDebut.split(':').map(Number);
  const [h2, m2] = heureFin.split(':').map(Number);
  let minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}
