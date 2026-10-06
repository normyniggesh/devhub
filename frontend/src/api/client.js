const BASE_URL = (
  import.meta.env.VITE_API_URL ||
  'http://localhost:3001/api'
).replace(/\/$/, '');

/**
 * Universal DEVHUB API Client for Express REST API backend.
 */
export const apiClient = async (endpoint, { body, method, ...customConfig } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  const httpMethod = method || customConfig.method || (body ? 'POST' : 'GET');
  
  // Normalize endpoint: ensure leading slash, prevent duplicate /api prefix
  const cleanEndpoint = endpoint.startsWith('/api/')
    ? endpoint.replace(/^\/api/, '')
    : (endpoint.startsWith('/') ? endpoint : `/${endpoint}`);

  const config = {
    ...customConfig,
    method: httpMethod,
    headers: {
      ...headers,
      ...customConfig.headers,
    },
    credentials: 'include',
  };

  if (body) {
    if (body instanceof FormData) {
      config.body = body;
      delete config.headers['Content-Type'];
    } else if (typeof body === 'string') {
      config.body = body;
    } else {
      config.body = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${cleanEndpoint}`, config);
  } catch (error) {
    console.error('Network request failed:', error);
    throw new Error('Network error. Please try again.');
  }

  if (response.ok) {
    const data = await response.json();
    return data;
  }

  let errMessage = 'An error occurred';
  let errData = {};
  try {
    errData = await response.json();
    errMessage = errData.error || errData.message || errMessage;
  } catch (e) {}

  const error = new Error(errMessage);
  error.status = response.status;
  error.data = errData;
  throw error;
};
