import { useAuth } from '../auth/useAuth';
import { useHealthAutoSync } from './useHealthAutoSync';

/** Renders nothing; keeps Health Connect data fresh in the Android app. */
export function HealthAutoSync() {
  const { profile } = useAuth();
  useHealthAutoSync(profile);
  return null;
}
