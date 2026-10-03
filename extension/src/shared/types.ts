// ─── Field Types ─────────────────────────────────────────────────────────────

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "password"
  | "date"
  | "url"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "hidden"
  | "custom";

// auto    – deterministic match, high confidence → filled automatically
// review  – deterministic match, medium confidence (or always-review field) → filled, highlighted
// ai      – AI-written draft → filled only after the user accepts it
// memory  – reused from an answer the user approved earlier → filled only after the user accepts it
export type FillStatus = "auto" | "review" | "ai" | "memory" | "needs_input" | "sensitive" | "document" | "skipped";

export interface SelectOption {
  value: string;
  label: string;
}

// Normalized representation of a detected form field
export interface NormalizedField {
  id: string;            // internal uuid
  elementId: string;     // DOM element id or generated ref
  fieldType: FieldType;
  label: string;
  placeholder: string;
  name: string;
  ariaLabel: string;
  required: boolean;
  options: SelectOption[];       // for select/radio/checkbox
  sectionContext: string;        // nearest section/fieldset heading
  pageContext: string;           // page title + h1
  nearbyText: string;            // surrounding text snippet
  acceptedFileTypes?: string;    // for file inputs
  // Extra detection signals (all optional so older cached fields keep working)
  autocomplete?: string;         // HTML autocomplete token, e.g. "given-name"
  groupLabel?: string;           // question text for a radio/checkbox group (legend / radiogroup label)
  attrHints?: string;            // id + data-automation-id / data-testid / data-qa, camelCase split
  repeatIndex?: number;          // 0-based position among repeated blocks (employment #2, education #1…)
  repeatCount?: number;          // how many repeated blocks exist
  inShadow?: boolean;            // lives in a shadow root
}

export interface SimilarAnswer {
  id: string;
  question: string;
  answer: string;
  similarity: number;
  contextMatch: boolean;
  company: string;
}

// Result for a single field after AI/profile resolution
export interface FieldResult {
  fieldId: string;
  normalizedField: NormalizedField;
  status: FillStatus;
  confidence: number;           // 0–1
  value: string;
  source: string;               // "profile", "ai_generated", "answer_memory", "ask_user", …
  canonicalKey?: string;        // e.g. "currentCompany"
  reason: string;               // human-readable explanation, e.g. "Matched label 'Current Organization'"
  requiresReview: boolean;
  suggestion?: string;          // best candidate when confidence is below the fill threshold
  alternatives?: string[];
  needsUserInput?: boolean;
  userPrompt?: string;          // what to ask the user
  missing?: string[];           // facts the AI needed but the profile lacks
  similar?: SimilarAnswer[];
  reused?: { id: string; question: string; similarity: number; company: string };
  sanitized?: boolean;          // AI output contained a URL/email that was removed
  injectionSuspected?: boolean; // page text looked like a prompt-injection attempt
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  zip: string;
}

export interface EmploymentEntry {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate: string | null;  // null = current
  current: boolean;
  description: string;
}

export interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa: string;
  certifications: string[];
}

export interface CustomField {
  key: string;
  label: string;
  value: string;
}

export type YesNo = "yes" | "no" | "";

export interface UserProfile {
  // Personal
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: Address;

  // Professional
  currentCompany: string;
  currentTitle: string;
  totalExperience: string;    // "5 years"
  skills: string[];
  technologies: string[];
  linkedin: string;
  github: string;
  portfolio: string;
  summary: string;

  // Job preferences (always filled with "review" so you confirm them)
  expectedSalary: string;
  currentSalary: string;
  noticePeriod: string;
  workAuthorization: string;     // free text, e.g. "Citizen", "H-1B"
  authorizedToWork: YesNo;       // "Are you legally authorized to work in …?"
  requiresSponsorship: YesNo;    // "Will you require visa sponsorship?"
  willingToRelocate: YesNo;
  preferredLocations: string;

  // Employment history
  employment: EmploymentEntry[];

  // Education
  education: EducationEntry[];

  // Custom fields
  customFields: CustomField[];

  // Timestamps
  updatedAt: string;
}

export const defaultProfile: UserProfile = {
  firstName: "",
  middleName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  address: { street: "", city: "", state: "", country: "", zip: "" },
  currentCompany: "",
  currentTitle: "",
  totalExperience: "",
  skills: [],
  technologies: [],
  linkedin: "",
  github: "",
  portfolio: "",
  summary: "",
  expectedSalary: "",
  currentSalary: "",
  noticePeriod: "",
  workAuthorization: "",
  authorizedToWork: "",
  requiresSponsorship: "",
  willingToRelocate: "",
  preferredLocations: "",
  employment: [],
  education: [],
  customFields: [],
  updatedAt: new Date().toISOString(),
};

// Stored profiles from older versions lack newer keys — always read through this.
export function normalizeProfile(p: Partial<UserProfile> | null | undefined): UserProfile {
  const src = (p ?? {}) as Partial<UserProfile>;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    ...defaultProfile,
    ...src,
    address: { ...defaultProfile.address, ...(src.address ?? {}) },
    skills: arr<string>(src.skills),
    technologies: arr<string>(src.technologies),
    employment: arr(src.employment),
    education: arr(src.education),
    customFields: arr(src.customFields),
  };
}

// ─── Messages between extension parts ────────────────────────────────────────

export type MessageType =
  | "SCAN_FORM"
  | "FORM_SCANNED"
  | "PAGE_CONTEXT"
  | "FIELDS_ANALYZED"
  | "FILL_FORM"
  | "UNDO_FILL"
  | "FORM_SUBMITTED"
  | "OPEN_SIDEPANEL"
  | "GET_PROFILE"
  | "SAVE_PROFILE"
  | "API_STATUS"
  | "REANALYZE"
  | "REGENERATE_FIELD"
  | "SET_RESUME"
  | "SAVE_APPLICATION"
  | "CLICK_FILE_INPUT"
  | "SCROLL_TO_FIELD"
  | "HIGHLIGHT_UPLOAD_AREA"
  | "GET_PAGE_CONTEXT"
  | "SET_JOB_TEXT"
  | "ATTACH_FILE"
  | "FILE_ATTACH_REQUEST"
  | "SETTINGS_CHANGED";

export interface ExtMessage {
  type: MessageType;
  payload?: unknown;
  error?: string;
}

// ─── Page / job context ───────────────────────────────────────────────────────

// Everything here comes from the web page and is UNTRUSTED. It is only ever pattern-matched locally
// or sent to the local API inside fenced data blocks — never treated as instructions.
export interface PageContext {
  url: string;
  title: string;
  company: string;
  role: string;
  location: string;
  description: string;   // job description text (trimmed)
  hasJobPosting: boolean;
}

export const emptyPageContext: PageContext = {
  url: "", title: "", company: "", role: "", location: "", description: "", hasJobPosting: false,
};

export interface FillStats {
  success: number;
  failed: number;
  skipped: number;
  filled: string[];   // fieldIds actually filled
}
