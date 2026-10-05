'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { upload } from '@vercel/blob/client';

// Onglet "Clients" de l'espace responsable : listing complet des clients
// (coordonnees, contacts, infos de facturation), rattachement des sites,
// grille des taux horaires de facturation par site et par poste, et
// documents contractuels (RIB, KBIS, certificat d'enregistrement, contrat...).

const TYPES_DOCUMENTS = [
  'RIB',
  'KBIS',
  "Certificat d'enregistrement",
  'Contrat',
  'Avenant',
  'Attestation URSSAF',
  "Attestation d'assurance",
  'Bon de commande',
  'Autre'
];

function clientVide() {
  return {
    raison_sociale: '',
    forme_juridique: '',
    siret: '',
    tva_intra: '',
    adresse: '',
    code_postal: '',
    ville: '',
    pays: 'France',
    contact_nom: '',
    contact_fonction: '',
    contact_email: '',
    contact_telephone: '',
    email_facturation: '',
    conditions_paiement: '',
    notes: '',
    actif: true,
    societe_id: ''
  };
}

function formatDate(iso) {
  if (!iso) return null;
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

function formatEuros(v) {
  if (v === null || v === undefined || v === '') return '';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
}

function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nomFichierSur(nom) {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function lienFichier(url) {
  return url ? `/api/admin/clients/fichier?url=${encodeURIComponent(url)}` : '';
}

const styles = {
  inputTaux: { width: 90, padding: '6px 8px', textAlign: 'right' },
  bloc: { marginTop: 18 },
  sousTitre: { fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10 }
};

export default function BaseClients({ postes = [], onSitesModifies }) {
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [tarifs, setTarifs] = useState([]);
  const [societes, setSocietes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [form, setForm] = useState(clientVide());
  const [editionId, setEditionId] = useState(null);
  const [message, setMessage] = useState(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState(null);
  const formRef = useRef(null);

  const charger = useCallback(async () => {
    const res = await fetch('/api/admin/clients');
    if (res.ok) {
      const data = await res.json();
      setClients(data.clients);
      setSites(data.sites);
      setDocuments(data.documents);
      setTarifs(data.tarifs);
      setSocietes(data.societes || []);
    }
    setChargement(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  function maj(champ, valeur) {
    setForm((f) => ({ ...f, [champ]: valeur }));
  }

  async function enregistrer(e) {
    e.preventDefault();
    setEnregistrement(true);
    setMessage(null);
    try {
      const res = await fetch(editionId ? `/api/admin/clients/${editionId}` : '/api/admin/clients', {
        method: editionId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', texte: data.erreur || 'Enregistrement impossible.' });
        return;
      }
      setMessage({ type: 'success', texte: editionId ? 'Client mis a jour.' : 'Client ajoute : rattachez-lui ses sites et ses tarifs.' });
      if (!editionId && data.id) setOuvert(data.id);
      setForm(clientVide());
      setEditionId(null);
      charger();
    } finally {
      setEnregistrement(false);
    }
  }

  function modifier(c) {
    setEditionId(c.id);
    setForm({
      ...clientVide(),
      ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v === null ? '' : v]))
    });
    setMessage(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function annuler() {
    setEditionId(null);
    setForm(clientVide());
    setMessage(null);
  }

  async function supprimer(c) {
    if (!window.confirm(`Supprimer le client ${c.raison_sociale} et tous ses documents ? Ses sites seront conserves mais sans client.`)) return;
    const res = await fetch(`/api/admin/clients/${c.id}`, { method: 'DELETE' });
    if (res.ok) {
      if (editionId === c.id) annuler();
      charger();
      onSitesModifies?.();
    }
  }

  async function rattacherSite(client, siteId, rattacher) {
    if (!siteId) return;
    const res = await fetch(`/api/admin/clients/${client.id}/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: Number(siteId), rattacher })
    });
    if (res.ok) {
      await charger();
      onSitesModifies?.();
    }
  }

  const tarifsParCle = useMemo(() => {
    const m = new Map();
    for (const t of tarifs) m.set(`${t.site_id}_${t.poste_id}`, t.taux);
    return m;
  }, [tarifs]);

  async function enregistrerTarif(siteId, posteId, valeur) {
    const actuel = tarifsParCle.get(`${siteId}_${posteId}`);
    const propre = String(valeur).trim().replace(',', '.');
    if ((propre === '' && actuel === undefined) || (propre !== '' && Number(propre) === actuel)) return;
    const res = await fetch('/api/admin/clients/tarifs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId, poste_id: posteId, taux: propre })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ type: 'error', texte: data.erreur || 'Tarif non enregistre.' });
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setTarifs((liste) => {
      const autres = liste.filter((t) => !(t.site_id === siteId && t.poste_id === posteId));
      return data.taux === null ? autres : [...autres, { site_id: siteId, poste_id: posteId, taux: data.taux }];
    });
  }

  const sitesParClient = useMemo(() => {
    const m = new Map();
    for (const s of sites) {
      if (!s.client_id) continue;
      if (!m.has(s.client_id)) m.set(s.client_id, []);
      m.get(s.client_id).push(s);
    }
    return m;
  }, [sites]);

  const docsParClient = useMemo(() => {
    const m = new Map();
    for (const d of documents) {
      if (!m.has(d.client_id)) m.set(d.client_id, []);
      m.get(d.client_id).push(d);
    }
    return m;
  }, [documents]);

  const clientsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const nomsSites = (sitesParClient.get(c.id) || []).map((s) => s.nom);
      return [c.raison_sociale, c.ville, c.siret, c.contact_nom, c.contact_email, ...nomsSites]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [clients, recherche, sitesParClient]);

  const sitesSansClient = sites.filter((s) => !s.client_id);
  const postesActifs = postes.filter((p) => p.actif !== false);

  return (
    <>
      <div className="card" ref={formRef}>
        <div className="card-title">{editionId ? 'Modifier le client' : 'Ajouter un client'}</div>
        {message && <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`}>{message.texte}</div>}

        <form onSubmit={enregistrer}>
          <div className="row">
            <div className="field">
              <label>Raison sociale *</label>
              <input type="text" value={form.raison_sociale} onChange={(e) => maj('raison_sociale', e.target.value)} required />
            </div>
            <div className="field">
              <label>Forme juridique</label>
              <input type="text" placeholder="SAS, SARL..." value={form.forme_juridique} onChange={(e) => maj('forme_juridique', e.target.value)} />
            </div>
            <div className="field">
              <label>SIRET</label>
              <input type="text" value={form.siret} onChange={(e) => maj('siret', e.target.value)} />
            </div>
            <div className="field">
              <label>N° TVA intracom.</label>
              <input type="text" value={form.tva_intra} onChange={(e) => maj('tva_intra', e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Adresse</label>
              <input type="text" value={form.adresse} onChange={(e) => maj('adresse', e.target.value)} />
            </div>
            <div className="field">
              <label>Code postal</label>
              <input type="text" value={form.code_postal} onChange={(e) => maj('code_postal', e.target.value)} />
            </div>
            <div className="field">
              <label>Ville</label>
              <input type="text" value={form.ville} onChange={(e) => maj('ville', e.target.value)} />
            </div>
            <div className="field">
              <label>Pays</label>
              <input type="text" value={form.pays} onChange={(e) => maj('pays', e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Contact</label>
              <input type="text" placeholder="Nom et prenom" value={form.contact_nom} onChange={(e) => maj('contact_nom', e.target.value)} />
            </div>
            <div className="field">
              <label>Fonction</label>
              <input type="text" value={form.contact_fonction} onChange={(e) => maj('contact_fonction', e.target.value)} />
            </div>
            <div className="field">
              <label>Email contact</label>
              <input type="email" value={form.contact_email} onChange={(e) => maj('contact_email', e.target.value)} />
            </div>
            <div className="field">
              <label>Telephone</label>
              <input type="tel" value={form.contact_telephone} onChange={(e) => maj('contact_telephone', e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Email de facturation</label>
              <input type="email" value={form.email_facturation} onChange={(e) => maj('email_facturation', e.target.value)} />
            </div>
            <div className="field">
              <label>Conditions de paiement</label>
              <input type="text" placeholder="30 jours fin de mois..." value={form.conditions_paiement} onChange={(e) => maj('conditions_paiement', e.target.value)} />
            </div>
            <div className="field">
              <label>Societe qui facture par defaut</label>
              <select value={form.societe_id ?? ''} onChange={(e) => maj('societe_id', e.target.value)}>
                <option value="">{societes[0] ? `${societes[0].nom} (defaut)` : 'Societe par defaut'}</option>
                {societes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form.actif} onChange={(e) => maj('actif', e.target.checked)} />
                Client actif
              </label>
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea rows={3} value={form.notes} onChange={(e) => maj('notes', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" type="submit" disabled={enregistrement}>
              {enregistrement ? 'Enregistrement...' : editionId ? 'Enregistrer les modifications' : 'Ajouter le client'}
            </button>
            {editionId && (
              <button type="button" className="btn btn-secondary" onClick={annuler}>
                Annuler
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-title">
          Base clients facturation ({clientsFiltres.length}
          {clientsFiltres.length !== clients.length ? ` / ${clients.length}` : ''})
        </div>
        {sitesSansClient.length > 0 && (
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {sitesSansClient.length} site(s) sans client : {sitesSansClient.map((s) => s.nom).join(', ')}. Rattachez-les a un client pour
            qu&apos;ils apparaissent correctement dans la facturation.
          </div>
        )}
        <div className="field">
          <input type="search" placeholder="Rechercher (client, ville, SIRET, contact, site...)" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </div>

        {chargement ? (
          <div className="muted small">Chargement...</div>
        ) : clientsFiltres.length === 0 ? (
          <div className="empty-state">Aucun client.</div>
        ) : (
          <div className="list">
            {clientsFiltres.map((c) => {
              const sitesClient = sitesParClient.get(c.id) || [];
              const docs = docsParClient.get(c.id) || [];
              const detail = ouvert === c.id;
              return (
                <div key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="list-row" style={{ borderBottom: 'none', alignItems: 'flex-start' }}>
                    <div className="list-row-main">
                      <div className="list-row-title">
                        {c.raison_sociale}
                        {c.forme_juridique ? ` (${c.forme_juridique})` : ''}
                        {!c.actif && (
                          <span className="pill pill-danger" style={{ marginLeft: 8 }}>
                            Inactif
                          </span>
                        )}
                        <span className="pill pill-info" style={{ marginLeft: 8 }}>
                          {sitesClient.length} site{sitesClient.length > 1 ? 's' : ''}
                        </span>
                        <span className="pill pill-success" style={{ marginLeft: 6 }}>
                          {docs.length} doc{docs.length > 1 ? 's' : ''}
                        </span>
                        {c.societe_id && (
                          <span className="pill" style={{ marginLeft: 6, background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                            Facture par {societes.find((x) => x.id === c.societe_id)?.nom || '?'}
                          </span>
                        )}
                      </div>
                      <div className="list-row-sub">
                        {[[c.adresse, [c.code_postal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '), c.siret && `SIRET ${c.siret}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      <div className="list-row-sub">
                        {[c.contact_nom && `${c.contact_nom}${c.contact_fonction ? ` (${c.contact_fonction})` : ''}`, c.contact_telephone, c.contact_email]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => setOuvert(detail ? null : c.id)}>
                        {detail ? 'Fermer' : 'Sites, tarifs & documents'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => modifier(c)}>
                        Modifier
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => supprimer(c)}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                  {detail && (
                    <DetailClient
                      client={c}
                      sitesClient={sitesClient}
                      tousSites={sites}
                      clients={clients}
                      postes={postesActifs}
                      tarifsParCle={tarifsParCle}
                      docs={docs}
                      onRattacher={(siteId, r) => rattacherSite(c, siteId, r)}
                      onTarif={enregistrerTarif}
                      onDocsModifies={charger}
                      onErreur={(texte) => setMessage({ type: 'error', texte })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function DetailClient({ client, sitesClient, tousSites, clients, postes, tarifsParCle, docs, onRattacher, onTarif, onDocsModifies, onErreur }) {
  const [siteAjout, setSiteAjout] = useState('');
  const [typeDoc, setTypeDoc] = useState(TYPES_DOCUMENTS[0]);
  const [expiration, setExpiration] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const nomClient = (id) => clients.find((x) => x.id === id)?.raison_sociale;
  const autresSites = tousSites.filter((s) => s.client_id !== client.id);
  const auj = aujourdhui();

  async function envoyerDocument(e) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    if (fichier.size > 10 * 1024 * 1024) {
      onErreur('Le document depasse 10 Mo.');
      return;
    }
    setEnvoi(true);
    try {
      const blob = await upload(`clients/${client.id}/${nomFichierSur(fichier.name)}`, fichier, {
        access: 'private',
        handleUploadUrl: '/api/admin/clients/upload'
      });
      const res = await fetch(`/api/admin/clients/${client.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: typeDoc, nom: fichier.name, url: blob.url, date_expiration: expiration || null })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onErreur(data.erreur || 'Document non enregistre.');
        return;
      }
      setExpiration('');
      onDocsModifies();
    } catch (err) {
      onErreur(`Document non envoye : ${err.message}`);
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimerDocument(d) {
    if (!window.confirm(`Supprimer le document ${d.type} (${d.nom || ''}) ?`)) return;
    const res = await fetch(`/api/admin/clients/documents/${d.id}`, { method: 'DELETE' });
    if (res.ok) onDocsModifies();
  }

  return (
    <div style={{ padding: '0 0 18px 0' }}>
      {(client.email_facturation || client.conditions_paiement || client.tva_intra || client.notes) && (
        <div className="small" style={{ lineHeight: 1.6 }}>
          {client.email_facturation && <div>Email de facturation : {client.email_facturation}</div>}
          {client.conditions_paiement && <div>Conditions de paiement : {client.conditions_paiement}</div>}
          {client.tva_intra && <div>TVA intracom. : {client.tva_intra}</div>}
          {client.notes && <div style={{ whiteSpace: 'pre-wrap' }}>{client.notes}</div>}
        </div>
      )}

      <div style={styles.bloc}>
        <div style={styles.sousTitre}>Sites du client</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {sitesClient.length === 0 && <span className="muted small">Aucun site rattache.</span>}
          {sitesClient.map((s) => (
            <span key={s.id} className="pill pill-info" style={{ gap: 8 }}>
              {s.nom}
              <button
                type="button"
                onClick={() => onRattacher(s.id, false)}
                title="Retirer ce site du client"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, padding: 0 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={siteAjout} onChange={(e) => setSiteAjout(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="">Rattacher un site...</option>
            {autresSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
                {s.client_id ? ` (actuellement : ${nomClient(s.client_id) || 'autre client'})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!siteAjout}
            onClick={() => {
              onRattacher(siteAjout, true);
              setSiteAjout('');
            }}
          >
            Rattacher
          </button>
        </div>
      </div>

      <div style={styles.bloc}>
        <div style={styles.sousTitre}>Taux horaires de facturation HT (par poste et par site)</div>
        {sitesClient.length === 0 ? (
          <div className="muted small">Rattachez d&apos;abord un site pour saisir ses tarifs.</div>
        ) : postes.length === 0 ? (
          <div className="muted small">Aucun poste actif : creez des postes dans l&apos;onglet Postes.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Poste</th>
                  <th>Taux paie</th>
                  {sitesClient.map((s) => (
                    <th key={s.id}>{s.nom}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {postes.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nom}</td>
                    <td className="muted">{formatEuros(p.taux_horaire)}</td>
                    {sitesClient.map((s) => {
                      const v = tarifsParCle.get(`${s.id}_${p.id}`);
                      return (
                        <td key={s.id}>
                          <input
                            key={`${s.id}_${p.id}_${v ?? ''}`}
                            type="text"
                            inputMode="decimal"
                            placeholder="-"
                            defaultValue={v ?? ''}
                            style={styles.inputTaux}
                            onBlur={(e) => onTarif(s.id, p.id, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          />{' '}
                          <span className="muted small">€/h</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="muted small" style={{ marginTop: 6 }}>
          Saisissez le taux puis quittez la case (ou Entree) : il est enregistre automatiquement. Videz la case pour retirer le tarif.
        </div>
      </div>

      <div style={styles.bloc}>
        <div style={styles.sousTitre}>Documents contractuels</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Type</label>
            <select value={typeDoc} onChange={(e) => setTypeDoc(e.target.value)}>
              {TYPES_DOCUMENTS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Expiration (optionnel)</label>
            <input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} />
          </div>
          <label className="btn btn-primary btn-sm" style={{ display: 'inline-block', margin: 0, cursor: 'pointer' }}>
            {envoi ? 'Envoi...' : 'Joindre un fichier (PDF, Word, image)'}
            <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={envoyerDocument} disabled={envoi} hidden />
          </label>
        </div>
        {docs.length === 0 ? (
          <div className="muted small">Aucun document.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Fichier</th>
                  <th>Ajoute le</th>
                  <th>Expiration</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const expire = d.date_expiration && d.date_expiration < auj;
                  return (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600 }}>{d.type}</td>
                      <td>
                        <a href={lienFichier(d.url)} target="_blank" rel="noreferrer">
                          {d.nom || 'Ouvrir'}
                        </a>
                      </td>
                      <td>{formatDate(d.created_at)}</td>
                      <td>
                        {d.date_expiration ? (
                          <span className={expire ? 'pill pill-danger' : ''}>{formatDate(d.date_expiration)}{expire ? ' · expire' : ''}</span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-danger btn-sm" onClick={() => supprimerDocument(d)}>
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
