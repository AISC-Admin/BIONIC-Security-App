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

  async function supprimer(creneau) {
    const txt = creneau.employee_id
      ? `Supprimer ce creneau ? Il sera aussi retire du planning de ${nomAgent(creneau)}.`
      : 'Supprimer ce creneau a pourvoir ?';
    if (!window.confirm(txt)) return;
    await fetch(`/api/admin/site-planning/${creneau.id}`, { method: 'DELETE' });
    await charger();
    if (creneau.employee_id) onChange?.();
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
        {chargement && creneaux.length === 0 ? (
          <div className="empty-state">Chargement...</div>
        ) : (
          <div className="ps-grille">
            {jours.map((j) => {
              const liste = parJour[j.date] || [];
              return (
                <div className={`ps-jour ${j.date === aujourdhui() ? 'ps-jour-auj' : ''}`} key={j.date}>
                  <div className="ps-jour-titre">{libelleJour(j.date)}</div>
                  {liste.length === 0 && <div className="ps-vide">&mdash;</div>}
                  {liste.map((c) => (
                    <div
                      key={c.id}
                      className={`ps-creneau ${c.employee_id ? '' : 'ps-libre'}`}
                      style={c.employee_id ? { borderLeftColor: couleurAgent(c.employee_id) } : undefined}
                    >
                      <div className="ps-creneau-tete">
                        <span className="ps-heure">
                          {c.heure_debut}&ndash;{c.heure_fin}
                        </span>
                        <button
                          className="ps-suppr"
                          type="button"
                          title="Supprimer ce creneau"
                          onClick={() => supprimer(c)}
                        >
                          &times;
                        </button>
                      </div>
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
                        disabled={enCours === c.id}
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
