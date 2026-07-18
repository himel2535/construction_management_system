/** Login disabled — demo mode uses Firebase RTDB without auth. */
export function mountLogin(container, onSuccess) {
  if (typeof onSuccess === "function") onSuccess();
  return { unmount: () => {} };
}
