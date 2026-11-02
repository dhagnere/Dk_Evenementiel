import { z } from 'zod';

/**
 * Référentiel du rétroplanning : un squelette unique de 7 jalons, réglé par trois curseurs.
 *
 * 1. Le niveau (N1 à N4) : niveau de base tiré de la jauge, relevé d'un cran par critère de risque
 *    (majoration), plafonné à N4. Il décide quels jalons sont actifs et qui les valide.
 * 2. Les jalons : des portillons, franchis quand la question de passage reçoit un « oui ». Les tâches
 *    d'un jalon inactif se rattachent au jalon actif suivant.
 * 3. Les modules : activés par les caractéristiques de l'événement, ils ajoutent leurs tâches types.
 *
 * Chaque tâche porte ses rôles P/F/V/I : un seul « P » (porte le résultat), « F » (fait), « V »
 * (valide), « I » (informés).
 *
 * Tout est paramétrable dans l'application (Projets → Référentiel). Les valeurs ci-dessous ne sont
 * qu'un point de départ : seuils de jauge et délais incompressibles se calent avec le référent
 * sécurité et la préfecture.
 */

const code = z.string().trim().min(1).max(40);
const libelle = z.string().trim().min(1).max(300);

export const schemaReferentiel = z.object({
  jalons: z
    .array(
      z.object({
        code,
        libelle,
        offset: z.number().int().min(-730).max(365),
        question: z.string().trim().max(500),
        livrable: z.string().trim().max(500),
      })
    )
    .min(1)
    .max(20),
  roles: z
    .array(
      z.object({
        code,
        libelle,
        mission: z.string().trim().max(500).default(''),
        // Niveau à partir duquel le rôle est tenu par une personne distincte ; en dessous, le pilote le tient.
        niveauMin: z.number().int().min(1).max(4).default(1),
      })
    )
    .min(1)
    .max(40),
  // Bornes basses de jauge des niveaux N2, N3 et N4.
  seuilsJauge: z.tuple([z.number().int().min(0), z.number().int().min(0), z.number().int().min(0)]),
  niveaux: z
    .array(
      z.object({
        niveau: z.number().int().min(1).max(4),
        libelle,
        exemples: z.string().trim().max(300).default(''),
        // Jalons actifs à ce niveau, avec le rôle qui les valide.
        jalons: z.array(z.object({ code, valideur: code })).min(1),
      })
    )
    .length(4),
  criteres: z
    .array(
      z.object({
        code,
        libelle,
        modules: z.array(code).default([]),
        majoration: z.boolean().default(false),
        // Classe directement l'événement en N4 (multi-sites).
        niveauMax: z.boolean().default(false),
      })
    )
    .max(40),
  modules: z
    .array(
      z.object({
        code,
        libelle,
        activation: z.string().trim().max(300).default(''),
        // Date de non-retour imposée (jours avant J) ; sinon, plus long délai incompressible du module.
        nonRetourJours: z.number().int().min(0).max(730).nullable().default(null),
      })
    )
    .min(1)
    .max(40),
  taches: z
    .array(
      z.object({
        code,
        libelle,
        module: code,
        jalon: code,
        offset: z.number().int().min(-730).max(365),
        niveauMin: z.number().int().min(1).max(4).default(1),
        porte: code,
        fait: z.string().trim().max(40).default(''),
        valide: z.string().trim().max(40).default(''),
        informe: z.array(code).default([]),
        livrable: z.string().trim().max(300).default(''),
        bloquante: z.boolean().default(false),
        incompressibleJours: z.number().int().min(0).max(730).nullable().default(null),
      })
    )
    .max(500),
  budgetPostes: z.array(z.string().trim().min(1).max(100)).max(50),
});
export type Referentiel = z.infer<typeof schemaReferentiel>;
export type TacheType = Referentiel['taches'][number];

/** Contrôles de cohérence que le schéma seul ne voit pas. Renvoie la liste des anomalies. */
export function controlerReferentiel(r: Referentiel): string[] {
  const erreurs: string[] = [];
  const jalons = new Set(r.jalons.map((j) => j.code));
  const roles = new Set(r.roles.map((x) => x.code));
  const modules = new Set(r.modules.map((m) => m.code));
  if (!modules.has('socle')) erreurs.push('Le module « socle » est obligatoire');
  for (const n of r.niveaux) {
    for (const j of n.jalons) {
      if (!jalons.has(j.code)) erreurs.push(`N${n.niveau} : jalon inconnu ${j.code}`);
      if (!roles.has(j.valideur)) erreurs.push(`N${n.niveau} : rôle valideur inconnu ${j.valideur}`);
    }
    // Le dernier jalon doit rester actif à tous les niveaux, pour que chaque tâche trouve un jalon de rattachement.
    if (!n.jalons.some((j) => j.code === r.jalons[r.jalons.length - 1]?.code)) {
      erreurs.push(`N${n.niveau} : le dernier jalon (${r.jalons[r.jalons.length - 1]?.code}) doit rester actif`);
    }
  }
  for (const c of r.criteres) for (const m of c.modules) if (!modules.has(m)) erreurs.push(`Critère ${c.code} : module inconnu ${m}`);
  const vus = new Set<string>();
  for (const t of r.taches) {
    if (vus.has(t.code)) erreurs.push(`Tâche ${t.code} en double`);
    vus.add(t.code);
    if (!modules.has(t.module)) erreurs.push(`Tâche ${t.code} : module inconnu ${t.module}`);
    if (!jalons.has(t.jalon)) erreurs.push(`Tâche ${t.code} : jalon inconnu ${t.jalon}`);
    for (const role of [t.porte, t.fait, t.valide, ...t.informe].filter(Boolean)) {
      if (!roles.has(role)) erreurs.push(`Tâche ${t.code} : rôle inconnu ${role}`);
    }
  }
  const [a, b, c] = r.seuilsJauge;
  if (!(a < b && b < c)) erreurs.push('Les seuils de jauge doivent être croissants');
  return erreurs;
}

// --- Valeurs de départ -----------------------------------------------------------------------------

type Ligne = [
  code: string,
  libelle: string,
  module: string,
  jalon: string,
  offset: number,
  niveauMin: number,
  porte: string,
  fait: string,
  valide: string,
  informe: string[],
  livrable: string,
  bloquante: boolean,
  incompressibleJours: number | null,
];

// prettier-ignore
const TACHES: Ligne[] = [
  // Socle : toujours actif.
  ['SO-01', 'Fiche de demande validée et inscription au calendrier', 'socle', 'T-180', -180, 1, 'pilote', 'pilote', 'chef_service', ['demandeur'], 'Fiche de demande validée', true, null],
  ['SO-02', 'Désignation du pilote et calcul du niveau', 'socle', 'T-180', -180, 1, 'chef_service', 'chef_service', '', ['pilote', 'demandeur'], 'Pilote désigné, niveau calculé', true, null],
  ['SO-03', 'Note de cadrage : objectifs, publics, jauge, budget prévisionnel', 'socle', 'T-180', -175, 2, 'pilote', 'pilote', 'demandeur', ['chef_service'], 'Note de cadrage', false, null],
  ['SO-04', 'Pré-réservation du lieu et contrôle des occupations concurrentes', 'socle', 'T-180', -175, 1, 'ref_logistique', 'ref_logistique', 'pilote', [], 'Lieu pré-réservé', true, 60],
  ['SO-05', "Désignation d'un référent par branche", 'socle', 'T-180', -170, 3, 'chef_service', 'chef_service', '', ['pilote'], 'Équipe projet constituée', false, null],
  ['SO-06', 'Programme arrêté', 'socle', 'T-120', -120, 1, 'pilote', 'ref_animation', 'demandeur', ['chef_service'], 'Programme', false, null],
  ['SO-07', 'Budget détaillé validé', 'socle', 'T-120', -120, 1, 'pilote', 'pilote', 'demandeur', ['chef_service'], 'Budget détaillé', false, null],
  ['SO-08', 'Expression des besoins prestataires', 'socle', 'T-120', -115, 2, 'pilote', 'ref_logistique', '', [], 'Besoins prestataires', false, null],
  ['SO-09', 'Consultations prestataires lancées', 'socle', 'T-90', -100, 2, 'ref_logistique', 'ref_logistique', 'chef_service', ['pilote'], 'Consultations lancées', true, 45],
  ['SO-10', 'Plan de communication arrêté', 'socle', 'T-90', -100, 2, 'ref_kiosc', 'ref_kiosc', 'pilote', [], 'Plan de communication', false, null],
  ['SO-11', "Plan d'implantation, version 1", 'socle', 'T-90', -90, 2, 'ref_logistique', 'ref_logistique', 'pilote', [], "Plan d'implantation V1", false, null],
  ['SO-12', "Dossier de sécurité et plan d'implantation déposés", 'socle', 'T-90', -90, 3, 'ref_securite', 'ref_securite', 'chef_service', ['pilote'], 'Dossier de sécurité déposé', true, 60],
  ['SO-13', "Plan d'implantation figé", 'socle', 'T-60', -60, 2, 'ref_logistique', 'ref_logistique', 'pilote', ['ref_securite'], "Plan d'implantation figé", false, null],
  ['SO-14', '1re réunion inter-branches', 'socle', 'T-60', -60, 2, 'pilote', 'pilote', '', ['ref_logistique', 'ref_animation', 'ref_protocole', 'ref_affichage', 'ref_kiosc'], 'Compte rendu de réunion', false, null],
  ['SO-15', 'Réservation du matériel', 'socle', 'T-60', -60, 1, 'ref_logistique', 'ref_logistique', '', ['pilote'], 'Matériel réservé', true, 30],
  ['SO-16', 'Dimensionnement du DPS (grille RNMSC)', 'socle', 'T-60', -60, 2, 'ref_securite', 'ref_securite', 'chef_service', ['pilote'], 'Convention DPS', true, 45],
  ['SO-17', 'Bons de commande prestataires notifiés', 'socle', 'T-60', -55, 2, 'ref_logistique', 'ref_logistique', 'chef_service', ['prestataire'], 'Bons de commande', true, 30],
  ['SO-18', "BAT des supports d'affichage validés", 'socle', 'T-30', -45, 2, 'ref_affichage', 'ref_affichage', 'pilote', [], 'BAT validés', false, null],
  ['SO-19', 'Avis sécurité rendu', 'socle', 'T-30', -30, 2, 'ref_securite', 'ref_securite', 'chef_service', ['pilote'], 'Avis sécurité', true, 30],
  ['SO-20', "Attestation d'assurance RC organisateur", 'socle', 'T-30', -30, 1, 'pilote', 'pilote', '', [], 'Attestation RC', true, 15],
  ['SO-21', 'Mesures de sûreté validées (Vigipirate)', 'socle', 'T-30', -30, 3, 'ref_securite', 'ref_securite', 'chef_service', ['pilote'], 'Mesures de sûreté', true, 21],
  ['SO-22', 'Plan de communication lancé, affichage diffusé', 'socle', 'T-30', -25, 1, 'ref_affichage', 'ref_affichage', '', ['pilote'], 'Affichage diffusé', false, null],
  ['SO-23', 'Planning de montage et de démontage', 'socle', 'T-30', -21, 2, 'ref_logistique', 'ref_logistique', 'pilote', ['regisseur', 'prestataire'], 'Planning de montage', false, null],
  ['SO-24', 'Fiche technique transmise aux prestataires', 'socle', 'T-30', -21, 3, 'ref_logistique', 'ref_logistique', '', ['prestataire'], 'Fiche technique', false, null],
  ['SO-25', 'Accessibilité PMR vérifiée', 'socle', 'T-7', -15, 2, 'ref_logistique', 'ref_logistique', 'ref_securite', [], 'Accessibilité vérifiée', false, null],
  ['SO-26', 'Visite des structures temporaires (CTS, tribunes, podium)', 'socle', 'T-7', -10, 3, 'ref_securite', 'ref_securite', 'chef_service', [], 'Procès-verbal de visite', true, 10],
  ['SO-27', 'Conducteur minute par minute', 'socle', 'T-7', -12, 2, 'pilote', 'ref_animation', '', ['regisseur'], 'Conducteur', false, null],
  ['SO-28', 'Fiches de poste des agents', 'socle', 'T-7', -10, 2, 'regisseur', 'regisseur', 'pilote', [], 'Fiches de poste', false, null],
  ['SO-29', 'Annuaire jour J et kit (badges, radios)', 'socle', 'T-7', -7, 2, 'regisseur', 'regisseur', '', ['pilote'], 'Annuaire jour J', false, null],
  ['SO-30', 'Briefing des équipes', 'socle', 'T-7', -7, 1, 'pilote', 'pilote', '', ['regisseur', 'ref_logistique', 'ref_animation'], 'Équipes briefées', false, null],
  ['SO-31', 'Point météo et plan de repli', 'socle', 'T-7', -2, 2, 'regisseur', 'regisseur', 'pilote', [], 'Décision de maintien', false, null],
  ['SO-32', 'Montage et réception des installations', 'socle', 'J+7', 0, 1, 'regisseur', 'ref_logistique', '', ['pilote'], 'Installations réceptionnées', false, null],
  ['SO-33', 'Visite de sécurité et levée des réserves', 'socle', 'J+7', 0, 3, 'ref_securite', 'ref_securite', 'chef_service', ['regisseur'], 'Levée des réserves', false, null],
  ['SO-34', 'Démontage et remise en état du site', 'socle', 'J+7', 0, 1, 'ref_logistique', 'ref_logistique', '', ['regisseur'], 'Site rendu', false, null],
  ['SO-35', 'Bilan chiffré (fréquentation, budget réalisé)', 'socle', 'J+7', 7, 1, 'pilote', 'pilote', 'chef_service', ['demandeur'], 'Bilan chiffré', false, null],
  ['SO-36', 'Points à reconduire ou à corriger', 'socle', 'J+7', 7, 1, 'pilote', 'pilote', '', ['demandeur', 'chef_service'], 'Retour d’expérience', false, null],
  ['SO-37', 'Retours prestataires et factures', 'socle', 'J+7', 7, 2, 'ref_logistique', 'ref_logistique', '', ['pilote'], 'Factures', false, null],
  ['SO-38', 'Archivage photos et revue de presse', 'socle', 'J+7', 7, 2, 'ref_kiosc', 'ref_kiosc', '', ['pilote'], 'Revue de presse', false, null],
  // Protocole.
  ['PR-01', 'Liste des invités, version 1', 'protocole', 'T-90', -90, 1, 'ref_protocole', 'ref_protocole', 'demandeur', ['pilote'], 'Liste des invités', false, null],
  ['PR-02', "Cartons d'invitation (BAT)", 'protocole', 'T-60', -45, 1, 'ref_protocole', 'ref_protocole', 'demandeur', [], 'Cartons', false, null],
  ['PR-03', 'Envoi des invitations', 'protocole', 'T-30', -30, 1, 'ref_protocole', 'ref_protocole', '', ['pilote'], 'Invitations envoyées', true, 21],
  ['PR-04', 'Plan de placement et ordre des discours', 'protocole', 'T-7', -10, 1, 'ref_protocole', 'ref_protocole', 'chef_service', ['pilote'], 'Plan de placement', false, null],
  ['PR-05', 'Éléments de discours', 'protocole', 'T-7', -7, 1, 'ref_protocole', 'ref_protocole', 'demandeur', [], 'Éléments de discours', false, null],
  ['PR-06', 'Accueil des personnalités (circuit, agents)', 'protocole', 'T-7', -5, 2, 'ref_protocole', 'ref_protocole', '', ['regisseur'], "Plan d'accueil", false, null],
  // Voie publique.
  ['VP-01', "Demande d'autorisation d'occupation du domaine public", 'voie_publique', 'T-90', -90, 1, 'ref_logistique', 'ref_logistique', 'chef_service', ['pilote'], 'Autorisation signée', true, 60],
  ['VP-02', 'Information des riverains', 'voie_publique', 'T-30', -21, 1, 'ref_kiosc', 'ref_kiosc', '', ['pilote'], 'Courrier riverains', false, null],
  ['VP-03', "Demande d'arrêté de circulation", 'voie_publique', 'T-90', -75, 2, 'ref_logistique', 'ref_logistique', 'chef_service', ['pilote'], 'Arrêté signé', true, 45],
  ['VP-04', 'Plan de barriérage', 'voie_publique', 'T-30', -30, 1, 'ref_logistique', 'ref_logistique', 'ref_securite', [], 'Plan de barriérage', false, null],
  ['VP-05', 'Coordination avec la police municipale', 'voie_publique', 'T-30', -21, 2, 'ref_securite', 'ref_securite', '', ['pilote'], 'Note de coordination', false, null],
  // Scène et son.
  ['SC-01', 'Fiche technique artiste reçue', 'scene_son', 'T-120', -120, 1, 'ref_animation', 'ref_animation', '', ['ref_logistique'], 'Fiche technique', false, null],
  ['SC-02', 'Contrat de cession artiste signé', 'scene_son', 'T-90', -90, 1, 'ref_animation', 'ref_animation', 'chef_service', ['pilote'], 'Contrat signé', true, 45],
  ['SC-03', 'Déclaration SACEM', 'scene_son', 'T-30', -30, 1, 'ref_animation', 'ref_animation', '', ['pilote'], 'Déclaration SACEM', true, 15],
  ['SC-04', 'Étude de nuisances sonores et limitation', 'scene_son', 'T-30', -30, 3, 'ref_securite', 'ref_securite', 'chef_service', [], 'Étude sonore', false, null],
  ['SC-05', 'Réception technique scène et son', 'scene_son', 'J+7', -1, 2, 'regisseur', 'prestataire', '', ['pilote'], 'Réception technique', false, null],
  // Pyrotechnie.
  ['PY-01', 'Marché ou bon de commande artificier', 'pyrotechnie', 'T-120', -120, 1, 'ref_logistique', 'ref_logistique', 'chef_service', ['pilote'], 'Commande notifiée', true, 100],
  ['PY-02', 'Déclaration du spectacle pyrotechnique en préfecture', 'pyrotechnie', 'T-30', -30, 1, 'ref_securite', 'ref_securite', 'chef_service', ['pilote'], 'Récépissé de déclaration', true, 30],
  ['PY-03', 'Périmètre de sécurité et plan de tir', 'pyrotechnie', 'T-30', -30, 1, 'ref_securite', 'prestataire', 'chef_service', ['regisseur'], 'Plan de tir', true, 21],
  ['PY-04', 'Information du SDIS', 'pyrotechnie', 'T-30', -21, 1, 'ref_securite', 'ref_securite', '', ['pilote'], 'Courrier SDIS', false, null],
  // Nautique.
  ['NA-01', 'Autorisation portuaire (capitainerie)', 'nautique', 'T-90', -90, 1, 'ref_securite', 'ref_securite', 'chef_service', ['pilote'], 'Autorisation portuaire', true, 60],
  ['NA-02', 'Avis des affaires maritimes', 'nautique', 'T-60', -60, 2, 'ref_securite', 'ref_securite', '', ['pilote'], 'Avis', true, 45],
  ['NA-03', 'Dispositif de sécurité nautique', 'nautique', 'T-30', -30, 1, 'ref_securite', 'ref_securite', 'chef_service', ['regisseur'], 'Dispositif nautique', true, 30],
  // Restauration et buvette.
  ['RB-01', 'Autorisation temporaire de débit de boissons', 'restauration', 'T-30', -30, 1, 'ref_logistique', 'ref_logistique', '', ['pilote'], 'Autorisation de débit', true, 15],
  ['RB-02', 'Liste des exposants alimentaires', 'restauration', 'T-30', -30, 2, 'ref_animation', 'ref_animation', 'pilote', [], 'Liste des exposants', false, null],
  ['RB-03', "Règles d'hygiène et contrôle des stands", 'restauration', 'T-7', -10, 2, 'ref_logistique', 'ref_logistique', '', ['regisseur'], 'Fiche hygiène', false, null],
];

export const REFERENTIEL_DEFAUT: Referentiel = {
  jalons: [
    { code: 'T-180', libelle: 'Cadrage', offset: -180, question: 'Sait-on quoi, où, pour qui, avec quel budget ?', livrable: 'Fiche de demande validée, niveau calculé, pilote désigné' },
    { code: 'T-120', libelle: 'Conception', offset: -120, question: 'Le programme est-il arrêté ?', livrable: 'Programme, budget détaillé, besoins prestataires' },
    { code: 'T-90', libelle: 'Engagement', offset: -90, question: 'Les commandes et dossiers sont-ils partis ?', livrable: 'Bons de commande, consultations lancées, dossiers réglementaires déposés' },
    { code: 'T-60', libelle: 'Calage', offset: -60, question: 'Tout le monde travaille-t-il sur le même plan ?', livrable: "Plan d'implantation figé, 1re réunion inter-branches" },
    { code: 'T-30', libelle: 'Verrouillage', offset: -30, question: 'La sécurité est-elle validée ?', livrable: 'Avis sécurité, plan de com lancé, planning de montage' },
    { code: 'T-7', libelle: 'Briefing', offset: -7, question: 'Chaque agent sait-il où il est et quand ?', livrable: 'Fiches de poste, conducteur, annuaire jour J' },
    { code: 'J+7', libelle: 'Bilan', offset: 7, question: "Qu'a-t-on appris ?", livrable: 'Bilan chiffré, points à reconduire ou corriger' },
  ],
  roles: [
    { code: 'pilote', libelle: 'Pilote', mission: "Porte l'événement de bout en bout, tient le rétroplanning, anime les jalons", niveauMin: 1 },
    { code: 'demandeur', libelle: 'Demandeur', mission: "Fixe l'intention, valide programme et budget", niveauMin: 1 },
    { code: 'chef_service', libelle: 'Chef de service', mission: 'Arbitre, valide les jalons sensibles', niveauMin: 1 },
    { code: 'direction', libelle: 'Direction générale', mission: 'Valide les jalons des événements majeurs', niveauMin: 4 },
    { code: 'ref_securite', libelle: 'Référent sécurité', mission: 'Instruit le volet sécurité, lien avec police municipale, SDIS, préfecture', niveauMin: 2 },
    { code: 'regisseur', libelle: 'Régisseur jour J', mission: "Commande l'exploitation le jour même", niveauMin: 3 },
    { code: 'ref_logistique', libelle: 'Référent logistique', mission: 'Porte les tâches de la branche logistique', niveauMin: 1 },
    { code: 'ref_animation', libelle: 'Référent animation', mission: 'Porte les tâches de la branche animation', niveauMin: 1 },
    { code: 'ref_protocole', libelle: 'Référent protocole', mission: 'Porte les tâches de la branche protocole', niveauMin: 1 },
    { code: 'ref_affichage', libelle: 'Référent affichage', mission: "Porte les tâches de la branche affichage", niveauMin: 1 },
    { code: 'ref_kiosc', libelle: 'Référent KIOSC (communication)', mission: 'Porte les tâches de communication', niveauMin: 1 },
    { code: 'ref_vsl', libelle: 'Référent VSL', mission: 'Porte les tâches de la branche VSL', niveauMin: 1 },
    { code: 'prestataire', libelle: 'Prestataires', mission: 'Exécutent selon commande', niveauMin: 1 },
  ],
  seuilsJauge: [300, 1500, 5000],
  niveaux: [
    {
      niveau: 1,
      libelle: 'Proximité',
      exemples: 'Vernissage, réception en mairie de quartier',
      jalons: [
        { code: 'T-180', valideur: 'chef_service' },
        { code: 'T-30', valideur: 'pilote' },
        { code: 'J+7', valideur: 'pilote' },
      ],
    },
    {
      niveau: 2,
      libelle: 'Ville',
      exemples: 'Fête de quartier, cérémonie patriotique',
      jalons: [
        { code: 'T-180', valideur: 'chef_service' },
        { code: 'T-90', valideur: 'pilote' },
        { code: 'T-30', valideur: 'chef_service' },
        { code: 'J+7', valideur: 'pilote' },
      ],
    },
    {
      niveau: 3,
      libelle: 'Grand public',
      exemples: 'Concert en plein air, marché festif',
      jalons: [
        { code: 'T-180', valideur: 'chef_service' },
        { code: 'T-90', valideur: 'chef_service' },
        { code: 'T-60', valideur: 'pilote' },
        { code: 'T-30', valideur: 'chef_service' },
        { code: 'T-7', valideur: 'pilote' },
        { code: 'J+7', valideur: 'chef_service' },
      ],
    },
    {
      niveau: 4,
      libelle: 'Majeur',
      exemples: 'Dunkerque Fête la Mer',
      jalons: [
        { code: 'T-180', valideur: 'direction' },
        { code: 'T-120', valideur: 'chef_service' },
        { code: 'T-90', valideur: 'direction' },
        { code: 'T-60', valideur: 'chef_service' },
        { code: 'T-30', valideur: 'direction' },
        { code: 'T-7', valideur: 'chef_service' },
        { code: 'J+7', valideur: 'direction' },
      ],
    },
  ],
  criteres: [
    { code: 'elus', libelle: "Présence d'élus ou d'officiels", modules: ['protocole'], majoration: false, niveauMax: false },
    { code: 'elu_national', libelle: "Présence d'un élu de rang national ou d'un préfet", modules: ['protocole'], majoration: true, niveauMax: false },
    { code: 'espace_public', libelle: "Occupation de l'espace public", modules: ['voie_publique'], majoration: false, niveauMax: false },
    { code: 'fermeture_circulation', libelle: 'Fermeture de circulation', modules: ['voie_publique'], majoration: true, niveauMax: false },
    { code: 'scene', libelle: 'Concert ou spectacle', modules: ['scene_son'], majoration: false, niveauMax: false },
    { code: 'pyrotechnie', libelle: "Feu d'artifice", modules: ['pyrotechnie'], majoration: true, niveauMax: false },
    { code: 'nautique', libelle: "Activité sur l'eau", modules: ['nautique'], majoration: true, niveauMax: false },
    { code: 'restauration', libelle: 'Restauration ou dégustation', modules: ['restauration'], majoration: false, niveauMax: false },
    { code: 'alcool', libelle: "Vente d'alcool", modules: ['restauration'], majoration: true, niveauMax: false },
    { code: 'montage_long', libelle: "Montage sur plus d'une journée", modules: [], majoration: true, niveauMax: false },
    { code: 'marche_public', libelle: "Recours à un marché public", modules: [], majoration: true, niveauMax: false },
    { code: 'multi_sites', libelle: 'Événement multi-sites', modules: [], majoration: false, niveauMax: true },
  ],
  modules: [
    { code: 'socle', libelle: 'Socle', activation: 'Toujours', nonRetourJours: null },
    { code: 'protocole', libelle: 'Protocole', activation: "Présence d'élus ou d'officiels", nonRetourJours: null },
    { code: 'voie_publique', libelle: 'Voie publique', activation: "Occupation de l'espace public", nonRetourJours: null },
    { code: 'scene_son', libelle: 'Scène et son', activation: 'Concert, spectacle', nonRetourJours: null },
    { code: 'pyrotechnie', libelle: 'Pyrotechnie', activation: "Feu d'artifice", nonRetourJours: 100 },
    { code: 'nautique', libelle: 'Nautique', activation: "Activité sur l'eau", nonRetourJours: null },
    { code: 'restauration', libelle: 'Restauration et buvette', activation: 'Vente ou dégustation', nonRetourJours: null },
  ],
  taches: TACHES.map(([code, libelle, module, jalon, offset, niveauMin, porte, fait, valide, informe, livrable, bloquante, incompressibleJours]) => ({
    code,
    libelle,
    module,
    jalon,
    offset,
    niveauMin,
    porte,
    fait,
    valide,
    informe,
    livrable,
    bloquante,
    incompressibleJours,
  })),
  budgetPostes: [
    'Prestations techniques',
    'Sécurité et secours',
    'Communication et impression',
    'Artistes et animation',
    'Réception et protocole',
    'Location de matériel',
  ],
};
