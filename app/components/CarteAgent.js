import { CompassRose } from './Brand';

// Coordonnees de l'entreprise affichees au verso de la carte : fixes (pas
// de champ base de donnees), a mettre a jour ici si elles changent.
const ENTREPRISE = {
  nom: 'BIONIC STRATOM SASU',
  adresse: 'Espace des Lices, 9 Boulevard Louis Blanc, 83990 Saint-Tropez',
  telephone: '+33 6 51 92 08 90',
  email: 'bionic.stratom@gmail.com',
  rcs: 'R.C.S Frejus 992 424 291',
  tva: 'TVA FR87 992424291',
  autorisationPrefectorale: 'AUT-083-2124-11-20-20251011093',
  mission: "Agent de gardiennage, ou de surveillance humaine pouvant inclure l'usage de moyens electroniques."
};

function formatDateFr(iso) {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

// Matricule interne : utilise celui saisi par le responsable, sinon en
// suggere un a partir de l'annee d'entree (ou l'annee courante) et de
// l'identifiant du salarie -- purement indicatif, modifiable a tout moment.
function genererMatricule(employe) {
  if (employe.matricule) return employe.matricule;
  const annee = employe.date_entree ? String(employe.date_entree).slice(0, 4) : String(new Date().getFullYear());
  return `${annee} A${String(employe.id).padStart(3, '0')}`;
}

// Reference visuelle imprimee en haut de la carte, dans le meme esprit que
// le modele fourni (CAR-<departement>-<date de validite>-<annee+numero>) :
// purement decorative, ce n'est pas un numero officiel du CNAPS.
function genererCodeCarte(employe) {
  const serial = String(employe.carte_pro_numero || employe.id).replace(/\D/g, '').padStart(7, '0').slice(-7);
  const expiration = employe.carte_pro_expiration ? String(employe.carte_pro_expiration).slice(0, 10) : '0000-00-00';
  const annee = expiration.slice(0, 4) !== '0000' ? expiration.slice(0, 4) : String(new Date().getFullYear());
  return `CAR-083-${expiration}-${annee}${serial}`;
}

// Vrai des que le minimum pour un badge lisible est reuni (photo + fonction).
export function carteAgentComplete(employe) {
  return Boolean(employe && employe.photo_data && employe.fonction);
}

function PhotoAgent({ employe }) {
  if (employe.photo_data) {
    return <img src={employe.photo_data} alt="" />;
  }
  return (
    <div className="badge-photo-vide">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#9aa5b3" strokeWidth="1.4">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4.5 3.6-7.5 8-7.5s8 3 8 7.5" />
      </svg>
    </div>
  );
}

// Rendu des deux faces de la carte d'agent (recto + verso), pretes a etre
// imprimees / enregistrees en PDF via window.print() (voir la classe
// "badge-imprimable" et la regle @media print dans globals.css). Utilise
// aussi bien depuis l'espace responsable (avec apercu avant enregistrement)
// que depuis l'espace salarie (lecture seule, telechargement).
export function CarteAgent({ employe }) {
  if (!employe) return null;
  const matricule = genererMatricule(employe);
  const codeCarte = genererCodeCarte(employe);
  const numeroCartePro = employe.carte_pro_numero || String(employe.id).padStart(7, '0');

  return (
    <div className="badge-paire">
      <div className="badge-carte badge-recto">
        <div className="badge-header">
          <div className="badge-header-titre">Identification Card</div>
          <div className="badge-header-code">{codeCarte}</div>
        </div>
        <div className="badge-corps">
          <div className="badge-photo">
            <PhotoAgent employe={employe} />
          </div>
          <div className="badge-infos">
            <div className="badge-label">N&deg; Matricule</div>
            <div className="badge-valeur">{matricule}</div>
            <div className="badge-label">Nom, Prenoms</div>
            <div className="badge-valeur">
              {(employe.nom || '').toUpperCase()}
              {employe.prenom ? ` , ${employe.prenom}` : ''}
            </div>
            <div className="badge-label">Date de naissance</div>
            <div className="badge-valeur">{employe.date_naissance ? formatDateFr(employe.date_naissance) : '—'}</div>
            <div className="badge-label">Poste / Emploi</div>
            <div className="badge-valeur">{(employe.fonction || '—').toUpperCase()}</div>
          </div>
          <div className="badge-sceau">
            <CompassRose className="badge-rose" />
          </div>
        </div>
        <div className="badge-numero-carte">{numeroCartePro}</div>
        <div className="badge-footer">Bionic Stratom</div>
      </div>

      <div className="badge-carte badge-verso">
        <div className="badge-header">
          <div className="badge-header-titre">Identification Card</div>
        </div>
        <div className="badge-corps badge-corps-verso">
          <div className="badge-sceau badge-sceau-verso">
            <CompassRose className="badge-rose" />
          </div>
          <div className="badge-infos badge-infos-verso">
            <div className="badge-label">Informations societe</div>
            <div className="badge-valeur badge-valeur-multiligne">
              <strong>{ENTREPRISE.nom}</strong>
              <br />
              {ENTREPRISE.adresse}
              <br />
              Tel : {ENTREPRISE.telephone} &middot; Email : <strong>{ENTREPRISE.email}</strong>
              <br />
              {ENTREPRISE.rcs} &middot; {ENTREPRISE.tva}
            </div>
            <div className="badge-label">Autorisation prefectorale</div>
            <div className="badge-valeur badge-valeur-grande">{ENTREPRISE.autorisationPrefectorale}</div>
            <div className="badge-label">Mission</div>
            <div className="badge-valeur badge-valeur-multiligne">{ENTREPRISE.mission}</div>
          </div>
        </div>
        <div className="badge-footer">Bionic Stratom</div>
      </div>
    </div>
  );
}
