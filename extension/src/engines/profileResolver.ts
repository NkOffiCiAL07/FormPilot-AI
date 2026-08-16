import { UserProfile, NormalizedField, FieldResult, FillStatus } from "../shared/types";
import { SENSITIVE_KEYWORDS, CONFIDENCE_THRESHOLDS } from "../shared/constants";

// ─── Derived values ───────────────────────────────────────────────────────────

function deriveValue(profile: UserProfile, key: string): string {
  switch (key) {
    case "__derived__.fullName":
      return [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ");
    case "__derived__.fullNameNoMiddle":
      return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
    case "__derived__.skillsJoined":
      return profile.skills.join(", ");
    case "__derived__.techJoined":
      return profile.technologies.join(", ");
    case "__derived__.latestInstitution":
      return profile.education[0]?.institution || "";
    case "__derived__.latestDegree":
      return profile.education[0]?.degree || "";
    case "__derived__.latestField":
      return profile.education[0]?.field || "";
    case "__derived__.latestGraduation":
      return profile.education[0]?.endDate || "";
    case "__derived__.latestGpa":
      return profile.education[0]?.gpa || "";
    case "__derived__.currentEmployer":
      return profile.currentCompany || (profile.employment.find(e => e.current)?.company) || "";
    case "__derived__.currentTitle":
      return profile.currentTitle || (profile.employment.find(e => e.current)?.title) || "";
    case "__derived__.yearsExp": {
      // calculate from employment history if totalExperience not set
      if (profile.totalExperience) return profile.totalExperience;
      const entries = profile.employment;
      if (!entries.length) return "";
      let totalMonths = 0;
      for (const e of entries) {
        const start = new Date(e.startDate);
        const end = e.current ? new Date() : new Date(e.endDate || "");
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          totalMonths += (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        }
      }
      const years = Math.floor(totalMonths / 12);
      return years > 0 ? `${years} years` : "";
    }
    default:
      return "";
  }
}

function getProfileValue(profile: UserProfile, path: string): string {
  if (path.startsWith("__derived__")) return deriveValue(profile, path);
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let obj: any = profile;
  for (const part of parts) {
    if (obj == null || typeof obj !== "object") return "";
    obj = obj[part];
  }
  if (Array.isArray(obj)) return obj.join(", ");
  return String(obj ?? "");
}

// ─── Semantic rules ───────────────────────────────────────────────────────────

interface SemanticRule {
  keywords: string[];
  profileKey: string;
  confidence: number;
}

const SEMANTIC_RULES: SemanticRule[] = [
  // ── Personal ──────────────────────────────────────────────────────────────
  { keywords: ["first name", "firstname", "given name", "given names", "forename", "first names"], profileKey: "firstName", confidence: 0.95 },
  { keywords: ["last name", "lastname", "surname", "family name", "family names"], profileKey: "lastName", confidence: 0.95 },
  // "Local Given Name" and "Local Family Name" are localized aliases on Workday
  { keywords: ["local given name", "local first name", "preferred first name"], profileKey: "firstName", confidence: 0.88 },
  { keywords: ["local family name", "local last name", "local surname"], profileKey: "lastName", confidence: 0.88 },
  { keywords: ["middle name", "middlename", "middle initial"], profileKey: "middleName", confidence: 0.92 },
  { keywords: ["full name", "fullname", "complete name", "legal name", "candidate name"], profileKey: "__derived__.fullName", confidence: 0.9 },
  { keywords: ["display name", "preferred name"], profileKey: "__derived__.fullNameNoMiddle", confidence: 0.85 },
  { keywords: ["email", "e-mail", "mail address", "email address"], profileKey: "email", confidence: 0.97 },
  { keywords: ["phone", "mobile", "cell", "telephone", "contact number", "phone number", "mobile number"], profileKey: "phone", confidence: 0.93 },
  { keywords: ["date of birth", "dob", "birth date", "birthday", "date of birth"], profileKey: "dateOfBirth", confidence: 0.92 },

  // ── Address ───────────────────────────────────────────────────────────────
  { keywords: ["street address", "address line 1", "address line1", "address 1", "street", "address"], profileKey: "address.street", confidence: 0.88 },
  { keywords: ["address line 2", "address2", "apt", "suite", "unit"], profileKey: "", confidence: 0 }, // skip – we don't store apt
  { keywords: ["city", "town", "municipality", "city name"], profileKey: "address.city", confidence: 0.92 },
  { keywords: ["state", "province", "region", "state/province"], profileKey: "address.state", confidence: 0.88 },
  { keywords: ["country", "nation", "country of residence", "country name"], profileKey: "address.country", confidence: 0.92 },
  { keywords: ["zip", "postal code", "pin code", "pincode", "postcode", "zip code"], profileKey: "address.zip", confidence: 0.92 },

  // ── Professional ──────────────────────────────────────────────────────────
  { keywords: ["current company", "present company", "current employer", "present employer", "employer name", "company name", "organization", "current organization", "employer"], profileKey: "__derived__.currentEmployer", confidence: 0.9 },
  { keywords: ["current role", "current title", "job title", "position", "designation", "current position", "role", "your title"], profileKey: "__derived__.currentTitle", confidence: 0.88 },
  { keywords: ["years of experience", "total experience", "work experience", "years experience", "how many years", "experience in years", "overall experience"], profileKey: "__derived__.yearsExp", confidence: 0.87 },
  { keywords: ["skills", "technical skills", "key skills", "core skills", "your skills"], profileKey: "__derived__.skillsJoined", confidence: 0.85 },
  { keywords: ["technologies", "tech stack", "tools", "frameworks", "programming languages"], profileKey: "__derived__.techJoined", confidence: 0.83 },
  { keywords: ["linkedin", "linkedin profile", "linkedin url", "linkedin link"], profileKey: "linkedin", confidence: 0.97 },
  { keywords: ["github", "github profile", "github url", "github link"], profileKey: "github", confidence: 0.97 },
  { keywords: ["portfolio", "website", "personal website", "portfolio url", "personal url"], profileKey: "portfolio", confidence: 0.88 },
  { keywords: ["summary", "professional summary", "about me", "bio", "professional bio", "brief introduction", "about yourself", "cover letter body", "introduce yourself"], profileKey: "summary", confidence: 0.82 },

  // ── Education ─────────────────────────────────────────────────────────────
  { keywords: ["university", "college", "institution", "school name", "alma mater", "school attended"], profileKey: "__derived__.latestInstitution", confidence: 0.87 },
  { keywords: ["degree", "qualification", "highest qualification", "degree type", "highest degree"], profileKey: "__derived__.latestDegree", confidence: 0.87 },
  { keywords: ["field of study", "major", "specialization", "stream", "course", "area of study"], profileKey: "__derived__.latestField", confidence: 0.85 },
  { keywords: ["graduation", "graduation date", "graduation year", "year of graduation", "expected graduation"], profileKey: "__derived__.latestGraduation", confidence: 0.85 },
  { keywords: ["gpa", "cgpa", "grade", "percentage", "academic score", "cumulative gpa"], profileKey: "__derived__.latestGpa", confidence: 0.83 },
];

// ─── Sensitivity check ────────────────────────────────────────────────────────

function isSensitive(field: NormalizedField): boolean {
  const haystack = [field.label, field.name, field.ariaLabel, field.placeholder, field.nearbyText]
    .join(" ").toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => haystack.includes(kw));
}

// Consent / certification checkboxes — always ask user to check them manually
function isConsentCheckbox(field: NormalizedField): boolean {
  if (field.fieldType !== "checkbox") return false;
  const text = [field.label, field.nearbyText].join(" ").toLowerCase();
  return ["certify", "acknowledge", "agree", "consent", "confirm", "authorize", "hereby", "i accept"].some((kw) => text.includes(kw));
}

// Open-ended question detection
function isOpenEnded(field: NormalizedField): boolean {
  if (field.fieldType !== "textarea") return false;
  const label = (field.label || field.name || field.ariaLabel || "").toLowerCase();
  // Short labels like "Notes", "Comments" that are generic → ask user
  if (label.length < 4) return true;
  return true; // all textareas are open-ended
}

// ─── Semantic match ────────────────────────────────────────────────────────────

function findSemanticMatch(field: NormalizedField): SemanticRule | null {
  const haystack = [
    field.label,
    field.name,
    field.ariaLabel,
    field.placeholder,
    field.sectionContext,
    field.nearbyText.slice(0, 120),
  ].join(" ").toLowerCase().replace(/[_\-]/g, " ").replace(/\*/g, "");

  let bestMatch: SemanticRule | null = null;
  let bestScore = 0;

  for (const rule of SEMANTIC_RULES) {
    if (!rule.profileKey) continue; // explicitly skipped rules
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) {
        const score = kw.length * rule.confidence;
        if (score > bestScore) { bestScore = score; bestMatch = rule; }
      }
    }
  }
  return bestMatch;
}

// ─── Main resolver ────────────────────────────────────────────────────────────

export function resolveField(field: NormalizedField, profile: UserProfile): FieldResult {
  // 1. File upload → document manager
  if (field.fieldType === "file") {
    return { fieldId: field.id, normalizedField: field, status: "document", confidence: 0, value: "", source: "document_manager" };
  }

  // 2. Consent checkboxes → user must check manually
  if (isConsentCheckbox(field)) {
    return {
      fieldId: field.id, normalizedField: field, status: "sensitive", confidence: 0, value: "", source: "ask_user",
      needsUserInput: true, userPrompt: `Please review and check this consent/agreement field manually.`,
    };
  }

  // 3. Sensitive fields → always ask
  if (isSensitive(field)) {
    return {
      fieldId: field.id, normalizedField: field, status: "sensitive", confidence: 0, value: "", source: "ask_user",
      needsUserInput: true,
      userPrompt: `"${field.label || field.name}" contains sensitive information. Please provide the value.`,
    };
  }

  // 4. Semantic match → profile value
  const rule = findSemanticMatch(field);
  if (rule) {
    const value = getProfileValue(profile, rule.profileKey);
    if (value) {
      const status: FillStatus = rule.confidence >= CONFIDENCE_THRESHOLDS.AUTO ? "auto" : "needs_input";
      return { fieldId: field.id, normalizedField: field, status, confidence: rule.confidence, value, source: `profile.${rule.profileKey}` };
    }
  }

  // 5. Custom profile fields
  const haystack = [field.label, field.name, field.ariaLabel, field.placeholder].join(" ").toLowerCase();
  for (const cf of profile.customFields) {
    if (haystack.includes(cf.key.toLowerCase()) || haystack.includes(cf.label.toLowerCase())) {
      return { fieldId: field.id, normalizedField: field, status: "auto", confidence: 0.82, value: cf.value, source: `custom.${cf.key}` };
    }
  }

  // 6. Select with options → try to match a profile value to an option
  if (field.fieldType === "select" && field.options.length > 0 && rule) {
    const value = getProfileValue(profile, rule.profileKey);
    if (value) {
      const lv = value.toLowerCase();
      const matched = field.options.find(
        (o) => o.label.toLowerCase().includes(lv) || lv.includes(o.label.toLowerCase())
      );
      if (matched) {
        return { fieldId: field.id, normalizedField: field, status: "auto", confidence: 0.8, value: matched.value, source: `profile.${rule?.profileKey}` };
      }
    }
  }

  // 7. Open-ended (textarea) → queue for AI
  if (isOpenEnded(field) && field.label.length > 3) {
    return {
      fieldId: field.id, normalizedField: field, status: "ai", confidence: 0.5,
      value: "", source: "ai_pending", reasoning: "Requires AI generation",
    };
  }

  // 8. No match found
  return {
    fieldId: field.id, normalizedField: field, status: "needs_input", confidence: 0,
    value: "", source: "no_match", needsUserInput: true,
    userPrompt: `Could not match "${field.label || field.name}". Please fill manually.`,
  };
}

export function resolveAllFields(fields: NormalizedField[], profile: UserProfile): FieldResult[] {
  return fields.map((f) => resolveField(f, profile));
}

export function buildSummary(results: FieldResult[], totalFields?: number) {
  return {
    total: totalFields ?? results.length,
    auto: results.filter((r) => r.status === "auto").length,
    ai: results.filter((r) => r.status === "ai").length,
    needsInput: results.filter((r) => r.status === "needs_input" || r.status === "sensitive").length,
    documents: results.filter((r) => r.status === "document").length,
  };
}
