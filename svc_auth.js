/** Current session user (set after /auth/me or login). */

let currentUser = null;

export function setCurrentUser(user) {
  currentUser = user;
}

export function getCurrentUser() {
  return currentUser;
}

export function getCurrentUserId() {
  return currentUser?.id ?? "unknown";
}

export function getCurrentUserName() {
  return currentUser?.name ?? currentUser?.email ?? "User";
}

export function getCurrentUserEmail() {
  return currentUser?.email ?? "";
}
