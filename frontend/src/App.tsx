import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CloudProvider } from './context/CloudContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Planning from './pages/Planning';
import Costs from './pages/Costs';
import Infrastructure from './pages/Infrastructure';
import Security from './pages/Security';
import Network from './pages/Network';
import Services from './pages/Services';
import Operations from './pages/Operations';
import { BackendProvider, useBackend } from './context/BackendContext';

function ProjectCloud({ children }: { children: React.ReactNode }) {
  const { projectId, mode } = useBackend();
  return <CloudProvider key={`${mode}:${projectId}`}>{children}</CloudProvider>;
}

export default function App() {
  return (
    <ThemeProvider>
      <BackendProvider>
      <ProjectCloud>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/planning" element={<Planning />} />
              <Route path="/costs" element={<Costs />} />
              <Route path="/infrastructure" element={<Infrastructure />} />
              <Route path="/security" element={<Security />} />
              <Route path="/network" element={<Network />} />
              <Route path="/services" element={<Services />} />
              <Route path="/operations" element={<Operations />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ProjectCloud>
      </BackendProvider>
    </ThemeProvider>
  );
}
