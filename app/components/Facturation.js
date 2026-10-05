'use client';

import { Fragment, useEffect, useState, useCallback } from 'react';

// Onglet "Facturation" : listing mensuel a facturer, par site (un client
// peut avoir plusieurs sites, chacun facture separement). Seules les
// vacations VALIDEES par le manager sont prises en compte. Pour chaque
// prestation (site + poste) : heures, tarif HT, montant, et repartition des
// heures entre les societes emettrices (BIONIC Stratom SAS, BIONIC Stratom LLC...).

function formatEuros(v) {
  if (v === null || v === undefined) return '';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
}

function formatHeures(h) {
  return `${Number(h || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
}

// Couleurs des badges par societe (dans l'ordre de la liste).
const COULEURS = [
  { bg: 'rgba(91, 152, 214, 0.14)', fg: '#3a6fa8' },
  { bg: 'rgba(201, 138, 44, 0.14)', fg: '#9a6514' },
  { bg: 'rgba(47, 158, 110, 0.14)', fg: '#23794f' },
  { bg: 'rgba(140, 90, 200, 0.14)', fg: '#6b3fa6' }
];

export default function Facturation({ mois, libelleMois }) {
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [edition, setEdition] = useState(null); // `${site_id}_${poste_id}`
  const [saisie, setSaisie] = useState({});
  const [nouvelleSociete, setNouvelleSociete] = useState('');

  const charger = useCallback(async () => {
    setChargement(true);
    const res = await fetch(`/api/admin/facturation?mois=${mois}`);
    if (res.ok) {
      setData(await res.json());
      setErreur(null);
    } else {
      setErreur('Impossible de charger la facturation.');
    }
    setChargement(false);
  }, [mois]);

  useEffect(() => {
    setEdition(null);
    charger();
  }, [charger]);

  const societes = data?.societes || [];
  const couleur = (id) => COULEURS[Math.max(0, societes.findIndex((x) => x.id === id)) % COULEURS.length];

  async function saisirTarif(site, ligne, valeur) {
    if (String(valeur).trim() === '') return;
    const res = await fetch('/api/admin/clients/tarifs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: site.site_id, poste_id: ligne.poste_id, taux: valeur })
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErreur(d.erreur || 'Tarif non enregistre.');
      return;
    }
    charger();
  }

  function ouvrirRepartition(site, ligne) {
    const cle = `${site.site_id}_${ligne.poste_id}`;
    if (edition === cle) {
      setEdition(null);
      return;
    }
    const actuel = Object.fromEntries(ligne.repartition.map((r) => [r.societe_id, String(r.heures)]));
    setSaisie(Object.fromEntries(societes.filter((x) => x.actif || actuel[x.id]).map((x) => [x.id, actuel[x.id] || ''])));
    setEdition(cle);
  }

  // Quand on modifie une societe et qu'il n'y en a que deux, l'autre recoit
  // automatiquement le reste des heures.
  function majSaisie(ligne, societeId, valeur) {
    setSaisie((s) => {
      const suivant = { ...s, [societeId]: valeur };
      const ids = Object.keys(suivant);
      if (ids.length === 2) {
        const autre = ids.find((id) => String(id) !== String(societeId));
        const n = Number(String(valeur).replace(',', '.'));
        if (valeur !== '' && Number.isFinite(n) && n <= ligne.heures) {
          suivant[autre] = String(Math.round((ligne.heures - n) * 100) / 100);
        }
      }
      return suivant;
    });
  }

  async function enregistrerRepartition(site, ligne, reinitialiser = false) {
    const res = await fetch('/api/admin/facturation/repartition', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mois, site_id: site.site_id, poste_id: ligne.poste_id, heures: reinitialiser ? {} : saisie })
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErreur(d.erreur || 'Repartition non enregistree.');
      return;
    }
    setErreur(null);
    setEdition(null);
    charger();
  }

  async function ajouterSociete(e) {
    e.preventDefault();
    const res = await fetch('/api/admin/facturation/societes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: nouvelleSociete })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErreur(d.erreur || 'Societe non ajoutee.');
      return;
    }
    setNouvelleSociete('');
    charger();
  }

  const libelle = libelleMois ? libelleMois(mois) : mois;

  return (
    <div className="card">
      <div className="flex-between" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="card-title" style={{ margin: 0 }}>
          Facturation clients · {libelle}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => (window.location.href = `/api/admin/facturation/export?mois=${mois}`)}>
          Exporter pour la compta (Excel)
        </button>
      </div>

      {erreur && <div className="alert alert-error">{erreur}</div>}

      {chargement && !data ? (
        <div className="muted small">Chargement...</div>
      ) : !data ? null : (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="stat-label">Heures validees a facturer</div>
              <div className="stat-value">{formatHeures(data.total.heures)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Montant HT a facturer</div>
              <div className="stat-value accent">{formatEuros(data.total.montant)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Sites factures</div>
              <div className="stat-value">{data.sites.length}</div>
            </div>
          </div>

          {data.parSociete?.length > 0 && (
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              {data.parSociete.map((t) => (
                <div className="stat" key={t.societe_id} style={{ borderLeft: `4px solid ${couleur(t.societe_id).fg}` }}>
                  <div className="stat-label">Facture par {t.societe}</div>
                  <div className="stat-value" style={{ color: couleur(t.societe_id).fg }}>
                    {formatEuros(t.montant)}
                  </div>
                  <div className="muted small">{formatHeures(t.heures)}</div>
                </div>
              ))}
            </div>
          )}

          {data.enAttente?.nb > 0 && (
            <div className="alert" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
              {data.enAttente.nb} vacation(s) ({formatHeures(data.enAttente.heures)}) de ce mois ne sont pas encore validees : elles
              ne sont pas comptees ici tant que le manager ne les a pas validees.
            </div>
          )}
          {data.total.tarifsManquants > 0 && (
            <div className="alert alert-error">
              {data.total.tarifsManquants} ligne(s) sans tarif de facturation : le montant total est incomplet. Saisissez le tarif
              ci-dessous ou dans l&apos;onglet Clients.
            </div>
          )}
          {data.total.sitesSansClient > 0 && (
            <div className="alert alert-error">
              {data.total.sitesSansClient} site(s) avec des heures ne sont rattaches a aucun client (onglet Clients).
            </div>
          )}
          {data.total.ecarts > 0 && (
            <div className="alert alert-error">
              {data.total.ecarts} prestation(s) ont plus d&apos;heures reparties que d&apos;heures validees (vacation invalidee
              entre-temps ?) : corrigez leur repartition.
            </div>
          )}

          {data.sites.length === 0 ? (
            <div className="empty-state">Aucune vacation validee pour ce mois.</div>
          ) : (
            data.sites.map((s) => (
              <div key={s.site_id} style={{ marginBottom: 18 }}>
                <div className="flex-between" style={{ marginBottom: 6 }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{s.site}</span>
                    <span className="muted"> · {s.client || 'Site sans client'}</span>
                  </div>
                  <div style={{ fontWeight: 700 }}>{formatEuros(s.montant)} HT</div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Poste</th>
                        <th style={{ textAlign: 'right' }}>Vacations</th>
                        <th style={{ textAlign: 'right' }}>Heures</th>
                        <th style={{ textAlign: 'right' }}>Tarif HT</th>
                        <th style={{ textAlign: 'right' }}>Montant HT</th>
                        <th>Societe emettrice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.lignes.map((l) => {
                        const cle = `${s.site_id}_${l.poste_id}`;
                        const ouvert = edition === cle;
                        const totalSaisi = Object.values(saisie).reduce((a, v) => a + (Number(String(v).replace(',', '.')) || 0), 0);
                        return (
                          <Fragment key={l.poste_id}>
                            <tr>
                              <td style={{ fontWeight: 600 }}>{l.poste}</td>
                              <td style={{ textAlign: 'right' }}>{l.nb_vacations}</td>
                              <td style={{ textAlign: 'right' }}>{formatHeures(l.heures)}</td>
                              <td style={{ textAlign: 'right' }}>
                                {l.tarif !== null ? (
                                  `${formatEuros(l.tarif)}/h`
                                ) : (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Tarif €/h"
                                    style={{ width: 100, padding: '5px 8px', textAlign: 'right', borderColor: 'var(--danger)' }}
                                    onBlur={(e) => saisirTarif(s, l, e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                  />
                                )}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                {l.montant !== null ? formatEuros(l.montant) : <span className="pill pill-danger">Tarif manquant</span>}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                  {l.repartition.map((r) => (
                                    <span
                                      key={r.societe_id}
                                      className="pill"
                                      style={{ background: couleur(r.societe_id).bg, color: couleur(r.societe_id).fg, textTransform: 'none', letterSpacing: 0 }}
                                    >
                                      {r.societe} · {formatHeures(r.heures)}
                                    </span>
                                  ))}
                                  {l.ecart > 0 && <span className="pill pill-danger">+{formatHeures(l.ecart)} en trop</span>}
                                  <button className="btn btn-secondary btn-sm" onClick={() => ouvrirRepartition(s, l)}>
                                    {ouvert ? 'Fermer' : 'Repartir'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {ouvert && (
                              <tr style={{ background: 'var(--surface-2)' }}>
                                <td colSpan={6} style={{ whiteSpace: 'normal' }}>
                                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                    {societes
                                      .filter((x) => Object.prototype.hasOwnProperty.call(saisie, x.id))
                                      .map((x) => (
                                        <div className="field" style={{ margin: 0 }} key={x.id}>
                                          <label>{x.nom}</label>
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="0"
                                            value={saisie[x.id]}
                                            onChange={(e) => majSaisie(l, x.id, e.target.value)}
                                            style={{ width: 120, textAlign: 'right' }}
                                          />
                                        </div>
                                      ))}
                                    <div className="small" style={{ paddingBottom: 10 }}>
                                      {formatHeures(totalSaisi)} / {formatHeures(l.heures)}
                                      {totalSaisi < l.heures - 0.001 && (
                                        <span className="muted">
                                          {' '}
                                          · reste {formatHeures(l.heures - totalSaisi)} a la societe par defaut
                                        </span>
                                      )}
                                      {totalSaisi > l.heures + 0.001 && <span style={{ color: 'var(--danger)' }}> · trop d&apos;heures</span>}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, paddingBottom: 4 }}>
                                      <button className="btn btn-primary btn-sm" onClick={() => enregistrerRepartition(s, l)}>
                                        Enregistrer
                                      </button>
                                      {l.repartie && (
                                        <button className="btn btn-ghost btn-sm" onClick={() => enregistrerRepartition(s, l, true)}>
                                          Reinitialiser
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <td style={{ fontWeight: 700 }}>Total site</td>
                        <td></td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatHeures(s.heures)}</td>
                        <td></td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatEuros(s.montant)}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}

          <form onSubmit={ajouterSociete} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Societes emettrices : {societes.filter((x) => x.actif !== false).map((x) => x.nom).join(', ')}</label>
              <input
                type="text"
                placeholder="Ajouter une societe emettrice"
                value={nouvelleSociete}
                onChange={(e) => setNouvelleSociete(e.target.value)}
                style={{ minWidth: 260 }}
              />
            </div>
            <button className="btn btn-secondary btn-sm" type="submit" disabled={!nouvelleSociete.trim()}>
              Ajouter
            </button>
          </form>
        </>
      )}
    </div>
  );
}
