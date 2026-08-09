import { z } from "zod";

const isBrowser = typeof window !== 'undefined';
const isProd = process.env.NODE_ENV === 'production';
const API_BASE_URL = isProd 
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'https://constructionmanagementsystembackend-production.up.railway.app/api')
  : 'http://localhost:4000/api';

const inFlightGetRequests = new Map<string, Promise<any>>();

export async function fetchApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}/${endpoint.replace(/^\//, '')}`;
  const method = (options.method || 'GET').toUpperCase();

  if (method === 'GET' && inFlightGetRequests.has(url)) {
    return inFlightGetRequests.get(url) as Promise<T>;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event("api-request-start"));
  }
  
  const reqPromise = (async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        ...options,
        headers,
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
    } finally {
      if (method === 'GET') {
        inFlightGetRequests.delete(url);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event("api-request-end"));
      }
    }
  })();

  if (method === 'GET') {
    inFlightGetRequests.set(url, reqPromise);
  }

  return reqPromise;
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
  getList: <T = any[]>(collection: string, params?: Record<string, any>) => {
    let query = "";
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) qs.append(k, String(v));
      }
      const str = qs.toString();
      if (str) query = `?${str}`;
    }
    return fetchApi<any>(`${collection}${query}`).then(res => {
      if (Array.isArray(res)) return res as T;
      if (res && typeof res === 'object') {
        return Object.entries(res).map(([key, value]: [string, any]) => {
          if (value && typeof value === 'object' && !value.id) {
            return { id: key, ...value };
          }
          return value;
        }) as unknown as T;
      }
      return [] as unknown as T;
    });
  },
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
  remove: <T = any>(collection: string, id: string) =>
    fetchApi<T>(`${collection}/${id}`, {
      method: 'DELETE',
    }),
};
