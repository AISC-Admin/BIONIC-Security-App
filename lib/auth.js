import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'pointage_session';
const SECRET = process.env.JWT_SECRET;

function requireSecret() {
  if (!SECRET) {
    throw new Error(
      "JWT_SECRET n'est pas defini. Ajoutez-le dans les variables d'environnement Vercel (Settings > Environment Variables)."
    );
  }
}

export function creerSession(payload) {
  requireSecret();
  return jwt.sign(payload, SECRET, { expiresIn: '120d' });
}

export async function poserCookieSession(payload) {
  const token = creerSession(payload);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 120
  });
}

export async function supprimerCookieSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// Retourne le contenu de la session courante, ou null si absente/invalide.
export async function getSession() {
  requireSecret();
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

// A utiliser en debut de route reservee aux salaries.
export async function requireEmployeeSession() {
  const session = await getSession();
  if (!session || session.role !== 'employee') return null;
  return session;
}

// A utiliser en debut de route reservee au responsable.
export async function requireAdminSession() {
  const session = await getSession();
  if (!session || session.role !== 'admin') return null;
  return session;
}

// Identifiant + code qui donnent acces a l'espace responsable directement
// depuis l'ecran de connexion salarie (memes deux champs, nom + code).
// Valeurs par defaut fournies pretes a l'emploi ; surchargeables via les
// variables d'environnement MANAGER_NOM / MANAGER_CODE (recommande une
// fois en production, voir le README).
export function getIdentifiantsManager() {
  return {
    nom: process.env.MANAGER_NOM || 'BIONIC',
    code: process.env.MANAGER_CODE || '809231'
  };
}
