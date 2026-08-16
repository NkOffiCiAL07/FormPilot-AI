import { UserProfile, NormalizedField, FieldResult, FillStatus } from "../shared/types";
import { SENSITIVE_KEYWORDS, CONFIDENCE_THRESHOLDS } from "../shared/constants";

// ─── Derived values ───────────────────────────────────────────────────────────

function deriveValue(profile: UserProfile, key: string): string {
  switch (key) {
    case "__derived__.fullName":
      return [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ");
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
    default:
      return "";
  }
}

function getProfileValue(profile: UserProfile, path: string): string {
  if (path.startsWith("__derived__")) return deriveValue(profile, path);

  const parts = path.split(".");
  let obj: unknown = profile;
  for (const part of parts) {
    if (obj == null || typeof obj !== "object") return "";
    obj = (obj as Record<string, unknown>)[part];
  }
  if (Array.isArray(obj)) return obj.join(", ");
  return String(obj ?? "");
}

// ─── Semantic field → profile key mapping (deterministic, no AI) ──────────────

interface SemanticRule {
  keywords: string[];
  profileKey: string;
  confidence: number;
}

const SEMANTIC_RULES: SemanticRule[] = [
  // Personal
  { keywords: ["first name", "firstname", "given name"], profileKey: "firstName", confidence: 0.95 },
  { keywords: ["last name", "lastname", "surname", "family name"], profileKey: "lastName", confidence: 0.95 },
  { keywords: ["middle name", "middlename", "middle initial"], profileKey: "middleName", confidence: 0.92 },
  { keywords: ["full name", "fullname", "complete name", "legal name"], profileKey: "__derived__.fullName", confidence: 0.9 },
  { keywords: ["email", "e-mail", "mail address"], profileKey: "email", confidence: 0.97 },
  { keywords: ["phone", "mobile", "cell", "telephone", "contact number"], profileKey: "phone", confidence: 0.93 },
  { keywords: ["date of birth", "dob", "birth date", "birthday"], profileKey: "dateOfBirth", confidence: 0.92 },

  // Address
  { keywords: ["street address", "address line 1", "address line1", "street"], profileKey: "address.street", confidence: 0.88 },
  { keywords: ["city", "town", "municipality"], profileKey: "address.city", confidence: 0.9 },
  { keywords: ["state", "province", "region"], profileKey: "address.state", confidence: 0.87 },
  { keywords: ["country", "nation"], profileKey: "address.country", confidence: 0.9 },
  { keywords: ["zip", "postal", "pin code", "pincode", "postcode"], profileKey: "address.zip", confidence: 0.9 },

  // Professional
  { keywords: ["current company", "present company", "current employer", "present employer", "employer name", "company name", "organization"], profileKey: "currentCompany", confidence: 0.9 },
  { keywords: ["current role", "current title", "job title", "position", "designation"], profileKey: "currentTitle", confidence: 0.88 },
  { keywords: ["years of experience", "total experience", "work experience", "years experience"], profileKey: "totalExperience", confidence: 0.87 },
  { keywords: ["skills", "technical skills", "key skills", "core skills"], profileKey: "__derived__.skillsJoined", confidence: 0.85 },
  { keywords: ["technologies", "tech stack", "tools", "frameworks"], profileKey: "__derived__.techJoined", confidence: 0.83 },
  { keywords: ["linkedin", "linkedin profile", "linkedin url"], profileKey: "linkedin", confidence: 0.95 },
  { keywords: ["github", "github profile", "github url"], profileKey: "github", confidence: 0.95 },
  { keywords: ["portfolio", "website", "personal website", "portfolio url"], profileKey: "portfolio", confidence: 0.88 },
  { keywords: ["summary", "professional summary", "about me", "bio", "professional bio"], profileKey: "summary", confidence: 0.82 },

  // Education
  { keywords: ["university", "college", "institution", "school", "alma mater"], profileKey: "__derived__.latestInstitution", confidence: 0.87 },
  { keywords: ["degree", "qualification", "highest qualification"], profileKey: "__derived__.latestDegree", confidence: 0.87 },
  { keywords: ["field of study", "major", "specialization", "stream"], profileKey: "__derived__.latestField", confidence: 0.85 },
  { keywords: ["graduation", "graduation date", "graduation year"], profileKey: "__derived__.latestGraduation", confidence: 0.85 },
  { keywords: ["gpa", "cgpa", "grade", "percentage", "score"], profileKey: "__derived__.latestGpa", confidence: 0.83 },
];

function isSensitive(field: NormalizedField): boolean {
  const haystack = [field.label, field.name, field.ariaLabel, field.placeholder, field.nearbyText]
    .join(" ")
    .toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => haystack.includes(kw));
}

function findSemanticMatch(field: NormalizedField): SemanticRule | null {
  const haystack = [
    field.label,
    field.name,
    field.ariaLabel,
    field.placeholder,
    field.sectionContext,
    field.nearbyText.slice(0, 100),
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[_\-]/g, " ");

  let bestMatch: SemanticRule | null = null;
  let bestScore = 0;

  for (const rule of SEMANTIC_RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) {
        const score = kw.length * rule.confidence; // longer + higher confidence wins
        if (score > bestScore) {
          bestScore = score;
          bestMatch = rule;
        }
      }
    }
  }

  return bestMatch;
}

// ─── Main resolver ────────────────────────────────────────────────────────────

export function resolveField(field: NormalizedField, profile: UserProfile): FieldResult {
  // 1. Check sensitivity first
  if (isSensitive(field)) {
    return {
      fieldId: field.id,
      normalizedField: field,
      status: "sensitive",
      confidence: 0,
      value: "",
      source: "ask_user",
      needsUserInput: true,
      userPrompt: `This field ("${field.label || field.name}") contains sensitive information. Please provide the value.`,
    };
  }

  // 2. File upload
  if (field.fieldType === "file") {
    return {
      fieldId: field.id,
      normalizedField: field,
      status: "document",
      confidence: 0,
      value: "",
      source: "document_manager",
      needsUserInput: false,
    };
  }

  // 3. Semantic match → profile value
  const rule = findSemanticMatch(field);
  if (rule) {
    const value = getProfileValue(profile, rule.profileKey);
    if (value) {
      const status: FillStatus = rule.confidence >= CONFIDENCE_THRESHOLDS.AUTO ? "auto" : "needs_input";
      return {
        fieldId: field.id,
        normalizedField: field,
        status,
        confidence: rule.confidence,
        value,
        source: `profile.${rule.profileKey}`,
      };
    }
  }

  // 4. Check custom fields
  const customFieldLabel = [field.label, field.name, field.ariaLabel, field.placeholder]
    .join(" ")
    .toLowerCase();
  for (const cf of profile.customFields) {
    if (customFieldLabel.includes(cf.key.toLowerCase()) || customFieldLabel.includes(cf.label.toLowerCase())) {
      return {
        fieldId: field.id,
        normalizedField: field,
        status: "auto",
        confidence: 0.8,
        value: cf.value,
        source: `custom.${cf.key}`,
      };
    }
  }

  // 5. Open-ended → needs AI (return placeholder status for Phase 2)
  const isOpenEnded = field.fieldType === "textarea" || (field.fieldType === "text" && !rule);
  if (isOpenEnded && field.label.length > 10) {
    return {
      fieldId: field.id,
      normalizedField: field,
      status: "ai",
      confidence: 0.5,
      value: "",
      source: "ai_pending",
      reasoning: "Requires AI generation",
    };
  }

  // 6. No match
  return {
    fieldId: field.id,
    normalizedField: field,
    status: "needs_input",
    confidence: 0,
    value: "",
    source: "no_match",
    needsUserInput: true,
    userPrompt: `Could not find a match for "${field.label || field.name}". Please provide the value.`,
  };
}

export function resolveAllFields(fields: NormalizedField[], profile: UserProfile): FieldResult[] {
  return fields.map((f) => resolveField(f, profile));
}

export function buildSummary(results: FieldResult[]) {
  return {
    total: results.length,
    auto: results.filter((r) => r.status === "auto").length,
    ai: results.filter((r) => r.status === "ai").length,
    needsInput: results.filter((r) => r.status === "needs_input" || r.status === "sensitive").length,
    documents: results.filter((r) => r.status === "document").length,
  };
}
