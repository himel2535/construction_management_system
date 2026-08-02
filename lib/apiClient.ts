const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000/api';

export async function fetchApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}/${endpoint.replace(/^\//, '')}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error [${response.status}]: ${errorText}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  get: <T = any>(collection: string, id: string) => fetchApi<T>(`${collection}/${id}`),
  getList: <T = any[]>(collection: string) => fetchApi<T>(collection),
  create: <T = any>(collection: string, data: any) =>
    fetchApi<T>(collection, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: <T = any>(collection: string, id: string, data: any) =>
    fetchApi<T>(`${collection}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: <T = any>(collection: string, id: string) =>
    fetchApi<T>(`${collection}/${id}`, {
      method: 'DELETE',
    }),
};
