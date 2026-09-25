'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// Planning site : on cree d'abord les creneaux de travail prevus sur un site
// (besoins du marche, "a pourvoir"), puis on place un agent sur chaque
// creneau. Placer un agent ajoute automatiquement le creneau a SON planning
// (visible dans son espace) ; le retirer l'enleve de son planning.

const JOURS = [
  { n: 1, court: 'Lun' },
  { n: 2, court: 'Mar' },
  { n: 3, court: 'Mer' },
  { n: 4, court: 'Jeu' },
  { n: 5, court: 'Ven' },
  { n: 6, court: 'Sam' },
  { n: 7, court: 'Dim' }
];

const DECOUPAGES = [
  { v: '', label: 'Pas de decoupage (1 creneau)' },
  { v: '1', label: 'Par tranche de 1 h' },
  { v: '2', label: 'Par tranche de 2 h' },
  { v: '3', label: 'Par tranche de 3 h' },
  { v: '4', label: 'Par tranche de 4 h' },
  { v: '6', label: 'Par tranche de 6 h' },
  { v: '12', label: 'Par tranche de 12 h' }
];

function ajouterJours(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function lundiDe(iso) {
  const j = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return ajouterJours(iso, j === 0 ? -6 : 1 - j);
}

function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dureeHeures(debut, fin) {
  const [h1, m1] = debut.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  let min = h2 * 60 + m2 - (h1 * 60 + m1);
  if (min <= 0) min += 1440;
  return min / 60;
}

function libelleJour(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC'
  });
}

function nomAgent(e) {
  return e.prenom ? `${e.prenom} ${e.nom}` : e.nom;
}

// Couleur stable par agent, pour reperer d'un coup d'oeil qui fait quoi.
function couleurAgent(id) {
  const teinte = (Number(id) * 137) % 360;
  return `hsl(${teinte} 55% 45%)`;
}

function formulaireVide(debutSemaine) {
  return {
    dateDebut: debutSemaine,
    dateFin: ajouterJours(debutSemaine, 6),
    jours: [1, 2, 3, 4, 5, 6, 7],
    heureDebut: '08:00',
    heureFin: '20:00',
    posteId: '',
    nbAgents: 1,
    decoupage: '',
    note: ''
  };
}

export function PlanningSite({ sites = [], postes = [], employees = [], mois, onChange }) {
  const sitesActifs = sites.filter((s) => s.actif);
  const postesActifs = postes.filter((p) => p.actif);
  const agents = employees.filter((e) => e.actif);

  const [siteId, setSiteId] = useState('');
  const [semaine, setSemaine] = useState(lundiDe(aujourdhui()));
  const [creneaux, setCreneaux] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [formOuvert, setFormOuvert] = useState(false);
  const [form, setForm] = useState(formulaireVide(lundiDe(aujourdhui())));
  const [creation, setCreation] = useState(false);
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(null); // id du creneau en cours de mise a jour
  const [modeSelection, setModeSelection] = useState(false);
  const [selection, setSelection] = useState(() => new Set());
  const [menuSuppr, setMenuSuppr] = useState(null); // id du creneau dont le menu "supprimer" est ouvert
  const [edition, setEdition] = useState(null); // { id, posteId, heureDebut, heureFin, note } du creneau en modification
  const [erreurEdition, setErreurEdition] = useState('');

  // Quand on change de mois avec les fleches du haut, on se place sur la
  // premiere semaine de ce mois (ou la semaine en cours si c'est ce mois-ci).
  useEffect(() => {
    if (!mois) return;
    const auj = aujourdhui();
    setSemaine(lundiDe(auj.startsWith(mois) ? auj : `${mois}-01`));
  }, [mois]);

  useEffect(() => {
    if (!siteId && sitesActifs.length > 0) setSiteId(String(sitesActifs[0].id));
  }, [siteId, sitesActifs]);

  const finSemaine = ajouterJours(semaine, 6);

  const charger = useCallback(async () => {
    if (!siteId) return;
    setChargement(true);
    try {
      const res = await fetch(`/api/admin/site-planning?site_id=${siteId}&du=${semaine}&au=${finSemaine}`);
      if (res.ok) setCreneaux((await res.json()).creneaux);
    } finally {
      setChargement(false);
    }
  }, [siteId, semaine, finSemaine]);

  useEffect(() => {
    charger();
  }, [charger]);

  const jours = useMemo(() => JOURS.map((j, i) => ({ ...j, date: ajouterJours(semaine, i) })), [semaine]);

  const parJour = useMemo(() => {
    const m = {};
    for (const c of creneaux) (m[c.slot_date] ||= []).push(c);
    return m;
  }, [creneaux]);

  const stats = useMemo(() => {
    let heures = 0;
    let heuresPourvues = 0;
    let libres = 0;
    for (const c of creneaux) {
      const h = dureeHeures(c.heure_debut, c.heure_fin);
      heures += h;
      if (c.employee_id) heuresPourvues += h;
      else libres += 1;
    }
    return { heures, heuresPourvues, libres };
  }, [creneaux]);

  function majForm(champ, valeur) {
    setForm((f) => ({ ...f, [champ]: valeur }));
  }

  function basculerJour(n) {
    setForm((f) => ({
      ...f,
      jours: f.jours.includes(n) ? f.jours.filter((x) => x !== n) : [...f.jours, n].sort()
    }));
  }

  function ouvrirForm() {
    setForm(formulaireVide(semaine));
    setMessage(null);
    setFormOuvert(true);
  }

  async function creer(e) {
    e.preventDefault();
    setCreation(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/site-planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, siteId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', texte: data.erreur || 'Creation impossible.' });
        return;
      }
      setMessage({ type: 'success', texte: `${data.crees} creneau(x) a pourvoir cree(s).` });
      setFormOuvert(false);
      setSemaine(lundiDe(form.dateDebut));
      charger();
    } finally {
      setCreation(false);
    }
  }

  async function attribuer(creneau, employeeId, forcer = false) {
    setEnCours(creneau.id);
    try {
      const res = await fetch(`/api/admin/site-planning/${creneau.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: employeeId ? Number(employeeId) : null, forcer })
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        if (window.confirm(`${data.erreur}\n\nL'affecter quand meme ?`)) {
          await attribuer(creneau, employeeId, true);
        }
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.erreur || 'Attribution impossible.');
      }
      await charger();
      onChange?.();
    } finally {
      setEnCours(null);
    }
  }

  function ouvrirEdition(c) {
    setMenuSuppr(null);
    setErreurEdition('');
    setEdition({
      id: c.id,
      posteId: c.poste_id ? String(c.poste_id) : '',
      heureDebut: c.heure_debut,
      heureFin: c.heure_fin,
      note: c.note || ''
    });
  }

  function majEdition(champ, valeur) {
    setEdition((ed) => ({ ...ed, [champ]: valeur }));
  }

  async function enregistrerEdition(e, forcer = false) {
    e?.preventDefault();
    if (!edition) return;
    setEnCours(edition.id);
    setErreurEdition('');
    try {
      const { id, ...modification } = edition;
      const res = await fetch(`/api/admin/site-planning/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modification, forcer })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.conflit) {
        if (window.confirm(`${data.erreur}\n\nEnregistrer quand meme ?`)) await enregistrerEdition(null, true);
        return;
      }
      if (!res.ok) {
        setErreurEdition(data.erreur || 'Modification impossible.');
        return;
      }
      setEdition(null);
      setMessage(
        data.dejaEffectue
          ? {
              type: 'success',
              texte:
                'Creneau modifie. Il etait deja effectue : la vacation correspondante a ete mise a jour elle aussi.'
            }
          : { type: 'success', texte: 'Creneau modifie.' }
      );
      await charger();
      onChange?.();
    } finally {
      setEnCours(null);
    }
  }

  // Suppression groupee (voir DELETE /api/admin/site-planning).
  // `nbAttribues` sert uniquement a prevenir que des agents perdront ces
  // creneaux dans leur planning.
  async function supprimerGroupe(corps, libelle, nbAttribues = 0) {
    const avertissement = nbAttribues
      ? `\n\nAttention : ${nbAttribues} creneau(x) deja attribue(s) seront aussi retires du planning des agents.`
      : '';
    if (!window.confirm(`Supprimer ${libelle} ?${avertissement}`)) return;
    const res = await fetch('/api/admin/site-planning', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    });
    const data = await res.json().catch(() => ({}));
    setMenuSuppr(null);
    setSelection(new Set());
    if (res.ok) setMessage({ type: 'success', texte: `${data.supprimes} creneau(x) supprime(s).` });
    else setMessage({ type: 'error', texte: data.erreur || 'Suppression impossible.' });
    await charger();
    onChange?.();
  }

  function supprimerCreneau(c) {
    supprimerGroupe({ ids: [c.id] }, `le creneau ${c.heure_debut}-${c.heure_fin}`, c.employee_id ? 1 : 0);
  }

  function supprimerVacation(c) {
    const attribues = creneaux.filter(
      (x) => x.lot_id === c.lot_id && x.lot_origine === c.lot_origine && x.employee_id
    ).length;
    supprimerGroupe(
      { lotId: c.lot_id, origine: c.lot_origine },
      `toute la vacation du ${libelleJour(c.lot_origine)} (${c.nb_vacation} creneau(x))`,
      attribues
    );
  }

  function supprimerSerie(c) {
    supprimerGroupe(
      { lotId: c.lot_id },
      `toute la serie creee en une fois (${c.nb_lot} creneau(x), toutes dates confondues)`,
      creneaux.filter((x) => x.lot_id === c.lot_id && x.employee_id).length
    );
  }

  function supprimerJour(date) {
    const liste = parJour[date] || [];
    if (liste.length === 0) return;
    supprimerGroupe(
      { siteId, date },
      `les ${liste.length} creneau(x) du ${libelleJour(date)}`,
      liste.filter((x) => x.employee_id).length
    );
  }

  function supprimerSelection() {
    const ids = [...selection];
    if (ids.length === 0) return;
    supprimerGroupe(
      { ids },
      `les ${ids.length} creneau(x) selectionne(s)`,
      creneaux.filter((x) => selection.has(x.id) && x.employee_id).length
    );
  }

  function basculerSelection(id) {
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectionnerListe(liste, cocher) {
    setSelection((s) => {
      const n = new Set(s);
      liste.forEach((c) => (cocher ? n.add(c.id) : n.delete(c.id)));
      return n;
    });
  }

  function quitterSelection() {
    setModeSelection(false);
    setSelection(new Set());
  }

  const nomSite = sitesActifs.find((s) => String(s.id) === String(siteId))?.nom || '';

  if (sitesActifs.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">Ajoutez d&apos;abord un site dans l&apos;onglet Sites.</div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="flex-between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div className="card-title" style={{ margin: 0 }}>
            Planning site
          </div>
          {!formOuvert && (
            <button className="btn btn-primary btn-sm" onClick={ouvrirForm}>
              + Creneaux a pourvoir
            </button>
          )}
        </div>
        <div className="small muted" style={{ marginBottom: 14 }}>
          Creez les creneaux prevus sur le site (besoins du marche), puis choisissez un agent pour chaque creneau :
          le creneau est ajoute automatiquement a son planning.
        </div>

        <div className="row">
          <div className="field">
            <label>Site</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {sitesActifs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Semaine</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setSemaine((s) => ajouterJours(s, -7))}>
                &larr;
              </button>
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap', flex: 1, textAlign: 'center' }}>
                {libelleJour(semaine)} &ndash; {libelleJour(finSemaine)}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setSemaine((s) => ajouterJours(s, 7))}>
                &rarr;
              </button>
            </div>
          </div>
        </div>

        {message && (
          <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`}>{message.texte}</div>
        )}

        {formOuvert && (
          <form onSubmit={creer} className="ps-form">
            <div className="flex-between" style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600 }}>Nouveaux creneaux a pourvoir &mdash; {nomSite}</div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setFormOuvert(false)}>
                Fermer
              </button>
            </div>
            <div className="row">
              <div className="field">
                <label>Du</label>
                <input type="date" value={form.dateDebut} onChange={(e) => majForm('dateDebut', e.target.value)} required />
              </div>
              <div className="field">
                <label>Au</label>
                <input type="date" value={form.dateFin} onChange={(e) => majForm('dateFin', e.target.value)} required />
              </div>
              <div className="field">
                <label>Debut</label>
                <input type="time" value={form.heureDebut} onChange={(e) => majForm('heureDebut', e.target.value)} required />
              </div>
              <div className="field">
                <label>Fin</label>
                <input type="time" value={form.heureFin} onChange={(e) => majForm('heureFin', e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label>Jours</label>
              <div className="bs-checks">
                {JOURS.map((j) => (
                  <label className="bs-check" key={j.n}>
                    <input type="checkbox" checked={form.jours.includes(j.n)} onChange={() => basculerJour(j.n)} />
                    {j.court}
                  </label>
                ))}
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>Poste (optionnel)</label>
                <select value={form.posteId} onChange={(e) => majForm('posteId', e.target.value)}>
                  <option value="">-</option>
                  {postesActifs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Agents par creneau</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={form.nbAgents}
                  onChange={(e) => majForm('nbAgents', e.target.value)}
                />
              </div>
              <div className="field">
                <label>Decoupage</label>
                <select value={form.decoupage} onChange={(e) => majForm('decoupage', e.target.value)}>
                  {DECOUPAGES.map((d) => (
                    <option key={d.v} value={d.v}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Note (optionnel)</label>
              <input
                type="text"
                placeholder="Ex. entree principale, tenue de ville"
                value={form.note}
                onChange={(e) => majForm('note', e.target.value)}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={creation}>
              {creation ? 'Creation...' : 'Creer les creneaux'}
            </button>
          </form>
        )}

        <div className="stat-grid" style={{ marginTop: 6 }}>
          <div className="stat">
            <div className="stat-label">Creneaux (semaine)</div>
            <div className="stat-value">{creneaux.length}</div>
          </div>
          <div className="stat">
            <div className="stat-label">A pourvoir</div>
            <div className="stat-value" style={{ color: stats.libres ? 'var(--danger)' : undefined }}>
              {stats.libres}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Heures pourvues</div>
            <div className="stat-value">
              {stats.heuresPourvues.toFixed(1)} / {stats.heures.toFixed(1)} h
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="ps-barre">
          {!modeSelection ? (
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={creneaux.length === 0}
              onClick={() => {
                setMenuSuppr(null);
                setModeSelection(true);
              }}
            >
              Selectionner des creneaux
            </button>
          ) : (
            <>
              <span className="small" style={{ fontWeight: 600 }}>
                {selection.size} selectionne(s)
              </span>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => selectionnerListe(creneaux, true)}>
                Toute la semaine
              </button>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={() => selectionnerListe(creneaux.filter((c) => !c.employee_id), true)}
              >
                Tous les &laquo; a pourvoir &raquo;
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setSelection(new Set())}>
                Rien
              </button>
              <button
                className="btn btn-danger btn-sm"
                type="button"
                disabled={selection.size === 0}
                onClick={supprimerSelection}
              >
                Supprimer la selection
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={quitterSelection}>
                Terminer
              </button>
            </>
          )}
        </div>
        {chargement && creneaux.length === 0 ? (
          <div className="empty-state">Chargement...</div>
        ) : (
          <div className="ps-grille">
            {jours.map((j) => {
              const liste = parJour[j.date] || [];
              return (
                <div className={`ps-jour ${j.date === aujourdhui() ? 'ps-jour-auj' : ''}`} key={j.date}>
                  <div className="ps-jour-titre">
                    {modeSelection && liste.length > 0 && (
                      <input
                        type="checkbox"
                        title="Selectionner toute la journee"
                        checked={liste.every((c) => selection.has(c.id))}
                        onChange={(e) => selectionnerListe(liste, e.target.checked)}
                      />
                    )}
                    <span>{libelleJour(j.date)}</span>
                    {!modeSelection && liste.length > 0 && (
                      <button
                        className="ps-suppr-jour"
                        type="button"
                        title="Supprimer tous les creneaux de cette journee"
                        onClick={() => supprimerJour(j.date)}
                      >
                        Vider
                      </button>
                    )}
                  </div>
                  {liste.length === 0 && <div className="ps-vide">&mdash;</div>}
                  {liste.map((c) => (
                    <div
                      key={c.id}
                      className={`ps-creneau ${c.employee_id ? '' : 'ps-libre'} ${
                        selection.has(c.id) ? 'ps-selectionne' : ''
                      }`}
                      style={c.employee_id ? { borderLeftColor: couleurAgent(c.employee_id) } : undefined}
                      onClick={modeSelection ? () => basculerSelection(c.id) : undefined}
                    >
                      <div className="ps-creneau-tete">
                        {modeSelection && (
                          <input
                            type="checkbox"
                            checked={selection.has(c.id)}
                            onChange={() => basculerSelection(c.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <span className="ps-heure">
                          {c.heure_debut}&ndash;{c.heure_fin}
                        </span>
                        {!modeSelection && (
                          <button
                            className="ps-modif"
                            type="button"
                            title="Modifier le creneau (poste, horaires, note)"
                            onClick={() => (edition?.id === c.id ? setEdition(null) : ouvrirEdition(c))}
                          >
                            &#9998;
                          </button>
                        )}
                        {!modeSelection && (
                          <button
                            className="ps-suppr"
                            type="button"
                            title="Supprimer..."
                            onClick={() => {
                              setEdition(null);
                              setMenuSuppr((m) => (m === c.id ? null : c.id));
                            }}
                          >
                            &times;
                          </button>
                        )}
                      </div>
                      {menuSuppr === c.id && (
                        <div className="ps-menu">
                          <button type="button" onClick={() => supprimerCreneau(c)}>
                            Ce creneau
                          </button>
                          {c.lot_id && c.nb_vacation > 1 && (
                            <button type="button" onClick={() => supprimerVacation(c)}>
                              Toute la vacation ({c.nb_vacation})
                            </button>
                          )}
                          {c.lot_id && c.nb_lot > c.nb_vacation && (
                            <button type="button" onClick={() => supprimerSerie(c)}>
                              Toute la serie ({c.nb_lot})
                            </button>
                          )}
                          <button type="button" className="ps-menu-annuler" onClick={() => setMenuSuppr(null)}>
                            Annuler
                          </button>
                        </div>
                      )}
                      {edition?.id === c.id && !modeSelection && (
                        <form className="ps-edition" onSubmit={enregistrerEdition}>
                          <label>Poste</label>
                          <select value={edition.posteId} onChange={(e) => majEdition('posteId', e.target.value)}>
                            <option value="">-</option>
                            {postesActifs.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nom}
                              </option>
                            ))}
                            {edition.posteId && !postesActifs.some((p) => String(p.id) === edition.posteId) && (
                              <option value={edition.posteId}>{c.poste || 'Poste actuel'}</option>
                            )}
                          </select>
                          <label>Debut</label>
                          <input
                            type="time"
                            value={edition.heureDebut}
                            onChange={(e) => majEdition('heureDebut', e.target.value)}
                            required
                          />
                          <label>Fin</label>
                          <input
                            type="time"
                            value={edition.heureFin}
                            onChange={(e) => majEdition('heureFin', e.target.value)}
                            required
                          />
                          <label>Note</label>
                          <input type="text" value={edition.note} onChange={(e) => majEdition('note', e.target.value)} />
                          {erreurEdition && <div className="ps-edition-erreur">{erreurEdition}</div>}
                          <div className="ps-edition-actions">
                            <button className="btn btn-primary btn-sm" type="submit" disabled={enCours === c.id}>
                              {enCours === c.id ? '...' : 'Enregistrer'}
                            </button>
                            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEdition(null)}>
                              Annuler
                            </button>
                          </div>
                        </form>
                      )}
                      {(c.poste || c.note) && (
                        <div className="ps-info">{[c.poste, c.note].filter(Boolean).join(' · ')}</div>
                      )}
                      {c.employee_id ? (
                        <div className="ps-agent" style={{ color: couleurAgent(c.employee_id) }}>
                          {nomAgent(c)}
                        </div>
                      ) : (
                        <div className="ps-agent ps-agent-libre">A pourvoir</div>
                      )}
                      <select
                        title={c.employee_id ? "Changer d'agent" : 'Choisir un agent'}
                        value={c.employee_id ? String(c.employee_id) : ''}
                        disabled={enCours === c.id || modeSelection}
                        onChange={(e) => attribuer(c, e.target.value)}
                      >
                        <option value="">{c.employee_id ? "Retirer l'agent" : 'Choisir un agent...'}</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {nomAgent(a)}
                          </option>
                        ))}
                        {c.employee_id && !agents.some((a) => a.id === c.employee_id) && (
                          <option value={c.employee_id}>{nomAgent(c)}</option>
                        )}
                      </select>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
