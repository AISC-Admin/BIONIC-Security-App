'use client';

import { useEffect, useState, useCallback } from 'react';
import { Brand, CompassRose } from './components/Brand';
import { CarteAgent, carteAgentComplete } from './components/CarteAgent';
import { LANGUES, LOCALES, traduire, traduireErreur, pluriel } from './i18n';

function moisCourant() {
  return new Date().toISOString().slice(0, 7);
}

function libelleMois(mois, locale) {
  const [annee, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(annee, m - 1, 1));
  const libelle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
  return libelle.charAt(0).toUpperCase() + libelle.slice(1);
}

function decalerMois(mois, delta) {
  const [annee, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(annee, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatEuros(valeur, locale) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(valeur || 0);
}

function formatDate(iso, locale) {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });
}

function entreeVide() {
  return { site_id: '', poste_id: '', heure_debut: '', heure_fin: '' };
}

function chargerLangue() {
  try {
    const sauvegardee = window.localStorage.getItem('pointage_langue');
    if (sauvegardee && LANGUES.some((l) => l.code === sauvegardee)) return sauvegardee;
  } catch (e) {
    // localStorage indisponible (navigation privee, etc.) : on garde le francais par defaut.
  }
  return 'fr';
}

function LangueSwitch({ langue, onChange, sombre }) {
  return (
    <div className={`lang-switch${sombre ? ' lang-switch-sombre' : ''}`}>
      {LANGUES.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`lang-switch-btn${langue === l.code ? ' active' : ''}`}
          onClick={() => onChange(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export default function EmployeePage() {
  const [chargement, setChargement] = useState(true);
  const [moi, setMoi] = useState(null);
  const [langue, setLangue] = useState('fr');

  // --- ecran de connexion ---
  const [nom, setNom] = useState('');
  const [code, setCode] = useState('');
  const [erreurConnexion, setErreurConnexion] = useState(null);
  const [connexionEnCours, setConnexionEnCours] = useState(false);

  // --- donnees app ---
  const [mois, setMois] = useState(moisCourant());
  const [gains, setGains] = useState(null);
  const [vacations, setVacations] = useState([]);
  const [planning, setPlanning] = useState([]);
  const [planPoste, setPlanPoste] = useState({}); // poste choisi pour un creneau sans poste
  const [planEnCours, setPlanEnCours] = useState(null);
  const [planErreur, setPlanErreur] = useState(null);
  const [options, setOptions] = useState({ sites: [], postes: [] });

  // --- formulaire de saisie ---
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [entrees, setEntrees] = useState([entreeVide()]);
  const [enregistrement, setEnregistrement] = useState(false);
  const [messageForm, setMessageForm] = useState(null);

  useEffect(() => {
    setLangue(chargerLangue());
  }, []);

  function changerLangue(code) {
    setLangue(code);
    try {
      window.localStorage.setItem('pointage_langue', code);
    } catch (e) {
      // rien a faire si le stockage local est indisponible
    }
  }

  const t = useCallback((cle) => traduire(langue, cle), [langue]);
  const locale = LOCALES[langue] || LOCALES.fr;

  const chargerSession = useCallback(async () => {
    const res = await fetch('/api/me', { cache: 'no-store' });
    if (res.ok) {
      setMoi(await res.json());
    } else {
      setMoi(null);
    }
    setChargement(false);
  }, []);

  useEffect(() => {
    chargerSession();
  }, [chargerSession]);

  // Reverifie le profil (nom/prenom mais aussi carte d'agent : photo,
  // fonction...) quand l'onglet redevient actif. Sans ca, un salarie deja
  // connecte ne voit sa carte apparaitre qu'apres avoir rafraichi la page
  // a la main, meme si le responsable vient de completer sa fiche.
  useEffect(() => {
    function surRetourFocus() {
      if (document.visibilityState === 'visible') chargerSession();
    }
    window.addEventListener('focus', chargerSession);
    document.addEventListener('visibilitychange', surRetourFocus);
    return () => {
      window.removeEventListener('focus', chargerSession);
      document.removeEventListener('visibilitychange', surRetourFocus);
    };
  }, [chargerSession]);

  const chargerDonnees = useCallback(async (moisCible) => {
    const [rGains, rVac, rOpt, rPlanning] = await Promise.all([
      fetch(`/api/me/earnings?mois=${moisCible}`),
      fetch(`/api/me/shifts?mois=${moisCible}`),
      fetch('/api/options'),
      fetch(`/api/me/planning?mois=${moisCible}`)
    ]);
    if (rGains.ok) setGains(await rGains.json());
    if (rVac.ok) setVacations((await rVac.json()).vacations);
    if (rOpt.ok) setOptions(await rOpt.json());
    if (rPlanning.ok) setPlanning((await rPlanning.json()).planning);
  }, []);

  useEffect(() => {
    if (moi) chargerDonnees(mois);
  }, [moi, mois, chargerDonnees]);

  // Transforme un creneau du planning en vacation effectuee (comptee dans
  // les gains, en attente de validation par le responsable).
  async function marquerEffectuee(p) {
    setPlanErreur(null);
    if (!p.poste_id && !planPoste[p.id]) {
      setPlanErreur({ id: p.id, texte: t('planningPosteRequired') });
      return;
    }
    setPlanEnCours(p.id);
    try {
      const res = await fetch(`/api/me/planning/${p.id}/effectuee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posteId: planPoste[p.id] || null })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPlanErreur({
          id: p.id,
          texte: data.code === 'poste_requis' ? t('planningPosteRequired') : data.erreur || 'Erreur'
        });
        return;
      }
      await chargerDonnees(mois);
    } finally {
      setPlanEnCours(null);
    }
  }

  async function connexion(e) {
    e.preventDefault();
    setErreurConnexion(null);
    setConnexionEnCours(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, code })
      });
      const data = await res.json();
      if (!res.ok) {
        setErreurConnexion(traduireErreur(langue, data.code, data.erreur));
        return;
      }
      if (data.role === 'admin') {
        window.location.href = '/admin';
        return;
      }
      setMoi(data);
    } finally {
      setConnexionEnCours(false);
    }
  }

  async function deconnexion() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setMoi(null);
    setVacations([]);
    setGains(null);
  }

  function majEntree(index, champ, valeur) {
    setEntrees((prev) => prev.map((e, i) => (i === index ? { ...e, [champ]: valeur } : e)));
  }

  function ajouterEntree() {
    setEntrees((prev) => (prev.length >= 6 ? prev : [...prev, entreeVide()]));
  }

  function retirerEntree(index) {
    setEntrees((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function enregistrerVacations(e) {
    e.preventDefault();
    setMessageForm(null);
    setEnregistrement(true);
    try {
      const res = await fetch('/api/me/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, entries: entrees })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessageForm({ type: 'error', texte: traduireErreur(langue, data.code, data.erreur) });
        return;
      }
      setMessageForm({ type: 'success', texte: t('saveSuccess') });
      setEntrees([entreeVide()]);
      if (mois === moisCourant() || mois === date.slice(0, 7)) {
        chargerDonnees(mois);
      }
      if (date.slice(0, 7) !== mois) setMois(date.slice(0, 7));
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimerVacation(id) {
    const res = await fetch(`/api/me/shifts/${id}`, { method: 'DELETE' });
    if (res.ok) chargerDonnees(mois);
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

  if (!moi) {
    return (
      <div className="page">
        <div className="auth-wrap">
          <div className="compass-rose-wrap">
            <CompassRose className="compass-rose" />
          </div>
          <div className="auth-card">
            <div className="auth-brand">
              <Brand subtitle={t('loginSubtitle')} />
            </div>
            <LangueSwitch langue={langue} onChange={changerLangue} sombre />
            {erreurConnexion && <div className="alert alert-error">{erreurConnexion}</div>}
            <form onSubmit={connexion}>
              <div className="field">
                <label htmlFor="nom">{t('lastName')}</label>
                <input
                  id="nom"
                  type="text"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  autoComplete="family-name"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="code">{t('code')}</label>
                <input
                  id="code"
                  type="password"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <button className="btn btn-primary btn-block" type="submit" disabled={connexionEnCours}>
                {connexionEnCours ? t('loggingIn') : t('login')}
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
          <Brand subtitle={moi.prenom ? `${moi.prenom} ${moi.nom}` : moi.nom} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <LangueSwitch langue={langue} onChange={changerLangue} sombre />
            <button className="btn btn-ghost" onClick={deconnexion}>
              {t('logout')}
            </button>
          </div>
        </div>
      </div>

      <div className="shell section-gap">
        <div className="earnings-card">
          <div className="earnings-label">{t('earningsLabel')}</div>
          <div className="earnings-amount">{formatEuros(gains?.totalMontant, locale)}</div>
          <div className="earnings-meta">
            {(gains?.totalHeures || 0).toFixed(2)} h &middot; {gains?.nbVacations || 0}{' '}
            {pluriel(langue, gains?.nbVacations || 0, 'vacationOne', 'vacationOther')}
          </div>
          <div className="earnings-month-nav">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setMois((m) => decalerMois(m, -1))}
              aria-label={t('monthPrev')}
              title={t('monthPrev')}
            >
              &larr;
            </button>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{libelleMois(mois, locale)}</div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setMois((m) => decalerMois(m, 1))}
              disabled={mois >= moisCourant()}
              aria-label={t('monthNext')}
              title={t('monthNext')}
            >
              &rarr;
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">{t('planningTitle')(libelleMois(mois, locale))}</div>
          {planning.length === 0 ? (
            <div className="empty-state">{t('planningEmptyState')}</div>
          ) : (
            <div className="list">
              {planning.map((p) => (
                <div className="list-row" key={p.id}>
                  <div className="list-row-main">
                    <div className="list-row-title">
                      {formatDate(p.planning_date, locale)} &middot; {p.site}
                    </div>
                    <div className="list-row-sub">
                      {p.poste && `${p.poste} · `}
                      {p.heure_debut}&ndash;{p.heure_fin}
                      {p.note && ` · ${p.note}`}
                    </div>
                    {planErreur?.id === p.id && (
                      <div className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>
                        {planErreur.texte}
                      </div>
                    )}
                  </div>
                  {p.shift_id ? (
                    <span className="pill pill-success">{t('planningDone')} &#10003;</span>
                  ) : p.passe ? (
                    <div className="plan-effectuer">
                      {!p.poste_id && (
                        <select
                          aria-label={t('planningPoste')}
                          value={planPoste[p.id] || ''}
                          onChange={(e) => setPlanPoste((c) => ({ ...c, [p.id]: e.target.value }))}
                        >
                          <option value="">{t('planningPoste')}</option>
                          {(options?.postes || []).map((po) => (
                            <option key={po.id} value={po.id}>
                              {po.nom}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={planEnCours === p.id}
                        onClick={() => marquerEffectuee(p)}
                      >
                        {t('planningMarkDone')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">{t('cardTitle')}</div>
          {carteAgentComplete(moi) ? (
            <>
              <div className="badge-imprimable">
                <CarteAgent employe={moi} />
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 12 }}
                onClick={() => window.print()}
              >
                {t('cardDownload')}
              </button>
            </>
          ) : (
            <div className="empty-state">{t('cardIncomplete')}</div>
          )}
        </div>

        <div className="card">
          <div className="card-title">{t('addVacationTitle')}</div>
          {messageForm && (
            <div className={`alert ${messageForm.type === 'error' ? 'alert-error' : 'alert-success'}`}>
              {messageForm.texte}
            </div>
          )}
          <form onSubmit={enregistrerVacations}>
            <div className="field">
              <label htmlFor="date">{t('dayLabel')}</label>
              <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>

            {entrees.map((entree, index) => (
              <div className="entry" key={index}>
                <div className="entry-head">
                  <span className="entry-num">
                    {entrees.length > 1 ? t('vacationNumbered')(index + 1) : t('vacationLabel')}
                  </span>
                  {entrees.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => retirerEntree(index)}
                    >
                      {t('remove')}
                    </button>
                  )}
                </div>
                <div className="field">
                  <label>{t('siteLabel')}</label>
                  <select
                    value={entree.site_id}
                    onChange={(e) => majEntree(index, 'site_id', e.target.value)}
                    required
                  >
                    <option value="">{t('chooseSite')}</option>
                    {options.sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>{t('posteLabel')}</label>
                  <select
                    value={entree.poste_id}
                    onChange={(e) => majEntree(index, 'poste_id', e.target.value)}
                    required
                  >
                    <option value="">{t('choosePoste')}</option>
                    {options.postes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom} &middot; {formatEuros(p.taux_horaire, locale)}/h
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row">
                  <div className="field">
                    <label>{t('startLabel')}</label>
                    <input
                      type="time"
                      value={entree.heure_debut}
                      onChange={(e) => majEntree(index, 'heure_debut', e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>{t('endLabel')}</label>
                    <input
                      type="time"
                      value={entree.heure_fin}
                      onChange={(e) => majEntree(index, 'heure_fin', e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex-between" style={{ marginTop: 14, marginBottom: 16 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={ajouterEntree}>
                {t('addAnotherVacation')}
              </button>
              <span className="small muted">{t('multivacationTag')}</span>
            </div>

            <button className="btn btn-primary btn-block" type="submit" disabled={enregistrement}>
              {enregistrement ? t('saving') : t('save')}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-title">{t('yourVacationsTitle')(libelleMois(mois, locale))}</div>
          {vacations.length === 0 ? (
            <div className="empty-state">{t('emptyState')}</div>
          ) : (
            <div className="list">
              {vacations.map((v) => (
                <div className="list-row" key={v.id}>
                  <div className="list-row-main">
                    <div className="list-row-title">
                      {formatDate(v.shift_date, locale)} &middot; {v.site}
                    </div>
                    <div className="list-row-sub">
                      {v.poste} &middot; {v.heure_debut}&ndash;{v.heure_fin} &middot;{' '}
                      {Number(v.duree_heures).toFixed(2)} h
                      {v.modifie_par_manager ? (
                        <span className="pill pill-danger" style={{ marginLeft: 8 }}>
                          {t('modifiedByManager')}
                        </span>
                      ) : (
                        v.valide && <span className="pill pill-success" style={{ marginLeft: 8 }}>{t('validated')}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="list-row-amount">{formatEuros(v.montant, locale)}</div>
                    {!v.valide && !v.modifie_par_manager && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => supprimerVacation(v.id)}
                        aria-label={t('deleteTitle')}
                        title={t('deleteTitle')}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
