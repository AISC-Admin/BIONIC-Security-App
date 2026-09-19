// Traductions de l'interface salarie (connexion + pointage). L'espace
// responsable reste en francais uniquement.
export const LANGUES = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
  { code: 'et', label: 'ET' },
  { code: 'es', label: 'ES' }
];

export const LOCALES = {
  fr: 'fr-FR',
  en: 'en-GB',
  et: 'et-EE',
  es: 'es-ES'
};

const DICTIONNAIRE = {
  fr: {
    loginSubtitle: 'Service de securite',
    lastName: 'Nom de famille',
    code: 'Code personnel',
    login: 'Se connecter',
    loggingIn: 'Connexion...',
    logout: 'Deconnexion',
    earningsLabel: 'Estimation de vos gains',
    vacationOne: 'vacation',
    vacationOther: 'vacations',
    monthPrev: 'Mois precedent',
    monthNext: 'Mois suivant',
    addVacationTitle: 'Ajouter une vacation',
    dayLabel: 'Jour',
    vacationLabel: 'Vacation',
    vacationNumbered: (n) => `Vacation ${n}`,
    remove: 'Retirer',
    siteLabel: 'Site',
    chooseSite: 'Choisir un site',
    posteLabel: 'Poste',
    choosePoste: 'Choisir un poste',
    startLabel: 'Debut',
    endLabel: 'Fin',
    addAnotherVacation: '+ Ajouter une autre vacation ce jour',
    multivacationTag: 'Multivacation',
    save: 'Enregistrer',
    saving: 'Enregistrement...',
    saveSuccess: 'Vacation(s) enregistree(s).',
    yourVacationsTitle: (mois) => `Vos vacations — ${mois}`,
    emptyState: 'Aucune vacation enregistree ce mois-ci.',
    validated: 'Validee',
    modifiedByManager: 'Modifie par le Manager',
    deleteTitle: 'Supprimer',
    planningTitle: (mois) => `Votre planning — ${mois}`,
    planningEmptyState: 'Aucun planning envoye pour ce mois.',
    cardTitle: "Votre carte d'agent",
    cardDownload: 'Imprimer / Telecharger en PDF',
    cardIncomplete: "Votre carte sera disponible ici des que votre responsable aura complete votre fiche (photo et fonction).",
    errors: {
      missing_fields: 'Nom et code requis.',
      invalid_credentials: 'Nom ou code incorrect.',
      missing_shift_fields: 'Date et au moins une vacation sont requises.',
      too_many_shifts: 'Trop de vacations pour une seule journee (max 6).',
      incomplete_entry: 'Chaque vacation doit avoir un site, un poste, une heure de debut et de fin.',
      invalid_poste: 'Poste invalide.',
      shift_not_found: 'Vacation introuvable.',
      shift_locked: 'Cette vacation a deja ete validee et ne peut plus etre supprimee.',
      generic: "Une erreur est survenue, merci de reessayer."
    }
  },
  en: {
    loginSubtitle: 'Security services',
    lastName: 'Last name',
    code: 'Personal code',
    login: 'Log in',
    loggingIn: 'Logging in...',
    logout: 'Log out',
    earningsLabel: 'Your estimated earnings',
    vacationOne: 'shift',
    vacationOther: 'shifts',
    monthPrev: 'Previous month',
    monthNext: 'Next month',
    addVacationTitle: 'Add a shift',
    dayLabel: 'Day',
    vacationLabel: 'Shift',
    vacationNumbered: (n) => `Shift ${n}`,
    remove: 'Remove',
    siteLabel: 'Site',
    chooseSite: 'Choose a site',
    posteLabel: 'Position',
    choosePoste: 'Choose a position',
    startLabel: 'Start',
    endLabel: 'End',
    addAnotherVacation: '+ Add another shift this day',
    multivacationTag: 'Multi-shift',
    save: 'Save',
    saving: 'Saving...',
    saveSuccess: 'Shift(s) saved.',
    yourVacationsTitle: (mois) => `Your shifts — ${mois}`,
    emptyState: 'No shifts recorded this month.',
    validated: 'Approved',
    modifiedByManager: 'Modified by the manager',
    deleteTitle: 'Delete',
    planningTitle: (mois) => `Your schedule — ${mois}`,
    planningEmptyState: 'No schedule sent for this month.',
    cardTitle: 'Your agent card',
    cardDownload: 'Print / Download as PDF',
    cardIncomplete: 'Your card will appear here once your manager has completed your profile (photo and role).',
    errors: {
      missing_fields: 'Last name and code are required.',
      invalid_credentials: 'Incorrect last name or code.',
      missing_shift_fields: 'A date and at least one shift are required.',
      too_many_shifts: 'Too many shifts for a single day (max 6).',
      incomplete_entry: 'Each shift needs a site, a position, a start time and an end time.',
      invalid_poste: 'Invalid position.',
      shift_not_found: 'Shift not found.',
      shift_locked: 'This shift has already been approved and can no longer be deleted.',
      generic: 'Something went wrong, please try again.'
    }
  },
  et: {
    loginSubtitle: 'Turvateenus',
    lastName: 'Perekonnanimi',
    code: 'Isiklik kood',
    login: 'Logi sisse',
    loggingIn: 'Sisselogimine...',
    logout: 'Logi välja',
    earningsLabel: 'Hinnanguline teenitud summa',
    vacationOne: 'vahetus',
    vacationOther: 'vahetust',
    monthPrev: 'Eelmine kuu',
    monthNext: 'Järgmine kuu',
    addVacationTitle: 'Lisa vahetus',
    dayLabel: 'Päev',
    vacationLabel: 'Vahetus',
    vacationNumbered: (n) => `Vahetus ${n}`,
    remove: 'Eemalda',
    siteLabel: 'Objekt',
    chooseSite: 'Vali objekt',
    posteLabel: 'Ametikoht',
    choosePoste: 'Vali ametikoht',
    startLabel: 'Algus',
    endLabel: 'Lõpp',
    addAnotherVacation: '+ Lisa samale päevale veel üks vahetus',
    multivacationTag: 'Mitu vahetust',
    save: 'Salvesta',
    saving: 'Salvestamine...',
    saveSuccess: 'Vahetus(ed) salvestatud.',
    yourVacationsTitle: (mois) => `Sinu vahetused — ${mois}`,
    emptyState: 'Sel kuul ei ole vahetusi registreeritud.',
    validated: 'Kinnitatud',
    modifiedByManager: 'Juht muutis',
    deleteTitle: 'Kustuta',
    planningTitle: (mois) => `Sinu tööplaan — ${mois}`,
    planningEmptyState: 'Sel kuul ei ole tööplaani saadetud.',
    cardTitle: 'Sinu töötaja kaart',
    cardDownload: 'Prindi / laadi PDF-ina alla',
    cardIncomplete: 'Sinu kaart ilmub siia, kui su juht on täitnud sinu profiili (foto ja ametikoht).',
    errors: {
      missing_fields: 'Perekonnanimi ja kood on kohustuslikud.',
      invalid_credentials: 'Vale perekonnanimi või kood.',
      missing_shift_fields: 'Kuupäev ja vähemalt üks vahetus on kohustuslikud.',
      too_many_shifts: 'Liiga palju vahetusi ühel päeval (maksimaalselt 6).',
      incomplete_entry: 'Igal vahetusel peab olema objekt, ametikoht, alguse- ja lõpuaeg.',
      invalid_poste: 'Vale ametikoht.',
      shift_not_found: 'Vahetust ei leitud.',
      shift_locked: 'See vahetus on juba kinnitatud ja seda ei saa enam kustutada.',
      generic: 'Midagi läks valesti, palun proovi uuesti.'
    }
  },
  es: {
    loginSubtitle: 'Servicio de seguridad',
    lastName: 'Apellido',
    code: 'Código personal',
    login: 'Iniciar sesión',
    loggingIn: 'Iniciando sesión...',
    logout: 'Cerrar sesión',
    earningsLabel: 'Estimación de tus ganancias',
    vacationOne: 'turno',
    vacationOther: 'turnos',
    monthPrev: 'Mes anterior',
    monthNext: 'Mes siguiente',
    addVacationTitle: 'Añadir un turno',
    dayLabel: 'Día',
    vacationLabel: 'Turno',
    vacationNumbered: (n) => `Turno ${n}`,
    remove: 'Quitar',
    siteLabel: 'Sitio',
    chooseSite: 'Elige un sitio',
    posteLabel: 'Puesto',
    choosePoste: 'Elige un puesto',
    startLabel: 'Inicio',
    endLabel: 'Fin',
    addAnotherVacation: '+ Añadir otro turno este día',
    multivacationTag: 'Multiturno',
    save: 'Guardar',
    saving: 'Guardando...',
    saveSuccess: 'Turno(s) guardado(s).',
    yourVacationsTitle: (mois) => `Tus turnos — ${mois}`,
    emptyState: 'No hay turnos registrados este mes.',
    validated: 'Validado',
    modifiedByManager: 'Modificado por el gerente',
    deleteTitle: 'Eliminar',
    planningTitle: (mois) => `Tu horario previsto — ${mois}`,
    planningEmptyState: 'No se ha enviado ningún horario para este mes.',
    cardTitle: 'Tu carné de agente',
    cardDownload: 'Imprimir / Descargar en PDF',
    cardIncomplete: 'Tu carné aparecerá aquí en cuanto tu responsable complete tu ficha (foto y puesto).',
    errors: {
      missing_fields: 'El apellido y el código son obligatorios.',
      invalid_credentials: 'Apellido o código incorrecto.',
      missing_shift_fields: 'Se requiere una fecha y al menos un turno.',
      too_many_shifts: 'Demasiados turnos para un mismo día (máx. 6).',
      incomplete_entry: 'Cada turno necesita un sitio, un puesto, una hora de inicio y una de fin.',
      invalid_poste: 'Puesto no válido.',
      shift_not_found: 'Turno no encontrado.',
      shift_locked: 'Este turno ya ha sido validado y no se puede eliminar.',
      generic: 'Ha ocurrido un error, inténtalo de nuevo.'
    }
  }
};

export function traduire(langue, cle) {
  const dict = DICTIONNAIRE[langue] || DICTIONNAIRE.fr;
  const valeur = dict[cle] ?? DICTIONNAIRE.fr[cle];
  return valeur;
}

export function traduireErreur(langue, code, messageParDefaut) {
  const dict = DICTIONNAIRE[langue] || DICTIONNAIRE.fr;
  if (code && dict.errors[code]) return dict.errors[code];
  if (code && DICTIONNAIRE.fr.errors[code]) return DICTIONNAIRE.fr.errors[code];
  return messageParDefaut || dict.errors.generic;
}

export function pluriel(langue, count, singulier, pluriel_) {
  const dict = DICTIONNAIRE[langue] || DICTIONNAIRE.fr;
  return count > 1 ? dict[pluriel_] : dict[singulier];
}
