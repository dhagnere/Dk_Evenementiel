import type { ReactNode } from 'react';
import {
  AppstoreOutlined,
  BookOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  MobileOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ApartmentOutlined,
  CalendarOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  GiftOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SolutionOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserAddOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { Niveau } from '../types';

export interface PageNavigation {
  chemin: string;
  libelle: string;
  icone: ReactNode;
  /** Niveau requis sur le module de la section (absent : lecture). */
  niveau?: Niveau;
}

export interface SectionNavigation {
  /** Code du module, ou 'admin' pour l'administration générale réservée aux super-administrateurs. */
  code: string;
  libelle: string;
  icone: ReactNode;
  racine: string;
  pages: PageNavigation[];
}

/** Pages de chaque module livré. Un module sans pages ici apparaît « bientôt disponible ». */
export const SECTIONS: SectionNavigation[] = [
  {
    code: 'calendrier',
    libelle: 'Calendrier',
    icone: <CalendarOutlined />,
    racine: '/calendrier',
    pages: [
      { chemin: '/calendrier', libelle: 'Calendrier', icone: <CalendarOutlined /> },
      { chemin: '/calendrier/liste', libelle: 'Liste', icone: <UnorderedListOutlined /> },
      { chemin: '/calendrier/carte', libelle: 'Carte', icone: <EnvironmentOutlined /> },
      { chemin: '/calendrier/conflits', libelle: 'Conflits', icone: <WarningOutlined /> },
      {
        chemin: '/calendrier/fiche-renseignement',
        libelle: 'Fiche de renseignement',
        icone: <SolutionOutlined />,
        niveau: 'contribution',
      },
      { chemin: '/calendrier/doublons', libelle: 'Doublons', icone: <CopyOutlined />, niveau: 'administration' },
    ],
  },
  {
    code: 'stock',
    libelle: 'Stock & Protocole',
    icone: <GiftOutlined />,
    racine: '/stock',
    pages: [
      { chemin: '/stock', libelle: 'Tableau de bord', icone: <DashboardOutlined /> },
      { chemin: '/stock/catalogue', libelle: 'Catalogue', icone: <AppstoreOutlined /> },
      { chemin: '/stock/demandes', libelle: 'Demandes', icone: <ShoppingCartOutlined />, niveau: 'contribution' },
      { chemin: '/stock/mon-depot', libelle: 'Mon stock déporté', icone: <MobileOutlined />, niveau: 'contribution' },
      { chemin: '/stock/validations', libelle: 'Validations', icone: <CheckCircleOutlined />, niveau: 'validation' },
      { chemin: '/stock/registre', libelle: 'Registre protocolaire', icone: <BookOutlined />, niveau: 'validation' },
      { chemin: '/stock/entrees', libelle: 'Entrées & ajustements', icone: <InboxOutlined />, niveau: 'administration' },
      { chemin: '/stock/deportes', libelle: 'Stocks déportés', icone: <ShopOutlined />, niveau: 'administration' },
      { chemin: '/stock/parametres', libelle: 'Paramètres', icone: <SettingOutlined />, niveau: 'administration' },
    ],
  },
  {
    code: 'admin',
    libelle: 'Administration',
    icone: <SettingOutlined />,
    racine: '/admin/comptes',
    pages: [
      { chemin: '/admin/comptes', libelle: 'Comptes et droits', icone: <TeamOutlined /> },
      { chemin: '/admin/demandes', libelle: "Demandes d'accès", icone: <UserAddOutlined /> },
      { chemin: '/admin/directions', libelle: 'Directions', icone: <ApartmentOutlined /> },
      { chemin: '/admin/sauvegardes', libelle: 'Sauvegardes', icone: <CloudUploadOutlined /> },
      { chemin: '/admin/journal', libelle: 'Journal', icone: <FileTextOutlined /> },
      { chemin: '/admin/rgpd', libelle: 'RGPD', icone: <SafetyCertificateOutlined /> },
      { chemin: '/admin/systeme', libelle: 'Système', icone: <DashboardOutlined /> },
    ],
  },
];

/** Icône de chaque module sur l'accueil, y compris ceux qui ne sont pas encore livrés. */
export const ICONES_MODULES: Record<string, ReactNode> = {
  calendrier: <CalendarOutlined />,
  stock: <GiftOutlined />,
  projets: <ProjectOutlined />,
};
export const ICONE_MODULE_PAR_DEFAUT = <AppstoreOutlined />;

/** Section à laquelle appartient un chemin. */
export function sectionDuChemin(chemin: string): SectionNavigation | undefined {
  return SECTIONS.find((s) => chemin === s.racine || s.pages.some((p) => chemin === p.chemin || chemin.startsWith(`${p.chemin}/`)));
}

/** Anciennes adresses de Dk_Calendar, redirigées vers les nouvelles (favoris, liens dans les courriels). */
export const ANCIENNES_ADRESSES: Record<string, string> = {
  '/liste': '/calendrier/liste',
  '/carte': '/calendrier/carte',
  '/conflits': '/calendrier/conflits',
  '/fiche-renseignement': '/calendrier/fiche-renseignement',
  '/doublons': '/calendrier/doublons',
  '/comptes': '/admin/comptes',
  '/demandes': '/admin/demandes',
  '/sauvegardes': '/admin/sauvegardes',
  '/journal': '/admin/journal',
};
