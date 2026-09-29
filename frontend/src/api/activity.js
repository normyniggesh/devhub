import { apiClient } from './client';

export const fetchActivity = async (options = {}) => {
  const params = new URLSearchParams();
  if (options.entityType) params.append('entityType', options.entityType);
  if (options.entityId) params.append('entityId', options.entityId);
  if (options.limit) params.append('limit', options.limit);
  if (options.all) params.append('all', options.all);

  const query = params.toString() ? `?${params.toString()}` : '';
  const data = await apiClient(`/activity${query}`);
  return data.activity || [];
};
