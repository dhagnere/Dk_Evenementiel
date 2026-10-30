import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { RequireAdmin } from './components/RequireAdmin';
import Login from './pages/Login';
import Calendrier from './pages/Calendrier';
import Liste from './pages/Liste';
import Carte from './pages/Carte';
import Conflits from './pages/Conflits';
import FicheRenseignement from './pages/FicheRenseignement';
import Comptes from './pages/Comptes';
import Demandes from './pages/Demandes';
import Sauvegardes from './pages/Sauvegardes';
import Doublons from './pages/Doublons';
import Journal from './pages/Journal';

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<Login />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Calendrier />} />
        <Route path="/liste" element={<Liste />} />
        <Route path="/carte" element={<Carte />} />
        <Route path="/conflits" element={<Conflits />} />
        <Route path="/fiche-renseignement" element={<FicheRenseignement />} />
        <Route element={<RequireAdmin />}>
          <Route path="/comptes" element={<Comptes />} />
          <Route path="/demandes" element={<Demandes />} />
          <Route path="/sauvegardes" element={<Sauvegardes />} />
          <Route path="/doublons" element={<Doublons />} />
          <Route path="/journal" element={<Journal />} />
        </Route>
      </Route>
    </Routes>
  );
}
