/** Current session user (set after /auth/me or login). */
import { fetchApi } from './lib/apiClient.ts';

let currentUser = null;

export function setToken(token) {
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('jwt_token', token);
    else localStorage.removeItem('jwt_token');
  }
}

export function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;
}

export function setCurrentUser(user) {
  currentUser = user;
}

export async function loginWithEmail(email) {
  const result = await fetchApi('auth/login', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  if (result.access_token) {
    setToken(result.access_token);
    setCurrentUser(result.user);
    return result.user;
  }
  throw new Error('Login failed');
}

export async function checkSession() {
  const token = getToken();
  if (token) {
    try {
      const user = await fetchApi('auth/me');
      setCurrentUser(user);
      return user;
    } catch (e) {
      setToken(null);
      setCurrentUser(null);
    }
  }
  return null;
}

export function logout() {
  setToken(null);
  setCurrentUser(null);
}

export function getCurrentUser() {
  return currentUser;
}

export function getCurrentUserId() {
  return currentUser?.id ?? "unknown";
}

export function getCurrentUserName() {
  return currentUser?.name ?? currentUser?.displayName ?? currentUser?.email ?? "User";
}

export function getCurrentUserEmail() {
  return currentUser?.email ?? "";
}
