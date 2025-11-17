import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function Unauthorized() {
  const navigate = useNavigate();

  useEffect(() => {
    // Automatically redirect to dashboard on mount
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  // Return null since we're redirecting immediately
  return null;
}
