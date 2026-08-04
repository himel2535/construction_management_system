import { z } from "zod";

const isBrowser = typeof window !== 'undefined';
const isProd = process.env.NODE_ENV === 'production';
const API_BASE_URL = isProd 
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'https://constructionmanagementsystembackend-production.up.railway.app/api')
  : 'http://localhost:4000/api';

export async function fetchApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}/${endpoint.replace(/^\//, '')}`;
  try {
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
    return (text ? JSON.parse(text) : null) as T;
  } catch (error) {
    console.warn(`[apiClient] Error reaching ${url}:`, error);
    throw error;
  }
}

export async function fetchApiWithSchema<T>(
  endpoint: string,
  schema: z.ZodSchema<T>,
  options: RequestInit = {}
): Promise<T> {
  const rawData = await fetchApi(endpoint, options);
  const result = schema.safeParse(rawData);
  if (!result.success) {
    console.warn(`[apiClient] Schema validation warning for ${endpoint}:`, result.error.format());
    // Return rawData casted as fallback if schema validation soft-fails
    return rawData as T;
  }
  return result.data;
}

export const api = {
  get: <T = any>(collection: string, id: string) => fetchApi<T>(`${collection}/${id}`),
  getList: <T = any[]>(collection: string) => fetchApi<T>(collection).then(res => Array.isArray(res) ? res : (res ? Object.values(res) : [])),
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
