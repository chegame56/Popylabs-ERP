// Simple cn utility (no external deps needed)
export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

// Alias so existing imports using cnSimple as cn continue to work
export const cnSimple = cn;
