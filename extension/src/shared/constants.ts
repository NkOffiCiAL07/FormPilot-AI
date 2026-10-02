// 127.0.0.1 (not "localhost") avoids an IPv6 lookup against a server that only binds IPv4.
export const LOCAL_API_BASE = "http://127.0.0.1:3710";

export const DEFAULT_THRESHOLDS = {
  AUTO: 0.9,     // >= fill automatically
  REVIEW: 0.7,   // >= fill but highlight for review; below → never auto-filled
} as const;

// Never auto-filled, never guessed — the user answers these themselves.
export const SENSITIVE_KEYWORDS = [
  "social security", "ssn", "national id", "aadhaar", "aadhar", "pan number", "passport number", "passport no",
  "criminal", "convicted", "background check", "drug test", "disability", "disabled",
  "gender", "sex", "race", "ethnicity", "ethnic", "veteran", "religion", "sexual orientation", "marital",
  "pronoun", "caste", "date of birth of", "bank account", "credit card",
] as const;
