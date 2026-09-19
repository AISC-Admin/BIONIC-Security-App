# Pointage Stratom

Application de pointage pour les salaries travaillant sur differents sites :
connexion par nom + code personnel, saisie d'une vacation (ou plusieurs le
meme jour, en "multivacation"), estimation du salaire du mois en temps reel,
et espace responsable avec export Excel toujours a jour.

Construite avec Next.js, pensee pour etre deployee gratuitement via
**GitHub + Vercel**, avec une base de donnees Postgres (Vercel Storage /
Neon, offre gratuite suffisante pour une equipe de cette taille).

## 1. Mettre le code sur GitHub

Si vous n'avez pas encore de repo :

```bash
cd pointage-app
git init
git add .
git commit -m "Premiere version de l'application de pointage"
```

Puis creez un repository vide sur https://github.com/new (ne cochez aucune
case d'initialisation), et poussez :

```bash
git remote add origin https://github.com/<votre-compte>/pointage-app.git
git branch -M main
git push -u origin main
```

## 2. Deployer sur Vercel

1. Allez sur https://vercel.com, connectez-vous avec votre compte GitHub.
2. "Add New..." > "Project", puis importez le repository `pointage-app`.
3. Vercel detecte automatiquement Next.js : laissez les reglages par defaut
   et cliquez sur "Deploy" une premiere fois (le site ne fonctionnera pas
   encore completement tant que la base de donnees et les variables
   ci-dessous ne sont pas ajoutees, ce n'est pas grave).

### Ajouter la base de donnees

Vercel ne propose plus sa propre offre Postgres : les bases de donnees
passent par le **Marketplace**, avec **Neon** comme fournisseur (offre
gratuite largement suffisante pour cette application).

1. Dans le projet Vercel, onglet **Storage** (ou **Marketplace**),
   recherchez **Neon** dans les integrations Postgres et installez-la.
2. Connectez la base creee au projet `pointage-app` : Vercel ajoute
   automatiquement la variable d'environnement `DATABASE_URL` (et
   `POSTGRES_URL` en complement, pour compatibilite) necessaire a
   l'application.

### Ajouter les variables d'environnement restantes

Toujours dans le projet Vercel : **Settings** > **Environment Variables**,
ajoutez (pour les environnements Production ET Preview) :

| Nom             | Valeur                                                        |
|------------------|----------------------------------------------------------------|
| `ADMIN_PASSWORD` | Le mot de passe du responsable (ecran de secours `/admin`).     |
| `MANAGER_NOM`    | Optionnel — identifiant responsable sur l'ecran de connexion nom+code. Par defaut `BIONIC` si non defini. |
| `MANAGER_CODE`   | Optionnel — code associe. Par defaut `809231` si non defini.    |
| `JWT_SECRET`     | Une chaine aleatoire longue, ex. generee avec `openssl rand -base64 48`. |

### Redeployer

Onglet **Deployments** > menu `...` sur le dernier deploiement > **Redeploy**
(pour que les nouvelles variables soient prises en compte). Les prochains
`git push` sur `main` redeploieront automatiquement.

Les tables de la base de donnees sont creees automatiquement au premier
appel a l'application : aucune commande SQL a lancer a la main.

## 3. Premiere configuration

1. Ouvrez `https://<votre-projet>.vercel.app` (l'ecran de connexion
   salarie) et connectez-vous avec le nom `BIONIC` et le code `809231`
   (ou les valeurs `MANAGER_NOM`/`MANAGER_CODE` si vous les avez changees) :
   vous arrivez directement dans l'espace responsable. L'ecran
   `https://<votre-projet>.vercel.app/admin` avec `ADMIN_PASSWORD` reste
   disponible comme deuxieme acces (utile en secours).
2. Onglet **Sites** : ajoutez vos sites clients.
3. Onglet **Postes** : ajoutez vos postes avec leur taux horaire (c'est ce
   taux qui sert a calculer automatiquement le salaire estime).
4. Onglet **Salaries** : ajoutez chaque salarie (nom, prenom, code
   personnel a leur communiquer).
5. Partagez le lien principal `https://<votre-projet>.vercel.app` a vos
   salaries : c'est l'ecran de connexion nom + code.

## Fonctionnement

- **Cote salarie** : connexion nom + code, ajout d'une vacation (site,
  poste, jour, heure de debut/fin) ou de plusieurs vacations le meme jour
  ("+ Ajouter une autre vacation ce jour" = multivacation). L'estimation
  du salaire du mois affichee en haut de l'ecran se recalcule
  immediatement a chaque vacation ajoutee ou supprimee.
- **Cote responsable** (`/admin`) : recap par salarie, detail de toutes
  les vacations avec filtres, validation (clic sur le badge) qui verrouille
  la vacation cote salarie, gestion des sites/postes/salaries, et export
  Excel.
- **Export Excel** : le fichier est regenere a la demande a partir des
  donnees actuelles a chaque clic sur "Exporter" — il est donc toujours a
  jour avec le dernier pointage, sans ressaisie manuelle. Une vraie
  ecriture automatique et silencieuse dans un fichier Excel externe (sans
  action de clic) n'est techniquement pas possible pour une application
  web ; ce mecanisme obtient le meme resultat pratique : les donnees ne
  sont jamais a resaisir, elles sont toujours pretes a l'export.

## A savoir sur la securite

L'authentification "nom + code" est volontairement simple (comme un badge
avec code PIN), pas un systeme d'authentification bancaire. Pour limiter
les risques :

- Utilisez des codes suffisamment longs (6 caracteres ou plus recommande,
  minimum impose : 4).
- Changez `ADMIN_PASSWORD`, ainsi que `MANAGER_NOM`/`MANAGER_CODE` (definissez
  ces deux variables d'environnement pour remplacer les valeurs par defaut
  `BIONIC`/`809231`), regulierement et ne les partagez qu'avec les personnes
  de confiance.
- Vercel fournit HTTPS automatiquement sur le nom de domaine `.vercel.app`
  ou sur un domaine personnalise que vous ajoutez.
- Si un code est perdu ou compromis, reinitialisez-le depuis l'onglet
  Salaries de l'espace responsable.

## Developpement local

```bash
npm install
cp .env.example .env.local   # completez avec vos vraies valeurs
npm run dev
```

Pour `POSTGRES_URL` en local, utilisez la valeur donnee par Vercel
(Storage > votre base > `.env.local` tab) ou une base Postgres locale.

## Structure du projet

```
app/
  page.js              Ecran salarie (connexion + pointage)
  admin/page.js         Ecran responsable
  api/
    auth/                connexion / deconnexion salarie
    me/                  donnees et actions du salarie connecte
    admin/               connexion et actions du responsable
    options/             sites et postes actifs (formulaire de pointage)
lib/
  db.js                 connexion Postgres + creation du schema
  auth.js               sessions (cookies signes)
  excel.js               generation du classeur Excel
```
