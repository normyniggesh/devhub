import { apiClient } from './client';

export const fetchActivity = async (options = {}) => {
  const { entityType, entityId, limit } = options;
  const params = new URLSearchParams();
  if (entityType) params.append('entityType', entityType);
  if (entityId) params.append('entityId', entityId);
  if (limit) params.append('limit', limit);
  
  const query = params.toString();
  const endpoint = query ? `/activity?${query}` : '/activity';
  
  const data = await apiClient(endpoint);
  return data.activity || [];
};
