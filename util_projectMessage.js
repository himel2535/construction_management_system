export const MESSAGE_PATHS = {
  messages: (projectId) => `projectMessages/${projectId}`,
};

export function validateMessageBody(body) {
  const text = String(body || "").trim();
  if (!text) throw new Error("Message cannot be empty");
  if (text.length > 4000) throw new Error("Message is too long (max 4000 characters)");
  return text;
}
