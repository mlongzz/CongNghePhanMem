import { Redirect } from 'expo-router';
import { useApp } from '../src/context/AppContext';
import Dashboard from '../src/admin/Dashboard';
export default function Admin() {
  const { token, isAdmin } = useApp();
  if (!token || !isAdmin) return <Redirect href="/" />;
  return <Dashboard />;
}
