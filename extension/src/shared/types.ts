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

export type FillStatus = "auto" | "ai" | "needs_input" | "sensitive" | "document" | "skipped";

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
}

// Result for a single field after AI/profile resolution
export interface FieldResult {
  fieldId: string;
  normalizedField: NormalizedField;
  status: FillStatus;
  confidence: number;           // 0–1
  value: string;
  source: string;               // "profile.email", "ai_generated", "ask_user", etc.
  reasoning?: string;           // why this value was chosen
  alternatives?: string[];      // other candidate values
  needsUserInput?: boolean;
  userPrompt?: string;          // what to ask the user
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
  employment: [],
  education: [],
  customFields: [],
  updatedAt: new Date().toISOString(),
};

// ─── Messages between extension parts ────────────────────────────────────────

export type MessageType =
  | "SCAN_FORM"
  | "FORM_SCANNED"
  | "ANALYZE_FIELDS"
  | "FIELDS_ANALYZED"
  | "FILL_FORM"
  | "OPEN_SIDEPANEL"
  | "GET_PROFILE"
  | "SAVE_PROFILE"
  | "API_STATUS"
  | "ERROR";

export interface ExtMessage {
  type: MessageType;
  payload?: unknown;
  error?: string;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface AnalyzeResponse {
  fields: FieldResult[];
  pageContext: {
    title: string;
    company?: string;
    role?: string;
    jobDescription?: string;
  };
  summary: {
    total: number;
    auto: number;
    ai: number;
    needsInput: number;
    documents: number;
  };
}

// ─── Document types ───────────────────────────────────────────────────────────

export interface Document {
  id: string;
  name: string;
  category: "resume" | "certificate" | "transcript" | "id" | "cover_letter" | "other";
  filename: string;
  size: number;
  uploadedAt: string;
  tags: string[];
}

// ─── Application History ──────────────────────────────────────────────────────

export interface ApplicationRecord {
  id: string;
  company: string;
  role: string;
  website: string;
  date: string;
  resumeUsed?: string;
  status: "applied" | "in_progress" | "rejected" | "offer";
  url: string;
}
