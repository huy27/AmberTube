import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Opens Focus mode and remembers where to come back to. */
export function useOpenFocus(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => navigate('/focus', { state: { from: location.pathname + location.search } }), [navigate, location.pathname, location.search]);
}
