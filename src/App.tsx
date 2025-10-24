import { BrowserRouter as Router } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './components/auth/AuthProvider';
import { AppRoutes } from './routes';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
// Removed custom PWAInstallPrompt to keep only the native small prompt
import { useEffect } from 'react';

// Configure future flags for React Router v7
const router = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }
};

function App() {
  // Security protections disabled for development
  // useEffect(() => {
  //   // All security measures commented out
  // }, []);

  return (
    <Router future={router.future}>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50">
          <AppRoutes />
          <Toaster
            position={window.innerWidth < 640 ? 'bottom-center' : 'top-right'}
            toastOptions={{
              className: 'fixed left-0 right-0 bottom-4 w-full max-w-full rounded-xl shadow-lg text-center break-all whitespace-pre-line text-sm sm:text-base px-2 py-3 sm:px-6 sm:py-4 z-[9999] mx-0',
              style: {
                background: '#222',
                color: '#fff',
                fontSize: window.innerWidth < 640 ? '1rem' : '1.05rem',
                borderRadius: '1rem',
                boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              },
              duration: 4000,
            }}
          />
          <PWAInstallPrompt />
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
