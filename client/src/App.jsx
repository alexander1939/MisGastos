import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Cards from './pages/Cards';
import Purchases from './pages/Purchases';
import Archive from './pages/Archive';
import Budgets from './pages/Budgets';
import Calendar from './pages/Calendar';
import Transfers from './pages/Transfers';
import Profile from './pages/Profile';
import Datos from './pages/Datos';

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="cards" element={<Cards />} />
          <Route path="purchases" element={<Purchases />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="archive" element={<Archive />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="transfers" element={<Transfers />} />
          <Route path="profile" element={<Profile />} />
          <Route path="datos" element={<Datos />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
