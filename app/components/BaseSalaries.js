'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';

// Onglet "Base salaries" de l'espace responsable : vivier de profils
// (photo, CV, coordonnees, mensurations, disponibilites saisonnieres),
// independant des comptes de pointage. Photo et CV sont envoyes
// directement du navigateur vers le store Vercel Blob prive.

const URL_UPLOAD = '/api/admin/base-salaries/upload';

function ficheVide() {
  return {
    nom: '',
    prenom: '',
    date_naissance: '',
    telephone: '',
    email: '',
    carte_pro_numero: '',
    taille_cm: '',
    poids_kg: '',
    ville: '',
    pays: 'France',
    taux_horaire: '',
    poste: '',
    dispo_ete: false,
    dispo_hiver: false,
    photo_pathname: null,
    cv_pathname: null,
    cv_nom_fichier: null
  };
}

function urlFichier(pathname, options = {}) {
  const p = new URLSearchParams({ pathname });
  if (options.telecharger) p.set('telecharger', '1');
  if (options.nom) p.set('nom', options.nom);
  return `/api/admin/base-salaries/fichier?${p.toString()}`;
}

function calculerAge(iso) {
  if (!iso) return null;
  const [a, m, j] = iso.split('-').map(Number);
  const auj = new Date();
  let age = auj.getFullYear() - a;
  if (auj.getMonth() + 1 < m || (auj.getMonth() + 1 === m && auj.getDate() < j)) age -= 1;
  return age;
}

function formatDateFr(iso) {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

function formatEuros(valeur) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(valeur) || 0);
}

function nomFichierPropre(nom) {
  return (nom || 'fichier')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\-]+/g, '_')
    .slice(-80);
}

// Recadre la photo en portrait 4:5 (600x750) et la compresse en JPEG
// avant l'envoi : fichiers legers et affichage homogene dans la liste.
function preparerPhoto(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const img = new window.Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image invalide'));
    };
    img.onload = () => {
      const cibleL = 600;
      const cibleH = 750;
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
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('compression impossible'))),
        'image/jpeg',
        0.85
      );
    };
    img.src = url;
  });
}

export function BaseSalaries({ postes = [] }) {
  const [profils, setProfils] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [filtreDispo, setFiltreDispo] = useState('');
  const [filtrePoste, setFiltrePoste] = useState('');

  const [formOuvert, setFormOuvert] = useState(false);
  const [editionId, setEditionId] = useState(null);
  const [fiche, setFiche] = useState(ficheVide());
  const [photoNouvelle, setPhotoNouvelle] = useState(null); // Blob JPEG
  const [photoApercu, setPhotoApercu] = useState(null); // object URL
  const [cvNouveau, setCvNouveau] = useState(null); // File
  const [enregistrement, setEnregistrement] = useState(false);
  const [etape, setEtape] = useState('');
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const inputPhoto = useRef(null);
  const inputCv = useRef(null);

  const charger = useCallback(async () => {
    const res = await fetch('/api/admin/base-salaries');
    if (res.ok) setProfils((await res.json()).profils);
    setChargement(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    return () => {
      if (photoApercu) URL.revokeObjectURL(photoApercu);
    };
  }, [photoApercu]);

  const postesConnus = useMemo(() => {
    const noms = new Set(postes.map((p) => p.nom));
    profils.forEach((p) => p.poste && noms.add(p.poste));
    return [...noms].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [postes, profils]);

  const profilsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return profils.filter((p) => {
      if (filtreDispo === 'ete' && !p.dispo_ete) return false;
      if (filtreDispo === 'hiver' && !p.dispo_hiver) return false;
      if (filtreDispo === 'les-deux' && !(p.dispo_ete && p.dispo_hiver)) return false;
      if (filtrePoste && p.poste !== filtrePoste) return false;
      if (!q) return true;
      return [p.nom, p.prenom, p.ville, p.pays, p.email, p.telephone, p.carte_pro_numero, p.poste]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [profils, recherche, filtreDispo, filtrePoste]);

  function reinitialiserFichiers() {
    setPhotoNouvelle(null);
    setPhotoApercu(null);
    setCvNouveau(null);
    if (inputPhoto.current) inputPhoto.current.value = '';
    if (inputCv.current) inputCv.current.value = '';
  }

  function ouvrirNouvelle() {
    setEditionId(null);
    setFiche(ficheVide());
    reinitialiserFichiers();
    setErreur('');
    setMessage('');
    setFormOuvert(true);
  }

  function ouvrirEdition(p) {
    setEditionId(p.id);
    setFiche({
      ...ficheVide(),
      ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ''])),
      dispo_ete: Boolean(p.dispo_ete),
      dispo_hiver: Boolean(p.dispo_hiver),
      photo_pathname: p.photo_pathname || null,
      cv_pathname: p.cv_pathname || null,
      cv_nom_fichier: p.cv_nom_fichier || null
    });
    reinitialiserFichiers();
    setErreur('');
    setMessage('');
    setFormOuvert(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function fermerForm() {
    setFormOuvert(false);
    setEditionId(null);
    reinitialiserFichiers();
    setErreur('');
  }

  function maj(champ, valeur) {
    setFiche((f) => ({ ...f, [champ]: valeur }));
  }

  async function choisirPhoto(fichier) {
    if (!fichier) return;
    try {
      const blob = await preparerPhoto(fichier);
      setPhotoNouvelle(blob);
      setPhotoApercu(URL.createObjectURL(blob));
    } catch {
      setErreur("Impossible de lire cette image, essayez un autre fichier (JPEG ou PNG).");
    }
  }

  function retirerPhoto() {
    setPhotoNouvelle(null);
    setPhotoApercu(null);
    if (inputPhoto.current) inputPhoto.current.value = '';
    maj('photo_pathname', null);
  }

  function choisirCv(fichier) {
    if (!fichier) return;
    if (fichier.size > 10 * 1024 * 1024) {
      setErreur('Le CV depasse 10 Mo.');
      if (inputCv.current) inputCv.current.value = '';
      return;
    }
    setErreur('');
    setCvNouveau(fichier);
  }

  function retirerCv() {
    setCvNouveau(null);
    if (inputCv.current) inputCv.current.value = '';
    setFiche((f) => ({ ...f, cv_pathname: null, cv_nom_fichier: null }));
  }

  async function enregistrer(e) {
    e.preventDefault();
    setErreur('');
    setMessage('');
    setEnregistrement(true);
    try {
      const corps = { ...fiche };
      const base = nomFichierPropre(`${fiche.nom}-${fiche.prenom || ''}`);

      if (photoNouvelle) {
        setEtape('Envoi de la photo...');
        const res = await upload(`base-salaries/photos/${base}.jpg`, photoNouvelle, {
          access: 'private',
          handleUploadUrl: URL_UPLOAD,
          contentType: 'image/jpeg'
        });
        corps.photo_pathname = res.pathname;
      }
      if (cvNouveau) {
        setEtape('Envoi du CV...');
        const ext = (cvNouveau.name.split('.').pop() || 'pdf').toLowerCase();
        const res = await upload(`base-salaries/cv/${base}.${ext}`, cvNouveau, {
          access: 'private',
          handleUploadUrl: URL_UPLOAD,
          contentType: cvNouveau.type || undefined
        });
        corps.cv_pathname = res.pathname;
        corps.cv_nom_fichier = cvNouveau.name;
      }

      setEtape('Enregistrement de la fiche...');
      const res = await fetch(
        editionId ? `/api/admin/base-salaries/${editionId}` : '/api/admin/base-salaries',
        {
          method: editionId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps)
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErreur(data.erreur || "Enregistrement impossible.");
        return;
      }
      setMessage(editionId ? 'Fiche mise a jour.' : 'Fiche ajoutee a la base.');
      fermerForm();
      charger();
    } catch (err) {
      setErreur(
        `Envoi du fichier impossible : ${err?.message || err}. Verifiez que le store Vercel Blob (prive) est bien connecte au projet.`
      );
    } finally {
      setEnregistrement(false);
      setEtape('');
    }
  }

  async function supprimer(p) {
    const libelle = p.prenom ? `${p.prenom} ${p.nom}` : p.nom;
    if (!window.confirm(`Supprimer definitivement la fiche de ${libelle} (avec sa photo et son CV) ?`)) return;
    await fetch(`/api/admin/base-salaries/${p.id}`, { method: 'DELETE' });
    if (editionId === p.id) fermerForm();
    charger();
  }

  const apercuPhoto = photoApercu || (fiche.photo_pathname ? urlFichier(fiche.photo_pathname) : null);
  const nbEte = profils.filter((p) => p.dispo_ete).length;
  const nbHiver = profils.filter((p) => p.dispo_hiver).length;

  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Fiches</div>
          <div className="stat-value">{profils.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Disponibles ete</div>
          <div className="stat-value">{nbEte}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Disponibles hiver</div>
          <div className="stat-value">{nbHiver}</div>
        </div>
      </div>

      {message && <div className="alert alert-success">{message}</div>}

      {formOuvert && (
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 14 }}>
            <div className="card-title" style={{ margin: 0 }}>
              {editionId ? 'Modifier la fiche' : 'Nouvelle fiche'}
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={fermerForm}>
              Fermer
            </button>
          </div>
          {erreur && <div className="alert alert-error">{erreur}</div>}

          <form onSubmit={enregistrer}>
            <div className="bs-form-top">
              <div className="bs-photo-edit">
                <div className="bs-photo bs-photo-grande">
                  {apercuPhoto ? <img src={apercuPhoto} alt="" /> : <span>Photo</span>}
                </div>
                <input
                  ref={inputPhoto}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => choisirPhoto(e.target.files?.[0])}
                />
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => inputPhoto.current?.click()}>
                  {apercuPhoto ? 'Changer' : 'Ajouter une photo'}
                </button>
                {apercuPhoto && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={retirerPhoto}>
                    Retirer
                  </button>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row">
                  <div className="field">
                    <label>Nom *</label>
                    <input type="text" value={fiche.nom} onChange={(e) => maj('nom', e.target.value)} required />
                  </div>
                  <div className="field">
                    <label>Prenom</label>
                    <input type="text" value={fiche.prenom} onChange={(e) => maj('prenom', e.target.value)} />
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Date de naissance</label>
                    <input
                      type="date"
                      value={fiche.date_naissance}
                      onChange={(e) => maj('date_naissance', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>N° carte pro</label>
                    <input
                      type="text"
                      value={fiche.carte_pro_numero}
                      onChange={(e) => maj('carte_pro_numero', e.target.value)}
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Telephone</label>
                    <input type="tel" value={fiche.telephone} onChange={(e) => maj('telephone', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Email</label>
                    <input type="email" value={fiche.email} onChange={(e) => maj('email', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label>Ville</label>
                <input type="text" value={fiche.ville} onChange={(e) => maj('ville', e.target.value)} />
              </div>
              <div className="field">
                <label>Pays</label>
                <input type="text" value={fiche.pays} onChange={(e) => maj('pays', e.target.value)} />
              </div>
              <div className="field">
                <label>Taille (cm)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={fiche.taille_cm}
                  onChange={(e) => maj('taille_cm', e.target.value)}
                />
              </div>
              <div className="field">
                <label>Poids (kg)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={fiche.poids_kg}
                  onChange={(e) => maj('poids_kg', e.target.value)}
                />
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label>Poste</label>
                <input
                  type="text"
                  list="bs-postes"
                  placeholder="Ex. Agent de securite"
                  value={fiche.poste}
                  onChange={(e) => maj('poste', e.target.value)}
                />
                <datalist id="bs-postes">
                  {postesConnus.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label>Taux horaire (EUR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fiche.taux_horaire}
                  onChange={(e) => maj('taux_horaire', e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Disponibilite</label>
              <div className="bs-checks">
                <label className="bs-check">
                  <input
                    type="checkbox"
                    checked={fiche.dispo_ete}
                    onChange={(e) => maj('dispo_ete', e.target.checked)}
                  />
                  Disponible ete
                </label>
                <label className="bs-check">
                  <input
                    type="checkbox"
                    checked={fiche.dispo_hiver}
                    onChange={(e) => maj('dispo_hiver', e.target.checked)}
                  />
                  Disponible hiver
                </label>
              </div>
            </div>

            <div className="field">
              <label>CV (PDF ou Word, 10 Mo max.)</label>
              <div className="bs-cv">
                <input
                  ref={inputCv}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  style={{ display: 'none' }}
                  onChange={(e) => choisirCv(e.target.files?.[0])}
                />
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => inputCv.current?.click()}>
                  {cvNouveau || fiche.cv_pathname ? 'Remplacer le CV' : 'Ajouter un CV'}
                </button>
                {cvNouveau && <span className="small">{cvNouveau.name} (sera envoye a l&apos;enregistrement)</span>}
                {!cvNouveau && fiche.cv_pathname && (
                  <a
                    className="small"
                    href={urlFichier(fiche.cv_pathname, { nom: fiche.cv_nom_fichier })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {fiche.cv_nom_fichier || 'Voir le CV'}
                  </a>
                )}
                {(cvNouveau || fiche.cv_pathname) && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={retirerCv}>
                    Retirer
                  </button>
                )}
              </div>
            </div>

            <div className="row" style={{ alignItems: 'center' }}>
              <button className="btn btn-primary" type="submit" disabled={enregistrement} style={{ flex: '0 0 auto' }}>
                {enregistrement ? etape || 'Enregistrement...' : editionId ? 'Enregistrer les modifications' : 'Ajouter a la base'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div className="card-title" style={{ margin: 0 }}>
            Base salaries
          </div>
          {!formOuvert && (
            <button className="btn btn-primary btn-sm" onClick={ouvrirNouvelle}>
              + Nouvelle fiche
            </button>
          )}
        </div>

        <div className="row" style={{ marginBottom: 6 }}>
          <div className="field">
            <input
              type="text"
              placeholder="Rechercher (nom, ville, email, telephone...)"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <div className="field">
            <select value={filtreDispo} onChange={(e) => setFiltreDispo(e.target.value)}>
              <option value="">Toutes disponibilites</option>
              <option value="ete">Disponible ete</option>
              <option value="hiver">Disponible hiver</option>
              <option value="les-deux">Ete et hiver</option>
            </select>
          </div>
          <div className="field">
            <select value={filtrePoste} onChange={(e) => setFiltrePoste(e.target.value)}>
              <option value="">Tous les postes</option>
              {postesConnus.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {chargement ? (
          <div className="empty-state">Chargement...</div>
        ) : profilsFiltres.length === 0 ? (
          <div className="empty-state">
            {profils.length === 0 ? 'Aucune fiche pour le moment.' : 'Aucune fiche ne correspond a ces filtres.'}
          </div>
        ) : (
          <div className="list">
            {profilsFiltres.map((p) => {
              const age = calculerAge(p.date_naissance);
              const libelle = p.prenom ? `${p.prenom} ${p.nom}` : p.nom;
              return (
                <div className="list-row bs-row" key={p.id}>
                  <div className="bs-photo">
                    {p.photo_pathname ? (
                      <img src={urlFichier(p.photo_pathname)} alt="" loading="lazy" />
                    ) : (
                      <span>{(p.prenom?.[0] || '') + (p.nom?.[0] || '')}</span>
                    )}
                  </div>
                  <div className="list-row-main" style={{ flex: 1 }}>
                    <div className="list-row-title">
                      {libelle}
                      {p.dispo_ete && (
                        <span className="pill pill-warning" style={{ marginLeft: 8 }}>
                          Ete
                        </span>
                      )}
                      {p.dispo_hiver && (
                        <span className="pill bs-pill-hiver" style={{ marginLeft: 6 }}>
                          Hiver
                        </span>
                      )}
                    </div>
                    <div className="list-row-sub">
                      {[p.poste, [p.ville, p.pays].filter(Boolean).join(', '), p.taux_horaire != null && `${formatEuros(p.taux_horaire)}/h`]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <div className="list-row-sub">
                      {[
                        p.telephone && <a key="t" href={`tel:${p.telephone}`}>{p.telephone}</a>,
                        p.email && <a key="e" href={`mailto:${p.email}`}>{p.email}</a>
                      ]
                        .filter(Boolean)
                        .reduce((acc, el, i) => (i ? [...acc, ' · ', el] : [el]), [])}
                    </div>
                    <div className="list-row-sub">
                      {[
                        p.date_naissance && `Ne(e) le ${formatDateFr(p.date_naissance)}${age != null ? ` (${age} ans)` : ''}`,
                        p.taille_cm && `${p.taille_cm} cm`,
                        p.poids_kg && `${Number(p.poids_kg)} kg`,
                        p.carte_pro_numero && `Carte pro ${p.carte_pro_numero}`
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <div className="bs-actions">
                    {p.cv_pathname && (
                      <a
                        className="btn btn-secondary btn-sm"
                        href={urlFichier(p.cv_pathname, { nom: p.cv_nom_fichier })}
                        target="_blank"
                        rel="noreferrer"
                      >
                        CV
                      </a>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => ouvrirEdition(p)}>
                      Modifier
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => supprimer(p)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
