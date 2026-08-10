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

export async function loginWithEmail(email, password = 'password') {
  const result = await fetchApi('auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (result.access_token) {
    setToken(result.access_token);
    setCurrentUser(result.user);
    return result.user;
  }
  throw new Error('Login failed');
}

function decodeJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export async function checkSession() {
  const token = getToken();
  if (token) {
    try {
      let user = await fetchApi('auth/me');
      if (!user) {
        const payload = decodeJwt(token);
        if (payload) {
          user = {
            id: payload.sub,
            email: payload.email,
            role: payload.role,
            name: payload.displayName || payload.name || payload.email.split('@')[0],
            tenantId: payload.tenantId,
          };
        }
      }
      setCurrentUser(user);
      return user;
    } catch (e) {
      const payload = decodeJwt(token);
      if (payload) {
        const user = {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
          name: payload.displayName || payload.name || payload.email.split('@')[0],
          tenantId: payload.tenantId,
        };
        setCurrentUser(user);
        return user;
      }
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
