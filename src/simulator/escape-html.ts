const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for safe interpolation into HTML content or quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}
