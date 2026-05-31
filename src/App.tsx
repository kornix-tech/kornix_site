import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthGuard } from './features/auth/AuthGuard';
import { LoginPage } from './features/auth/LoginPage';
import { WorkspacePage } from './workspace/WorkspacePage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/map"
        element={
          <AuthGuard>
            <WorkspacePage />
          </AuthGuard>
        }
      />
      <Route
        path="/water-regime"
        element={
          <AuthGuard>
            <WorkspacePage />
          </AuthGuard>
        }
      />
      <Route
        path="/irrigation"
        element={
          <AuthGuard>
            <WorkspacePage />
          </AuthGuard>
        }
      />
      <Route
        path="/workspace"
        element={
          <AuthGuard>
            <WorkspacePage />
          </AuthGuard>
        }
      />
      <Route path="*" element={<Navigate to="/map" replace />} />
    </Routes>
  );
}
