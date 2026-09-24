import { del } from '@vercel/blob';

// Prefixe de tous les fichiers (photos, CV) de la base salaries dans le
// store Vercel Blob : sert aussi de garde-fou, la route de lecture refuse
// tout chemin qui ne commence pas par ce prefixe.
export const PREFIXE_BLOB = 'base-salaries/';

export const TYPES_PHOTO = ['image/jpeg', 'image/png', 'image/webp'];
export const TYPES_CV = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
export const TAILLE_MAX_FICHIER = 10 * 1024 * 1024; // 10 Mo

function texte(v) {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function nombre(v, { entier = false } = {}) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (Number.isNaN(n) || n < 0) return NaN;
  return entier ? Math.round(n) : n;
}

function cheminBlob(v) {
  const t = texte(v);
  if (t === null) return null;
  if (!t.startsWith(PREFIXE_BLOB) || t.includes('..')) return undefined; // invalide
  return t;
}

// Valide et normalise le corps JSON d'une fiche. Renvoie { erreur } ou
// { valeurs }.
export function validerFiche(body) {
  const nom = texte(body.nom);
  if (!nom) return { erreur: 'Le nom est obligatoire.' };

  const email = texte(body.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { erreur: "L'adresse email n'est pas valide." };
  }
  const dateNaissance = texte(body.date_naissance);
  if (dateNaissance && !/^\d{4}-\d{2}-\d{2}$/.test(dateNaissance)) {
    return { erreur: 'Date de naissance invalide.' };
  }

  const taille = nombre(body.taille_cm, { entier: true });
  const poids = nombre(body.poids_kg);
  const taux = nombre(body.taux_horaire);
  if (Number.isNaN(taille)) return { erreur: 'La taille doit etre un nombre (en cm).' };
  if (Number.isNaN(poids)) return { erreur: 'Le poids doit etre un nombre (en kg).' };
  if (Number.isNaN(taux)) return { erreur: 'Le taux horaire doit etre un nombre positif.' };

  const photo = cheminBlob(body.photo_pathname);
  const cv = cheminBlob(body.cv_pathname);
  if (photo === undefined || cv === undefined) return { erreur: 'Fichier invalide.' };

  return {
    valeurs: {
      nom,
      prenom: texte(body.prenom),
      date_naissance: dateNaissance,
      telephone: texte(body.telephone),
      email,
      carte_pro_numero: texte(body.carte_pro_numero),
      num_secu: texte(body.num_secu),
      taille_cm: taille,
      poids_kg: poids,
      ville: texte(body.ville),
      pays: texte(body.pays),
      taux_horaire: taux,
      poste: texte(body.poste),
      dispo_ete: Boolean(body.dispo_ete),
      dispo_hiver: Boolean(body.dispo_hiver),
      photo_pathname: photo,
      cv_pathname: cv,
      cv_nom_fichier: cv ? texte(body.cv_nom_fichier) : null
    }
  };
}

// Supprime des fichiers du store sans faire echouer la requete si le
// fichier n'existe deja plus (ou si Blob n'est pas encore branche).
export async function supprimerFichiers(chemins) {
  const liste = chemins.filter(Boolean);
  if (liste.length === 0) return;
  try {
    await del(liste);
  } catch (err) {
    console.error('Suppression Blob impossible :', err?.message || err);
  }
}
