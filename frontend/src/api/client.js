const BASE_URL = (
  import.meta.env.VITE_API_URL ||
  'http://localhost:3001/api'
).replace(/\/$/, '');

export const apiClient = async (endpoint, { body, ...customConfig } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  
  const config = {
    method: body ? 'POST' : 'GET',
    ...customConfig,
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
    } else {
      config.body = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, config);
  } catch (error) {
    throw new Error('Network error. Please try again.');
  }

  if (response.ok) {
    const data = await response.json();
    return data;
  }

  let errMessage = 'An error occurred';
  try {
    const errData = await response.json();
    errMessage = errData.error || errMessage;
  } catch (e) {
    // Parsing error body failed
  }

  const error = new Error(errMessage);
  error.status = response.status;
  throw error;
};
