import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { RequireModule, RequireSuperAdmin } from './components/RequireAcces';
import { ANCIENNES_ADRESSES } from './lib/navigation';
import Login from './pages/Login';
import Accueil from './pages/Accueil';
import Calendrier from './pages/Calendrier';
import Liste from './pages/Liste';
import Carte from './pages/Carte';
import Conflits from './pages/Conflits';
import FicheRenseignement from './pages/FicheRenseignement';
import Comptes from './pages/Comptes';
import Demandes from './pages/Demandes';
import Directions from './pages/Directions';
import Sauvegardes from './pages/Sauvegardes';
import Doublons from './pages/Doublons';
import Journal from './pages/Journal';
import Rgpd from './pages/Rgpd';
import Systeme from './pages/Systeme';
import TableauDeBordStock from './pages/stock/TableauDeBordStock';
import Catalogue from './pages/stock/Catalogue';
import DemandesStock from './pages/stock/Demandes';
import MonDepot from './pages/stock/MonDepot';
import Validations from './pages/stock/Validations';
import Registre from './pages/stock/Registre';
import Entrees from './pages/stock/Entrees';
import Deportes from './pages/stock/Deportes';
import ParametresStock from './pages/stock/ParametresStock';

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<Login />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Accueil />} />

        <Route element={<RequireModule module="calendrier" niveau="lecture" />}>
          <Route path="/calendrier" element={<Calendrier />} />
          <Route path="/calendrier/liste" element={<Liste />} />
          <Route path="/calendrier/carte" element={<Carte />} />
          <Route path="/calendrier/conflits" element={<Conflits />} />
        </Route>
        <Route element={<RequireModule module="calendrier" niveau="contribution" />}>
          <Route path="/calendrier/fiche-renseignement" element={<FicheRenseignement />} />
        </Route>
        <Route element={<RequireModule module="calendrier" niveau="administration" />}>
          <Route path="/calendrier/doublons" element={<Doublons />} />
        </Route>

        <Route element={<RequireModule module="stock" niveau="lecture" />}>
          <Route path="/stock" element={<TableauDeBordStock />} />
          <Route path="/stock/catalogue" element={<Catalogue />} />
        </Route>
        <Route element={<RequireModule module="stock" niveau="contribution" />}>
          <Route path="/stock/demandes" element={<DemandesStock />} />
          <Route path="/stock/mon-depot" element={<MonDepot />} />
        </Route>
        <Route element={<RequireModule module="stock" niveau="validation" />}>
          <Route path="/stock/validations" element={<Validations />} />
          <Route path="/stock/registre" element={<Registre />} />
        </Route>
        <Route element={<RequireModule module="stock" niveau="administration" />}>
          <Route path="/stock/entrees" element={<Entrees />} />
          <Route path="/stock/deportes" element={<Deportes />} />
          <Route path="/stock/parametres" element={<ParametresStock />} />
        </Route>

        <Route element={<RequireSuperAdmin />}>
          <Route path="/admin/comptes" element={<Comptes />} />
          <Route path="/admin/demandes" element={<Demandes />} />
          <Route path="/admin/directions" element={<Directions />} />
          <Route path="/admin/sauvegardes" element={<Sauvegardes />} />
          <Route path="/admin/journal" element={<Journal />} />
          <Route path="/admin/rgpd" element={<Rgpd />} />
          <Route path="/admin/systeme" element={<Systeme />} />
        </Route>

        {Object.entries(ANCIENNES_ADRESSES).map(([ancienne, nouvelle]) => (
          <Route key={ancienne} path={ancienne} element={<Navigate to={nouvelle} replace />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
