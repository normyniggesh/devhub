import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore } from './store';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Activity2 from './pages/Activity2';
import Project from './pages/Project';
import ProjectDetail from './pages/ProjectDetail';
import Tasks from './pages/Tasks';
import QAtesting from './pages/QAtesting';
import Calender from './pages/Calender';
import Files from './pages/Files';
import Github from './pages/Github';
import Team from './pages/Team';
import PullRequests from './pages/PullRequests';
import Deployments from './pages/Deployments';
import Login from './pages/Login';
import Register from './pages/Register';
import { ThemeProvider } from './context/ThemeContext';

const GoogleCallbackRedirect = () => {
  const location = useLocation();
  return <Navigate to={`/files${location.search}`} replace />;
};

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, authLoading } = useStore();
  
  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  
  return children;
};

const AuthRoute = ({ children }) => {
  const { isAuthenticated, authLoading } = useStore();
  
  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;
  if (isAuthenticated) return <Navigate to="/" replace />;
  
  return children;
};

function App() {
  const checkAuth = useStore((state) => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/login" element={
            <AuthRoute>
              <Login />
            </AuthRoute>
          } />
          <Route path="/register" element={
            <AuthRoute>
              <Register />
            </AuthRoute>
          } />
          
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="activity" element={<Activity2 />} />
            <Route path="projects" element={<Project />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="qa" element={<QAtesting />} />
            <Route path="calendar" element={<Calender />} />
            <Route path="files" element={<Files />} />
            <Route path="integrations/google/callback" element={<GoogleCallbackRedirect />} />
            <Route path="github" element={<Github />} />
            <Route path="pull-requests" element={<PullRequests />} />
            <Route path="deployments" element={<Deployments />} />
            <Route path="team" element={<Team />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
