export function getAbsoluteBase(): string {
  // If Vite gives us an absolute base (starts with "/"), use it.
  const b = import.meta.env.BASE_URL;
  if (b && b !== './') return b; // e.g. "/DartClient/"

  // Otherwise we're on a relative base ("./"): derive from current path.
  // On GH Pages, pathname is "/<repo>/..."; in dev it's just "/".
  const first = location.pathname.split('/').filter(Boolean)[0] || '';
  return first ? `/${first}/` : '/';
}