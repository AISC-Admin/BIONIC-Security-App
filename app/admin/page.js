'use client';

import { useEffect, useState, useCallback } from 'react';
import { Brand } from '../components/Brand';
import { CarteAgent } from '../components/CarteAgent';
import { BaseSalaries } from '../components/BaseSalaries';
import { PlanningSite } from '../components/PlanningSite';

const MOIS_LABELS = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'
];

function moisCourant() {
  return new Date().toISOString().slice(0, 7);
}

function libelleMois(mois) {
  const [annee, m] = mois.split('-').map(Number);
  return `${MOIS_LABELS[m - 1]} ${annee}`;
}

function decalerMois(mois, delta) {
  const [annee, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(annee, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatEuros(valeur) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(valeur || 0);
}

const ONGLETS = [
  { id: 'vacations', label: 'Vacations' },
  { id: 'employees', label: 'Salaries' },
  { id: 'base', label: 'Base salaries' },
  { id: 'sites', label: 'Sites' },
  { id: 'postes', label: 'Postes' },
  { id: 'planning', label: 'Planning' },
  { id: 'rapport', label: 'Rapport' },
  { id: 'anomalies', label: 'Anomalies' }
];

// Libelles et styles des types d'anomalies renvoyees par
// /api/admin/anomalies (voir ce fichier pour le detail des regles).
const ANOMALIE_LABELS = {
  poste_12h: 'Poste de 12h+',
  repos_insuffisant: 'Repos < 24h',
  depassement_151h: 'Depassement 151h/mois',
  depassement_170h: 'Depassement 170h/mois'
};

function planEntreeVide() {
  return { date: '', site_id: '', poste_id: '', heure_debut: '', heure_fin: '', note: '' };
}

export default function AdminPage() {
  const [chargement, setChargement] = useState(true);
  const [connecte, setConnecte] = useState(false);
  const [motDePasse, setMotDePasse] = useState('');
  const [erreurConnexion, setErreurConnexion] = useState('');
  const [connexionEnCours, setConnexionEnCours] = useState(false);

  const [onglet, setOnglet] = useState('vacations');
  const [mois, setMois] = useState(moisCourant());

  const [summary, setSummary] = useState(null);
  const [vacations, setVacations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [postes, setPostes] = useState([]);
  const [filtreEmploye, setFiltreEmploye] = useState('');
  const [filtreSite, setFiltreSite] = useState('');
  const [planning, setPlanning] = useState([]);
  const [anomalies, setAnomalies] = useState([]);

  const verifierSession = useCallback(async () => {
    const res = await fetch(`/api/admin/summary?mois=${moisCourant()}`);
    setConnecte(res.ok);
    if (res.ok) setSummary(await res.json());
    setChargement(false);
  }, []);

  useEffect(() => {
    verifierSession();
  }, [verifierSession]);

  const chargerTout = useCallback(async () => {
    const params = new URLSearchParams({ mois });
    if (filtreEmploye) params.set('employee_id', filtreEmploye);
    if (filtreSite) params.set('site_id', filtreSite);

    const [rSummary, rVac, rEmp, rSites, rPostes, rPlanning, rAnomalies] = await Promise.all([
      fetch(`/api/admin/summary?mois=${mois}`),
      fetch(`/api/admin/shifts?${params.toString()}`),
      fetch('/api/admin/employees'),
      fetch('/api/admin/sites'),
      fetch('/api/admin/postes'),
      fetch(`/api/admin/planning?mois=${mois}`),
      fetch(`/api/admin/anomalies?mois=${mois}`)
    ]);
    if (rSummary.ok) setSummary(await rSummary.json());
    if (rVac.ok) setVacations((await rVac.json()).vacations);
    if (rEmp.ok) setEmployees((await rEmp.json()).employees);
    if (rSites.ok) setSites((await rSites.json()).sites);
    if (rPostes.ok) setPostes((await rPostes.json()).postes);
    if (rPlanning.ok) setPlanning((await rPlanning.json()).planning);
    if (rAnomalies.ok) setAnomalies((await rAnomalies.json()).anomalies);
  }, [mois, filtreEmploye, filtreSite]);

  useEffect(() => {
    if (connecte) chargerTout();
  }, [connecte, chargerTout]);

  async function connexion(e) {
    e.preventDefault();
    setErreurConnexion('');
    setConnexionEnCours(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: motDePasse })
      });
      if (!res.ok) {
        const data = await res.json();
        setErreurConnexion(data.erreur || 'Connexion impossible.');
        return;
      }
      setConnecte(true);
    } finally {
      setConnexionEnCours(false);
    }
  }

  async function deconnexion() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setConnecte(false);
  }

  async function toggleValide(id, valide) {
    await fetch(`/api/admin/shifts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valide })
    });
    chargerTout();
  }

  async function supprimerVacation(id) {
    await fetch(`/api/admin/shifts/${id}`, { method: 'DELETE' });
    chargerTout();
  }

  // --- Modification des horaires d'une vacation par le responsable ---
  const [editionVacation, setEditionVacation] = useState(null);
  const [heureDebutEdit, setHeureDebutEdit] = useState('');
  const [heureFinEdit, setHeureFinEdit] = useState('');
  const [modifVacationEnCours, setModifVacationEnCours] = useState(false);
  const [erreurModifVacation, setErreurModifVacation] = useState('');

  function ouvrirModifVacation(v) {
    setEditionVacation(v.id);
    setHeureDebutEdit(v.heure_debut);
    setHeureFinEdit(v.heure_fin);
    setErreurModifVacation('');
  }

  function annulerModifVacation() {
    setEditionVacation(null);
    setErreurModifVacation('');
  }

  async function enregistrerModifVacation(id) {
    setModifVacationEnCours(true);
    setErreurModifVacation('');
    try {
      const res = await fetch(`/api/admin/shifts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heure_debut: heureDebutEdit, heure_fin: heureFinEdit })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErreurModifVacation(data.erreur || 'Modification impossible.');
        return;
      }
      setEditionVacation(null);
      chargerTout();
    } finally {
      setModifVacationEnCours(false);
    }
  }

  async function exporterExcel(portee) {
    const url = portee === 'mois' ? `/api/admin/export?mois=${mois}` : '/api/admin/export';
    window.location.href = url;
  }

  // --- Salaries ---
  const [nouvNom, setNouvNom] = useState('');
  const [nouvPrenom, setNouvPrenom] = useState('');
  const [nouvCode, setNouvCode] = useState('');
  const [nouvTauxPerso, setNouvTauxPerso] = useState('');
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [codeReset, setCodeReset] = useState({});
  const [tauxEdit, setTauxEdit] = useState({});
  const [nomEdit, setNomEdit] = useState({});
  const [prenomEdit, setPrenomEdit] = useState({});
  const [editionOuverte, setEditionOuverte] = useState(null);
  const [carteOuverte, setCarteOuverte] = useState(null);
  const [carteNumeroEdit, setCarteNumeroEdit] = useState({});
  const [carteExpirationEdit, setCarteExpirationEdit] = useState({});
  const [carteVerifEdit, setCarteVerifEdit] = useState({});
  const [datesOuverte, setDatesOuverte] = useState(null);
  const [dateEntreeEdit, setDateEntreeEdit] = useState({});
  const [dateSortieEdit, setDateSortieEdit] = useState({});

  // --- Carte d'agent (badge professionnel) ---
  const [badgeOuverte, setBadgeOuverte] = useState(null);
  const [badgeDetail, setBadgeDetail] = useState(null);
  const [badgeChargement, setBadgeChargement] = useState(false);
  const [fonctionEdit, setFonctionEdit] = useState({});
  const [naissanceEdit, setNaissanceEdit] = useState({});
  const [matriculeEdit, setMatriculeEdit] = useState({});
  const [photoApercu, setPhotoApercu] = useState({});

  async function ajouterEmploye(e) {
    e.preventDefault();
    setAjoutEnCours(true);
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: nouvNom,
          prenom: nouvPrenom,
          code: nouvCode,
          taux_horaire: nouvTauxPerso
        })
      });
      if (res.ok) {
        setNouvNom('');
        setNouvPrenom('');
        setNouvCode('');
        setNouvTauxPerso('');
        chargerTout();
      }
    } finally {
      setAjoutEnCours(false);
    }
  }

  async function toggleEmployeActif(id, actif) {
    await fetch(`/api/admin/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actif })
    });
    chargerTout();
  }

  async function reinitialiserCode(id) {
    const nouveauCode = codeReset[id];
    if (!nouveauCode || nouveauCode.length < 4) return;
    await fetch(`/api/admin/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nouveauCode })
    });
    setCodeReset((c) => ({ ...c, [id]: '' }));
    chargerTout();
  }

  async function enregistrerTauxPerso(id) {
    const valeurBrute = tauxEdit[id];
    // Champ vide envoye explicitement => efface le taux personnel (le
    // poste refait foi). Sinon on envoie le nombre saisi.
    const tauxHoraire = valeurBrute === undefined || valeurBrute === '' ? null : valeurBrute;
    await fetch(`/api/admin/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tauxHoraire })
    });
    setTauxEdit((c) => ({ ...c, [id]: undefined }));
    chargerTout();
  }

  function ouvrirEditionNom(employe) {
    setEditionOuverte((courant) => (courant === employe.id ? null : employe.id));
    setNomEdit((c) => ({ ...c, [employe.id]: employe.nom }));
    setPrenomEdit((c) => ({ ...c, [employe.id]: employe.prenom || '' }));
  }

  async function enregistrerNomPrenom(id) {
    const nom = (nomEdit[id] || '').trim();
    if (!nom) return;
    await fetch(`/api/admin/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, prenom: (prenomEdit[id] || '').trim() || null })
    });
    setEditionOuverte(null);
    chargerTout();
  }

  async function supprimerEmploye(id, libelle) {
    const confirme = window.confirm(
      `Supprimer definitivement ${libelle} ?\n\nCela supprime aussi toutes ses vacations enregistrees (irreversible). Pour une simple erreur de saisie, preferez plutot corriger le nom ou desactiver le compte.`
    );
    if (!confirme) return;
    await fetch(`/api/admin/employees/${id}`, { method: 'DELETE' });
    chargerTout();
  }

  // --- Carte professionnelle CNAPS ---
  // Pas d'API publique du CNAPS pour verifier une carte automatiquement (ce
  // n'est ni propose ni prevu par le CNAPS a ce jour) : le numero et la date
  // d'expiration sont saisis a la main par le responsable, apres verification
  // manuelle sur le site officiel de consultation des titres (lien fourni).
  const CNAPS_URL = 'https://espace-consultation.cnaps.interieur.gouv.fr/annuaire/app/annuaire-public';

  function ouvrirCartePro(employe) {
    setCarteOuverte((courant) => (courant === employe.id ? null : employe.id));
    setCarteNumeroEdit((c) => ({ ...c, [employe.id]: employe.carte_pro_numero || '' }));
    setCarteExpirationEdit((c) => ({
      ...c,
      [employe.id]: employe.carte_pro_expiration ? String(employe.carte_pro_expiration).slice(0, 10) : ''
    }));
    // Date de verification : on propose aujourd'hui par defaut quand elle
    // n'est pas deja renseignee, pour que "j'ai verifie, j'enregistre" soit
    // un seul geste ; le responsable peut la changer avant d'enregistrer.
    setCarteVerifEdit((c) => ({
      ...c,
      [employe.id]: employe.carte_pro_date_verification
        ? String(employe.carte_pro_date_verification).slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    }));
  }

  async function enregistrerCartePro(id) {
    await fetch(`/api/admin/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cartePro: {
          numero: (carteNumeroEdit[id] || '').trim(),
          expiration: carteExpirationEdit[id] || null,
          dateVerification: carteVerifEdit[id] || null
        }
      })
    });
    setCarteOuverte(null);
    chargerTout();
  }

  // Statut deduit localement de la date d'expiration : pas de carte
  // enregistree => rien a afficher ; sinon Valide (vert) / Non valide
  // (rouge) selon que la date est depassee ou non.
  function statutCartePro(e) {
    if (!e.carte_pro_numero && !e.carte_pro_expiration) return null;
    if (!e.carte_pro_expiration) return { valide: false, label: 'Non valide' };
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const expiration = String(e.carte_pro_expiration).slice(0, 10);
    return expiration >= aujourdHui ? { valide: true, label: 'Valide' } : { valide: false, label: 'Non valide' };
  }

  // --- Dates d'entree / de sortie ---
  function ouvrirDates(employe) {
    setDatesOuverte((courant) => (courant === employe.id ? null : employe.id));
    setDateEntreeEdit((c) => ({
      ...c,
      [employe.id]: employe.date_entree ? String(employe.date_entree).slice(0, 10) : ''
    }));
    setDateSortieEdit((c) => ({
      ...c,
      [employe.id]: employe.date_sortie ? String(employe.date_sortie).slice(0, 10) : ''
    }));
  }

  async function enregistrerDates(id) {
    await fetch(`/api/admin/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dates: {
          entree: dateEntreeEdit[id] || null,
          sortie: dateSortieEdit[id] || null
        }
      })
    });
    setDatesOuverte(null);
    chargerTout();
  }

  function formatDateFr(iso) {
    if (!iso) return '';
    const [a, m, j] = String(iso).slice(0, 10).split('-');
    return `${j}/${m}/${a}`;
  }

  // --- Carte d'agent (badge professionnel) ---
  async function ouvrirBadge(employe) {
    if (badgeOuverte === employe.id) {
      setBadgeOuverte(null);
      setBadgeDetail(null);
      return;
    }
    setBadgeOuverte(employe.id);
    setBadgeDetail(null);
    setFonctionEdit((c) => ({ ...c, [employe.id]: c[employe.id] ?? 'Agent de prevention et de securite' }));
    setNaissanceEdit((c) => ({ ...c, [employe.id]: c[employe.id] ?? '' }));
    setMatriculeEdit((c) => ({ ...c, [employe.id]: c[employe.id] ?? '' }));
    setBadgeChargement(true);
    try {
      const res = await fetch(`/api/admin/employees/${employe.id}`);
      if (res.ok) {
        const data = await res.json();
        setBadgeDetail(data.employee);
        setFonctionEdit((c) => ({ ...c, [employe.id]: data.employee.fonction || 'Agent de prevention et de securite' }));
        setNaissanceEdit((c) => ({ ...c, [employe.id]: data.employee.date_naissance || '' }));
        setMatriculeEdit((c) => ({ ...c, [employe.id]: data.employee.matricule || '' }));
      }
    } finally {
      setBadgeChargement(false);
    }
  }

  // Redimensionne/recadre la photo choisie (format portrait 4:5) et la
  // compresse en JPEG cote navigateur avant envoi : garde la fiche legere
  // sans avoir besoin d'un service de stockage de fichiers externe.
  function redimensionnerPhoto(fichier) {
    return new Promise((resolve, reject) => {
      const lecteur = new FileReader();
      lecteur.onerror = () => reject(new Error('lecture impossible'));
      lecteur.onload = () => {
        const img = new window.Image();
        img.onerror = () => reject(new Error('image invalide'));
        img.onload = () => {
          const cibleL = 300;
          const cibleH = 375;
          const canvas = document.createElement('canvas');
          canvas.width = cibleL;
          canvas.height = cibleH;
          const ctx = canvas.getContext('2d');
          const ratioCible = cibleL / cibleH;
          const ratioSource = img.width / img.height;
          let sx = 0;
          let sy = 0;
          let sl = img.width;
          let sh = img.height;
          if (ratioSource > ratioCible) {
            sl = sh * ratioCible;
            sx = (img.width - sl) / 2;
          } else {
            sh = sl / ratioCible;
            sy = (img.height - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sl, sh, 0, 0, cibleL, cibleH);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = lecteur.result;
      };
      lecteur.readAsDataURL(fichier);
    });
  }

  async function gererChoixPhoto(id, fichier) {
    if (!fichier) return;
    try {
      const dataUrl = await redimensionnerPhoto(fichier);
      setPhotoApercu((c) => ({ ...c, [id]: dataUrl }));
    } catch (err) {
      window.alert("Impossible de lire cette image, essayez un autre fichier (JPEG ou PNG).");
    }
  }

  function retirerPhoto(id) {
    setPhotoApercu((c) => ({ ...c, [id]: null }));
  }

  async function enregistrerIdentite(id) {
    const body = {
      identite: {
        fonction: (fonctionEdit[id] || '').trim(),
        dateNaissance: naissanceEdit[id] || null,
        matricule: (matriculeEdit[id] || '').trim()
      }
    };
    if (Object.prototype.hasOwnProperty.call(photoApercu, id)) {
      body.photo = photoApercu[id];
    }
    const res = await fetch(`/api/admin/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const data = await res.json();
      setBadgeDetail(data.employee);
      setPhotoApercu((c) => {
        const suite = { ...c };
        delete suite[id];
        return suite;
      });
      chargerTout();
    }
  }

  // --- Rapport (tableau croise mois x site pour un salarie) ---
  const [rapportEmploye, setRapportEmploye] = useState('');
  const [rapportData, setRapportData] = useState(null);
  const [rapportChargement, setRapportChargement] = useState(false);

  useEffect(() => {
    if (!rapportEmploye) {
      setRapportData(null);
      return;
    }
    setRapportChargement(true);
    fetch(`/api/admin/reports/employee?employee_id=${rapportEmploye}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setRapportData(data))
      .finally(() => setRapportChargement(false));
  }, [rapportEmploye]);

  // --- Sites ---
  const [nouvSite, setNouvSite] = useState('');
  async function ajouterSite(e) {
    e.preventDefault();
    const res = await fetch('/api/admin/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: nouvSite })
    });
    if (res.ok) {
      setNouvSite('');
      chargerTout();
    }
  }
  async function toggleSiteActif(id, actif) {
    await fetch(`/api/admin/sites/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actif })
    });
    chargerTout();
  }
  async function supprimerSite(id, nom) {
    if (!window.confirm(`Supprimer le site "${nom}" ?\n\nLes vacations deja enregistrees sur ce site sont conservees.`)) return;
    const res = await fetch(`/api/admin/sites/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.erreur || 'Suppression impossible.');
    }
    chargerTout();
  }

  // --- Postes ---
  const [nouvPoste, setNouvPoste] = useState('');
  const [nouvTaux, setNouvTaux] = useState('');
  async function ajouterPoste(e) {
    e.preventDefault();
    const res = await fetch('/api/admin/postes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: nouvPoste, taux_horaire: nouvTaux })
    });
    if (res.ok) {
      setNouvPoste('');
      setNouvTaux('');
      chargerTout();
    }
  }
  async function togglePosteActif(id, actif) {
    await fetch(`/api/admin/postes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actif })
    });
    chargerTout();
  }
  async function supprimerPoste(id, nom) {
    if (!window.confirm(`Supprimer le poste "${nom}" ?\n\nLes vacations deja enregistrees avec ce poste sont conservees.`)) return;
    const res = await fetch(`/api/admin/postes/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.erreur || 'Suppression impossible.');
    }
    chargerTout();
  }

  // --- Planning (envoi previsionnel aux salaries) ---
  // Deux vues : 'agents' (envoi direct a des salaries) et 'site' (creneaux
  // a pourvoir sur un site, attribues ensuite agent par agent).
  const [vuePlanning, setVuePlanning] = useState('agents');
  const [planEmployeIds, setPlanEmployeIds] = useState([]);
  const [planEntrees, setPlanEntrees] = useState([planEntreeVide()]);
  const [planEnvoiEnCours, setPlanEnvoiEnCours] = useState(false);
  const [planMessage, setPlanMessage] = useState(null);

  function togglePlanEmploye(id) {
    setPlanEmployeIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  function togglePlanTousEmployes() {
    const actifs = employees.filter((e) => e.actif).map((e) => e.id);
    setPlanEmployeIds((c) => (c.length === actifs.length ? [] : actifs));
  }

  function majPlanEntree(index, champ, valeur) {
    setPlanEntrees((prev) => prev.map((e, i) => (i === index ? { ...e, [champ]: valeur } : e)));
  }

  function ajouterPlanEntree() {
    setPlanEntrees((prev) => (prev.length >= 31 ? prev : [...prev, planEntreeVide()]));
  }

  function retirerPlanEntree(index) {
    setPlanEntrees((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function envoyerPlanning(e) {
    e.preventDefault();
    setPlanMessage(null);
    if (planEmployeIds.length === 0) {
      setPlanMessage({ type: 'error', texte: 'Choisissez au moins un salarie.' });
      return;
    }
    setPlanEnvoiEnCours(true);
    try {
      const res = await fetch('/api/admin/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeIds: planEmployeIds,
          entries: planEntrees.map((pe) => ({
            date: pe.date,
            siteId: pe.site_id,
            posteId: pe.poste_id || null,
            heureDebut: pe.heure_debut,
            heureFin: pe.heure_fin,
            note: pe.note
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setPlanMessage({ type: 'error', texte: data.erreur || 'Erreur lors de l’envoi.' });
        return;
      }
      setPlanMessage({ type: 'success', texte: `Planning envoye : ${data.creees} creneau(x) cree(s).` });
      setPlanEntrees([planEntreeVide()]);
      setPlanEmployeIds([]);
      chargerTout();
    } finally {
      setPlanEnvoiEnCours(false);
    }
  }

  async function supprimerPlanEntree(id) {
    await fetch(`/api/admin/planning/${id}`, { method: 'DELETE' });
    chargerTout();
  }

  async function effacerPlanningEmploye(employeeId, libelle) {
    const confirme = window.confirm(`Effacer tout le planning de ${libelle} pour ${libelleMois(mois)} ?`);
    if (!confirme) return;
    await fetch(`/api/admin/planning?employee_id=${employeeId}&mois=${mois}`, { method: 'DELETE' });
    chargerTout();
  }

  // --- Transformer des creneaux du planning en vacations executees ---
  const [execEnCours, setExecEnCours] = useState(false);
  const [execPoste, setExecPoste] = useState({}); // poste choisi par salarie pour les creneaux sans poste

  async function executerCreneaux(ids, employeeId, libelle) {
    if (ids.length === 0) return;
    if (ids.length > 1 && !window.confirm(`Marquer ${ids.length} creneau(x) comme executes pour ${libelle} ?\n\nIls deviennent des vacations validees (heures et montants comptes).`)) return;
    setExecEnCours(true);
    try {
      const res = await fetch('/api/admin/planning/executer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, posteId: execPoste[employeeId] || null })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) window.alert(data.erreur || 'Operation impossible.');
      else if (data.sansPoste) {
        window.alert(
          `${data.executes} creneau(x) executes. ${data.sansPoste} creneau(x) sans poste n'ont pas pu etre transformes : choisissez un poste dans la liste a cote du bouton puis recommencez.`
        );
      }
      chargerTout();
    } finally {
      setExecEnCours(false);
    }
  }

  // Regroupe la liste plate `planning` (deja triee par salarie/date cote API) par salarie.
  function planningParEmploye() {
    const groupes = new Map();
    for (const p of planning) {
      if (!groupes.has(p.employee_id)) {
        groupes.set(p.employee_id, { employeeId: p.employee_id, nom: p.nom, prenom: p.prenom, entrees: [] });
      }
      groupes.get(p.employee_id).entrees.push(p);
    }
    return Array.from(groupes.values());
  }

  if (chargement) {
    return (
      <div className="page">
        <div className="center-loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!connecte) {
    return (
      <div className="page">
        <div className="auth-wrap">
          <div className="auth-card">
            <div className="auth-brand">
              <Brand subtitle="Espace responsable" />
            </div>
            {erreurConnexion && <div className="alert alert-error">{erreurConnexion}</div>}
            <form onSubmit={connexion}>
              <div className="field">
                <label htmlFor="pwd">Mot de passe</label>
                <input
                  id="pwd"
                  type="password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <button className="btn btn-primary btn-block" type="submit" disabled={connexionEnCours}>
                {connexionEnCours ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <div className="topbar-inner">
          <Brand subtitle="Espace responsable" />
          <button className="btn btn-ghost" onClick={deconnexion}>
            Deconnexion
          </button>
        </div>
      </div>

      <div className="shell section-gap">
        <div className="flex-between">
          <div className="tabs" style={{ flex: 1 }}>
            {ONGLETS.map((o) => (
              <div
                key={o.id}
                className={`tab ${onglet === o.id ? 'active' : ''}`}
                onClick={() => setOnglet(o.id)}
              >
                {o.label}
                {o.id === 'anomalies' && anomalies.length > 0 && (
                  <span className="pill pill-danger" style={{ marginLeft: 6 }}>
                    {anomalies.length}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {onglet !== 'base' && (
        <>
        <div className="flex-between">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setMois((m) => decalerMois(m, -1))}>
              &larr;
            </button>
            <div style={{ fontWeight: 700 }}>{libelleMois(mois)}</div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setMois((m) => decalerMois(m, 1))}
              disabled={mois >= moisCourant()}
            >
              &rarr;
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => exporterExcel('mois')}>
              Exporter le mois (Excel)
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exporterExcel('tout')}>
              Tout l&apos;historique
            </button>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Heures ({libelleMois(mois)})</div>
            <div className="stat-value">{(summary?.totalGeneral?.heures || 0).toFixed(1)} h</div>
          </div>
          <div className="stat">
            <div className="stat-label">Montant total</div>
            <div className="stat-value accent">{formatEuros(summary?.totalGeneral?.montant)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Salaries actifs</div>
            <div className="stat-value">{summary?.parEmploye?.length || 0}</div>
          </div>
        </div>
        </>
        )}

        {onglet === 'vacations' && (
          <>
            <div className="card">
              <div className="card-title">Recap par salarie</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Salarie</th>
                      <th>Vacations</th>
                      <th>Heures</th>
                      <th>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.parEmploye || []).map((e) => (
                      <tr key={e.employeeId}>
                        <td>{e.prenom ? `${e.prenom} ${e.nom}` : e.nom}</td>
                        <td>{e.nbVacations}</td>
                        <td>{e.totalHeures.toFixed(2)} h</td>
                        <td>{formatEuros(e.totalMontant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Recap par site</div>
              {(summary?.parSite || []).length === 0 ? (
                <div className="empty-state">Aucune vacation enregistree ce mois-ci.</div>
              ) : (
                (summary?.parSite || []).map((site) => (
                  <div key={site.siteId} style={{ marginBottom: 18 }}>
                    <div className="flex-between" style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>{site.nom}</div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
                        <span>{site.totalHeures.toFixed(2)} h</span>
                        <span className="accent">{formatEuros(site.totalMontant)}</span>
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Salarie</th>
                            <th>Heures</th>
                            <th>Montant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {site.parEmploye.map((e) => (
                            <tr key={e.employeeId}>
                              <td>{e.prenom ? `${e.prenom} ${e.nom}` : e.nom}</td>
                              <td>{e.totalHeures.toFixed(2)} h</td>
                              <td>{formatEuros(e.totalMontant)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="card">
              <div className="flex-between" style={{ marginBottom: 14 }}>
                <div className="card-title" style={{ margin: 0 }}>
                  Detail des vacations
                </div>
                <div className="row" style={{ maxWidth: 420, gap: 8 }}>
                  <select value={filtreEmploye} onChange={(e) => setFiltreEmploye(e.target.value)}>
                    <option value="">Tous les salaries</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nom}
                      </option>
                    ))}
                  </select>
                  <select value={filtreSite} onChange={(e) => setFiltreSite(e.target.value)}>
                    <option value="">Tous les sites</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {vacations.length === 0 ? (
                <div className="empty-state">Aucune vacation pour ces filtres.</div>
              ) : (
                <div className="list">
                  {vacations.map((v) => (
                    <div className="list-row" key={v.id} style={{ flexWrap: 'wrap' }}>
                      <div className="list-row-main">
                        <div className="list-row-title">
                          {v.prenom ? `${v.prenom} ${v.nom}` : v.nom} &middot;{' '}
                          {new Date(v.shift_date).toLocaleDateString('fr-FR')}
                        </div>
                        <div className="list-row-sub">
                          {v.site} &middot; {v.poste} &middot; {v.heure_debut}&ndash;{v.heure_fin} &middot;{' '}
                          {Number(v.duree_heures).toFixed(2)} h
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="list-row-amount">{formatEuros(v.montant)}</div>
                        <span
                          className={`pill ${v.modifie_par_manager ? 'pill-danger' : v.valide ? 'pill-success' : 'pill-warning'}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => toggleValide(v.id, !v.valide)}
                          title="Cliquer pour changer le statut de validation"
                        >
                          {v.modifie_par_manager ? 'Modifie' : v.valide ? 'Validee' : 'En attente'}
                        </span>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => (editionVacation === v.id ? annulerModifVacation() : ouvrirModifVacation(v))}
                        >
                          {editionVacation === v.id ? 'Annuler' : 'Modifier'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => supprimerVacation(v.id)}>
                          &times;
                        </button>
                      </div>

                      {editionVacation === v.id && (
                        <div
                          style={{
                            width: '100%',
                            marginTop: 10,
                            paddingTop: 10,
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'flex-end',
                            gap: 12,
                            flexWrap: 'wrap'
                          }}
                        >
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label>Debut</label>
                            <input
                              type="time"
                              value={heureDebutEdit}
                              onChange={(e) => setHeureDebutEdit(e.target.value)}
                            />
                          </div>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label>Fin</label>
                            <input type="time" value={heureFinEdit} onChange={(e) => setHeureFinEdit(e.target.value)} />
                          </div>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={modifVacationEnCours}
                            onClick={() => enregistrerModifVacation(v.id)}
                          >
                            {modifVacationEnCours ? 'Enregistrement...' : 'Enregistrer'}
                          </button>
                          {erreurModifVacation && (
                            <div className="alert alert-error" style={{ margin: 0, padding: '6px 10px' }}>
                              {erreurModifVacation}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {onglet === 'base' && <BaseSalaries postes={postes} onEmbauche={chargerTout} />}

        {onglet === 'employees' && (
          <div className="card">
            <div className="card-title">Ajouter un salarie</div>
            <form onSubmit={ajouterEmploye}>
              <div className="row">
                <div className="field">
                  <label>Nom</label>
                  <input type="text" value={nouvNom} onChange={(e) => setNouvNom(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Prenom</label>
                  <input type="text" value={nouvPrenom} onChange={(e) => setNouvPrenom(e.target.value)} />
                </div>
                <div className="field">
                  <label>Code (4 car. min.)</label>
                  <input type="text" value={nouvCode} onChange={(e) => setNouvCode(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Taux horaire perso (optionnel)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Taux du poste par defaut"
                    value={nouvTauxPerso}
                    onChange={(e) => setNouvTauxPerso(e.target.value)}
                  />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={ajoutEnCours}>
                Ajouter
              </button>
            </form>

            <div style={{ marginTop: 22 }}>
              <div className="list">
                {employees.map((e) => (
                  <div key={e.id}>
                    <div className="list-row">
                      <div className="list-row-main">
                        <div className="list-row-title">{e.prenom ? `${e.prenom} ${e.nom}` : e.nom}</div>
                        <div className="list-row-sub">
                          {e.actif ? 'Actif' : 'Inactif'}
                          {e.taux_horaire != null && (
                            <span className="pill pill-success" style={{ marginLeft: 8 }}>
                              {formatEuros(e.taux_horaire)}/h perso
                            </span>
                          )}
                          {statutCartePro(e) && (
                            <span
                              className={`pill ${statutCartePro(e).valide ? 'pill-success' : 'pill-danger'}`}
                              style={{ marginLeft: 8 }}
                              title="Carte professionnelle CNAPS"
                            >
                              Carte {statutCartePro(e).label}
                            </span>
                          )}
                          {e.carte_pro_date_verification && (
                            <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>
                              (verif. le {formatDateFr(e.carte_pro_date_verification)})
                            </span>
                          )}
                          {e.date_entree && (
                            <span className="pill pill-warning" style={{ marginLeft: 8 }}>
                              Entree {formatDateFr(e.date_entree)}
                            </span>
                          )}
                          {e.date_sortie && (
                            <span className="pill pill-danger" style={{ marginLeft: 8 }}>
                              Sortie {formatDateFr(e.date_sortie)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Taux perso"
                          style={{ width: 110 }}
                          value={tauxEdit[e.id] ?? (e.taux_horaire != null ? String(e.taux_horaire) : '')}
                          onChange={(ev) => setTauxEdit((c) => ({ ...c, [e.id]: ev.target.value }))}
                        />
                        <button className="btn btn-secondary btn-sm" onClick={() => enregistrerTauxPerso(e.id)}>
                          Appliquer le taux
                        </button>
                        <input
                          type="text"
                          placeholder="Nouveau code"
                          style={{ width: 130 }}
                          value={codeReset[e.id] || ''}
                          onChange={(ev) => setCodeReset((c) => ({ ...c, [e.id]: ev.target.value }))}
                        />
                        <button className="btn btn-secondary btn-sm" onClick={() => reinitialiserCode(e.id)}>
                          Reinitialiser
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => toggleEmployeActif(e.id, !e.actif)}
                        >
                          {e.actif ? 'Desactiver' : 'Activer'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => ouvrirEditionNom(e)}>
                          {editionOuverte === e.id ? 'Fermer' : 'Corriger le nom'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => ouvrirCartePro(e)}>
                          {carteOuverte === e.id ? 'Fermer' : 'Carte pro CNAPS'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => ouvrirDates(e)}>
                          {datesOuverte === e.id ? 'Fermer' : "Dates d'entree/sortie"}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => ouvrirBadge(e)}>
                          {badgeOuverte === e.id ? 'Fermer' : "Carte d'agent"}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => supprimerEmploye(e.id, e.prenom ? `${e.prenom} ${e.nom}` : e.nom)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                    {editionOuverte === e.id && (
                      <div className="entry" style={{ marginBottom: 10 }}>
                        <div className="row">
                          <div className="field">
                            <label>Nom</label>
                            <input
                              type="text"
                              value={nomEdit[e.id] ?? ''}
                              onChange={(ev) => setNomEdit((c) => ({ ...c, [e.id]: ev.target.value }))}
                            />
                          </div>
                          <div className="field">
                            <label>Prenom</label>
                            <input
                              type="text"
                              value={prenomEdit[e.id] ?? ''}
                              onChange={(ev) => setPrenomEdit((c) => ({ ...c, [e.id]: ev.target.value }))}
                            />
                          </div>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => enregistrerNomPrenom(e.id)}>
                          Enregistrer le nom
                        </button>
                      </div>
                    )}
                    {carteOuverte === e.id && (
                      <div className="entry" style={{ marginBottom: 10 }}>
                        <div className="small muted" style={{ marginBottom: 12 }}>
                          Le CNAPS ne propose pas de verification automatique (pas d&apos;API publique) : verifiez
                          le numero ci-dessous sur le site officiel, puis reportez la date de validite du titre
                          affichee. Le statut Valide / Non valide est ensuite recalcule automatiquement chaque jour
                          a partir de cette date.
                        </div>
                        <div className="row">
                          <div className="field">
                            <label>N&deg; carte pro (NUB CNAPS, 7 chiffres)</label>
                            <input
                              type="text"
                              placeholder="Ex. 0948496"
                              value={carteNumeroEdit[e.id] ?? ''}
                              onChange={(ev) => setCarteNumeroEdit((c) => ({ ...c, [e.id]: ev.target.value }))}
                            />
                          </div>
                          <div className="field">
                            <label>Date de validite du titre</label>
                            <input
                              type="date"
                              value={carteExpirationEdit[e.id] ?? ''}
                              onChange={(ev) => setCarteExpirationEdit((c) => ({ ...c, [e.id]: ev.target.value }))}
                            />
                          </div>
                          <div className="field">
                            <label>Verification enregistree le</label>
                            <input
                              type="date"
                              value={carteVerifEdit[e.id] ?? ''}
                              onChange={(ev) => setCarteVerifEdit((c) => ({ ...c, [e.id]: ev.target.value }))}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="btn btn-primary btn-sm" onClick={() => enregistrerCartePro(e.id)}>
                            Enregistrer la carte
                          </button>
                          <a
                            className="btn btn-secondary btn-sm"
                            href={CNAPS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Verifier sur le site CNAPS &#8599;
                          </a>
                        </div>
                      </div>
                    )}
                    {datesOuverte === e.id && (
                      <div className="entry" style={{ marginBottom: 10 }}>
                        <div className="row">
                          <div className="field">
                            <label>Date d&apos;entree</label>
                            <input
                              type="date"
                              value={dateEntreeEdit[e.id] ?? ''}
                              onChange={(ev) => setDateEntreeEdit((c) => ({ ...c, [e.id]: ev.target.value }))}
                            />
                          </div>
                          <div className="field">
                            <label>Date de sortie</label>
                            <input
                              type="date"
                              value={dateSortieEdit[e.id] ?? ''}
                              onChange={(ev) => setDateSortieEdit((c) => ({ ...c, [e.id]: ev.target.value }))}
                            />
                          </div>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => enregistrerDates(e.id)}>
                          Enregistrer les dates
                        </button>
                      </div>
                    )}
                    {badgeOuverte === e.id && (
                      <div className="entry" style={{ marginBottom: 10 }}>
                        {badgeChargement && <div className="small muted">Chargement...</div>}
                        {!badgeChargement && (
                          <>
                            <div className="small muted" style={{ marginBottom: 12 }}>
                              Ces informations sont imprimees sur la carte d&apos;agent (recto/verso), telechargeable
                              aussi depuis l&apos;espace du salarie une fois la fiche completee.
                            </div>
                            <div className="row">
                              <div className="field">
                                <label>Fonction / poste (affichee sur la carte)</label>
                                <input
                                  type="text"
                                  placeholder="Agent de prevention et de securite"
                                  value={fonctionEdit[e.id] ?? ''}
                                  onChange={(ev) => setFonctionEdit((c) => ({ ...c, [e.id]: ev.target.value }))}
                                />
                              </div>
                              <div className="field">
                                <label>Date de naissance</label>
                                <input
                                  type="date"
                                  value={naissanceEdit[e.id] ?? ''}
                                  onChange={(ev) => setNaissanceEdit((c) => ({ ...c, [e.id]: ev.target.value }))}
                                />
                              </div>
                              <div className="field">
                                <label>Matricule (auto si vide)</label>
                                <input
                                  type="text"
                                  placeholder={`${new Date().getFullYear()} A${String(e.id).padStart(3, '0')}`}
                                  value={matriculeEdit[e.id] ?? ''}
                                  onChange={(ev) => setMatriculeEdit((c) => ({ ...c, [e.id]: ev.target.value }))}
                                />
                              </div>
                            </div>
                            <div className="field" style={{ maxWidth: 360 }}>
                              <label>Photo (scannee ou photographiee)</label>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(ev) => gererChoixPhoto(e.id, ev.target.files && ev.target.files[0])}
                              />
                              {(Object.prototype.hasOwnProperty.call(photoApercu, e.id)
                                ? photoApercu[e.id]
                                : badgeDetail && badgeDetail.photo_data) && (
                                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <img
                                    src={
                                      Object.prototype.hasOwnProperty.call(photoApercu, e.id)
                                        ? photoApercu[e.id]
                                        : badgeDetail.photo_data
                                    }
                                    alt=""
                                    style={{ width: 56, height: 70, objectFit: 'cover', borderRadius: 6 }}
                                  />
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => retirerPhoto(e.id)}>
                                    Retirer la photo
                                  </button>
                                </div>
                              )}
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={() => enregistrerIdentite(e.id)}>
                              Enregistrer la fiche
                            </button>

                            {badgeDetail && (
                              <div style={{ marginTop: 20 }}>
                                <div className="badge-imprimable">
                                  <CarteAgent
                                    employe={{
                                      ...badgeDetail,
                                      fonction: fonctionEdit[e.id] || badgeDetail.fonction,
                                      date_naissance: naissanceEdit[e.id] || badgeDetail.date_naissance,
                                      matricule: matriculeEdit[e.id] || badgeDetail.matricule,
                                      photo_data: Object.prototype.hasOwnProperty.call(photoApercu, e.id)
                                        ? photoApercu[e.id]
                                        : badgeDetail.photo_data
                                    }}
                                  />
                                </div>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ marginTop: 12 }}
                                  onClick={() => window.print()}
                                >
                                  Imprimer / Enregistrer en PDF
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {onglet === 'rapport' && (
          <div className="card">
            <div className="card-title">Rapport par salarie &mdash; heures par mois et par site</div>
            <div className="field" style={{ maxWidth: 320 }}>
              <label>Salarie</label>
              <select value={rapportEmploye} onChange={(e) => setRapportEmploye(e.target.value)}>
                <option value="">Choisir un salarie</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.prenom ? `${e.prenom} ${e.nom}` : e.nom}
                  </option>
                ))}
              </select>
            </div>

            {!rapportEmploye && <div className="empty-state">Selectionnez un salarie pour voir son historique.</div>}

            {rapportEmploye && rapportChargement && (
              <div className="center-loading">
                <div className="spinner" />
              </div>
            )}

            {rapportEmploye && !rapportChargement && rapportData && rapportData.rows.length === 0 && (
              <div className="empty-state">Aucune vacation enregistree pour ce salarie.</div>
            )}

            {rapportEmploye && !rapportChargement && rapportData && rapportData.rows.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mois</th>
                      {rapportData.sites.map((s) => (
                        <th key={s.id}>{s.nom}</th>
                      ))}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rapportData.rows.map((row) => (
                      <tr key={row.mois}>
                        <td style={{ fontWeight: 600 }}>{libelleMois(row.mois)}</td>
                        {rapportData.sites.map((s) => {
                          const cellule = row.parSite[s.id];
                          return (
                            <td key={s.id}>
                              {cellule ? (
                                <>
                                  {cellule.heures.toFixed(2)} h
                                  <div className="small muted">{formatEuros(cellule.montant)}</div>
                                </>
                              ) : (
                                <span className="muted">&ndash;</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ fontWeight: 600 }}>
                          {row.totalHeures.toFixed(2)} h
                          <div className="small muted">{formatEuros(row.totalMontant)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      {rapportData.sites.map((s) => (
                        <th key={s.id}>
                          {(rapportData.totalsBySite[s.id]?.heures || 0).toFixed(2)} h
                          <div className="small" style={{ textTransform: 'none', fontWeight: 400 }}>
                            {formatEuros(rapportData.totalsBySite[s.id]?.montant)}
                          </div>
                        </th>
                      ))}
                      <th>
                        {rapportData.grandTotal.heures.toFixed(2)} h
                        <div className="small" style={{ textTransform: 'none', fontWeight: 400 }}>
                          {formatEuros(rapportData.grandTotal.montant)}
                        </div>
                      </th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {onglet === 'anomalies' && (
          <div className="card">
            <div className="card-title">Anomalies &mdash; infractions au droit du travail ({libelleMois(mois)})</div>
            <div className="small muted" style={{ marginBottom: 14 }}>
              Detection automatique sur les vacations enregistrees ce mois-ci : poste de 12h ou plus d&apos;affilee,
              repos de moins de 24h apres un tel poste, et depassement des seuils mensuels de 151h et 170h.
            </div>

            {anomalies.length === 0 && <div className="empty-state">Aucune anomalie detectee ce mois-ci.</div>}

            {anomalies.length > 0 && (
              <div className="list">
                {anomalies.map((a, idx) => (
                  <div className="list-row" key={idx}>
                    <div className="list-row-main">
                      <div className="list-row-title">
                        {a.nom}
                        <span
                          className={`pill ${a.gravite === 'critique' ? 'pill-danger' : 'pill-warning'}`}
                          style={{ marginLeft: 8 }}
                        >
                          {ANOMALIE_LABELS[a.type] || a.type}
                        </span>
                      </div>
                      <div className="list-row-sub">{a.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {onglet === 'sites' && (
          <div className="card">
            <div className="card-title">Ajouter un site</div>
            <form onSubmit={ajouterSite} className="row">
              <div className="field">
                <label>Nom du site</label>
                <input type="text" value={nouvSite} onChange={(e) => setNouvSite(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-primary" type="submit">
                  Ajouter
                </button>
              </div>
            </form>

            <div style={{ marginTop: 22 }} className="list">
              {sites.map((s) => (
                <div className="list-row" key={s.id}>
                  <div className="list-row-main">
                    <div className="list-row-title">{s.nom}</div>
                    <div className="list-row-sub">{s.actif ? 'Actif' : 'Inactif'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleSiteActif(s.id, !s.actif)}>
                      {s.actif ? 'Desactiver' : 'Activer'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => supprimerSite(s.id, s.nom)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {onglet === 'postes' && (
          <div className="card">
            <div className="card-title">Ajouter un poste</div>
            <form onSubmit={ajouterPoste} className="row">
              <div className="field">
                <label>Nom du poste</label>
                <input type="text" value={nouvPoste} onChange={(e) => setNouvPoste(e.target.value)} required />
              </div>
              <div className="field">
                <label>Taux horaire (EUR)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={nouvTaux}
                  onChange={(e) => setNouvTaux(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-primary" type="submit">
                  Ajouter
                </button>
              </div>
            </form>

            <div style={{ marginTop: 22 }} className="list">
              {postes.map((p) => (
                <div className="list-row" key={p.id}>
                  <div className="list-row-main">
                    <div className="list-row-title">{p.nom}</div>
                    <div className="list-row-sub">
                      {formatEuros(p.taux_horaire)}/h &middot; {p.actif ? 'Actif' : 'Inactif'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => togglePosteActif(p.id, !p.actif)}
                    >
                      {p.actif ? 'Desactiver' : 'Activer'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => supprimerPoste(p.id, p.nom)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {onglet === 'planning' && (
          <div className="tabs">
            <div
              className={`tab ${vuePlanning === 'agents' ? 'active' : ''}`}
              onClick={() => setVuePlanning('agents')}
            >
              Planning agents
            </div>
            <div className={`tab ${vuePlanning === 'site' ? 'active' : ''}`} onClick={() => setVuePlanning('site')}>
              Planning site
            </div>
          </div>
        )}

        {onglet === 'planning' && vuePlanning === 'site' && (
          <PlanningSite sites={sites} postes={postes} employees={employees} mois={mois} onChange={chargerTout} />
        )}

        {onglet === 'planning' && vuePlanning === 'agents' && (
          <>
            <div className="card">
              <div className="card-title">Envoyer un planning</div>
              <div className="small muted" style={{ marginBottom: 14 }}>
                Ajoutez les creneaux prevus (un par jour, ou plusieurs pour couvrir une semaine ou un mois entier),
                choisissez les salaries destinataires, puis envoyez : chaque salarie retrouve ces creneaux, en
                lecture seule, dans son propre espace.
              </div>

              {planMessage && (
                <div className={`alert ${planMessage.type === 'error' ? 'alert-error' : 'alert-success'}`}>
                  {planMessage.texte}
                </div>
              )}

              <form onSubmit={envoyerPlanning}>
                <label>Destinataires</label>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 16,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: 12
                  }}
                >
                  <button type="button" className="btn btn-secondary btn-sm" onClick={togglePlanTousEmployes}>
                    Tout / Aucun
                  </button>
                  {employees
                    .filter((e) => e.actif)
                    .map((e) => (
                      <label
                        key={e.id}
                        className="pill"
                        style={{
                          cursor: 'pointer',
                          background: planEmployeIds.includes(e.id) ? 'var(--success-bg)' : 'var(--surface-2)',
                          color: planEmployeIds.includes(e.id) ? 'var(--success)' : 'var(--text-muted)',
                          textTransform: 'none',
                          fontWeight: 500
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={planEmployeIds.includes(e.id)}
                          onChange={() => togglePlanEmploye(e.id)}
                          style={{ marginRight: 5 }}
                        />
                        {e.prenom ? `${e.prenom} ${e.nom}` : e.nom}
                      </label>
                    ))}
                </div>

                {planEntrees.map((pe, index) => (
                  <div className="entry" key={index}>
                    <div className="entry-head">
                      <span className="entry-num">Creneau {index + 1}</span>
                      {planEntrees.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => retirerPlanEntree(index)}
                        >
                          Retirer
                        </button>
                      )}
                    </div>
                    <div className="row">
                      <div className="field">
                        <label>Date</label>
                        <input
                          type="date"
                          value={pe.date}
                          onChange={(ev) => majPlanEntree(index, 'date', ev.target.value)}
                          required
                        />
                      </div>
                      <div className="field">
                        <label>Site</label>
                        <select
                          value={pe.site_id}
                          onChange={(ev) => majPlanEntree(index, 'site_id', ev.target.value)}
                          required
                        >
                          <option value="">Choisir un site</option>
                          {sites.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nom}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Poste (optionnel)</label>
                        <select
                          value={pe.poste_id}
                          onChange={(ev) => majPlanEntree(index, 'poste_id', ev.target.value)}
                        >
                          <option value="">-</option>
                          {postes.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nom}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="row">
                      <div className="field">
                        <label>Debut</label>
                        <input
                          type="time"
                          value={pe.heure_debut}
                          onChange={(ev) => majPlanEntree(index, 'heure_debut', ev.target.value)}
                          required
                        />
                      </div>
                      <div className="field">
                        <label>Fin</label>
                        <input
                          type="time"
                          value={pe.heure_fin}
                          onChange={(ev) => majPlanEntree(index, 'heure_fin', ev.target.value)}
                          required
                        />
                      </div>
                      <div className="field">
                        <label>Note (optionnel)</label>
                        <input
                          type="text"
                          placeholder="Ex. apporter badge"
                          value={pe.note}
                          onChange={(ev) => majPlanEntree(index, 'note', ev.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex-between" style={{ marginTop: 14, marginBottom: 16 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={ajouterPlanEntree}>
                    + Ajouter un creneau
                  </button>
                  <span className="small muted">{planEntrees.length} creneau(x) &times; {planEmployeIds.length} salarie(s)</span>
                </div>

                <button className="btn btn-primary btn-block" type="submit" disabled={planEnvoiEnCours}>
                  {planEnvoiEnCours ? 'Envoi...' : 'Envoyer le planning'}
                </button>
              </form>
            </div>

            <div className="card">
              <div className="card-title">Planning envoye &mdash; {libelleMois(mois)}</div>
              {planningParEmploye().length === 0 ? (
                <div className="empty-state">Aucun planning envoye pour ce mois.</div>
              ) : (
                planningParEmploye().map((groupe) => (
                  <div key={groupe.employeeId} style={{ marginBottom: 18 }}>
                    <div className="flex-between" style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>
                        {groupe.prenom ? `${groupe.prenom} ${groupe.nom}` : groupe.nom}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {groupe.entrees.some((p) => !p.shift_id && !p.poste_id) && (
                        <select
                          style={{ width: 'auto', padding: '6px 30px 6px 10px', fontSize: 13 }}
                          title="Poste a utiliser pour les creneaux sans poste"
                          value={execPoste[groupe.employeeId] || ''}
                          onChange={(e) => setExecPoste((c) => ({ ...c, [groupe.employeeId]: e.target.value }))}
                        >
                          <option value="">Poste (creneaux sans poste)</option>
                          {postes
                            .filter((po) => po.actif)
                            .map((po) => (
                              <option key={po.id} value={po.id}>
                                {po.nom}
                              </option>
                            ))}
                        </select>
                      )}
                      {groupe.entrees.some((p) => !p.shift_id && p.passe) && (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={execEnCours}
                          onClick={() =>
                            executerCreneaux(
                              groupe.entrees.filter((p) => !p.shift_id && p.passe).map((p) => p.id),
                              groupe.employeeId,
                              groupe.prenom ? `${groupe.prenom} ${groupe.nom}` : groupe.nom
                            )
                          }
                        >
                          Tout executer (jours passes)
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() =>
                          effacerPlanningEmploye(
                            groupe.employeeId,
                            groupe.prenom ? `${groupe.prenom} ${groupe.nom}` : groupe.nom
                          )
                        }
                      >
                        Effacer tout
                      </button>
                      </div>
                    </div>
                    <div className="list">
                      {groupe.entrees.map((p) => (
                        <div className="list-row" key={p.id}>
                          <div className="list-row-main">
                            <div className="list-row-title">
                              {new Date(p.planning_date).toLocaleDateString('fr-FR', {
                                weekday: 'short',
                                day: '2-digit',
                                month: 'short'
                              })}{' '}
                              &middot; {p.site}
                            </div>
                            <div className="list-row-sub">
                              {p.poste && `${p.poste} · `}
                              {p.heure_debut}&ndash;{p.heure_fin}
                              {p.note && ` · ${p.note}`}
                            </div>
                          </div>
                          {p.shift_id ? (
                            <span className="pill pill-success">Executee &#10003;</span>
                          ) : (
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={execEnCours}
                              title="Transformer ce creneau en vacation executee (validee)"
                              onClick={() =>
                                executerCreneaux(
                                  [p.id],
                                  groupe.employeeId,
                                  groupe.prenom ? `${groupe.prenom} ${groupe.nom}` : groupe.nom
                                )
                              }
                            >
                              Executee
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => supprimerPlanEntree(p.id)}
                            title="Supprimer ce creneau"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
