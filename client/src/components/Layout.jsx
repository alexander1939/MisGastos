import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      <Navbar />
      <main className="flex-1 p-6 overflow-auto min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
