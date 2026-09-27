import { useState, useEffect, useCallback } from 'react';
import { fetchActivity } from '../api/activity';

export function useActivity(options = {}) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { entityType, entityId, limit, initialLoad = true } = options;

  const loadActivity = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchActivity({ entityType, entityId, limit });
      setActivity(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch activity');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, limit]);

  useEffect(() => {
    if (initialLoad) {
      loadActivity();
    }
  }, [loadActivity, initialLoad]);

  return { activity, loading, error, refetch: loadActivity };
}
