// Shared client-side validation used by the auth + reset-password screens.

// Rigorous email check: exactly one @, ASCII-only domain labels (rejects
// Unicode/homograph domains like Cyrillic "а"), no consecutive/leading/trailing
// dots, valid hyphen placement, length limits, and an alphabetic 2+ char TLD.
const LOCAL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const LABEL_RE = /^[a-zA-Z0-9-]+$/;

export const isValidEmail = (email: string): boolean => {
  const e = email.trim();
  if (!e || e.length > 254 || e.includes("..") || e.includes(" ")) return false;

  const at = e.indexOf("@");
  if (at <= 0 || at !== e.lastIndexOf("@")) return false;

  const local = e.slice(0, at);
  const domain = e.slice(at + 1);

  if (local.length > 64 || local.startsWith(".") || local.endsWith(".")) return false;
  if (!LOCAL_RE.test(local)) return false;

  if (domain.length > 253) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (!LABEL_RE.test(label)) return false; // ASCII-only → rejects homograph domains
    if (label.startsWith("-") || label.endsWith("-")) return false;
  }
  return /^[a-zA-Z]{2,}$/.test(labels[labels.length - 1]);
};

export type PasswordChecks = {
  length: boolean;
  upper: boolean;
  lower: boolean;
  digit: boolean;
  special: boolean;
};

export const getPasswordChecks = (pw: string): PasswordChecks => ({
  length: pw.length >= 8,
  upper: /[A-Z]/.test(pw),
  lower: /[a-z]/.test(pw),
  digit: /\d/.test(pw),
  special: /[^A-Za-z0-9]/.test(pw),
});

export const isStrongPassword = (pw: string): boolean =>
  Object.values(getPasswordChecks(pw)).every(Boolean);

// The labelled requirement list, ordered for display.
export const passwordRequirements = (pw: string): { ok: boolean; label: string }[] => {
  const c = getPasswordChecks(pw);
  return [
    { ok: c.length, label: "At least 8 characters" },
    { ok: c.upper, label: "One uppercase letter" },
    { ok: c.lower, label: "One lowercase letter" },
    { ok: c.digit, label: "One number" },
    { ok: c.special, label: "One special character" },
  ];
};

// Border + focus-ring classes that reflect a field's validity (neutral when empty).
export const fieldStateClass = (value: string, ok: boolean): string =>
  value.length === 0
    ? "border-border focus:border-primary focus:ring-primary/25"
    : ok
    ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/30"
    : "border-red-500 focus:border-red-500 focus:ring-red-500/30";
