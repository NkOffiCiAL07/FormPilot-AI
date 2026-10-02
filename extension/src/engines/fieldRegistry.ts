// Canonical profile fields and the many ways forms ask for them.
// Adding support for a new field = adding one entry here.

import { NormalizedField, UserProfile } from "../shared/types";

export type Kind = "text" | "email" | "phone" | "url" | "date" | "number" | "yesno" | "long";

export interface FieldDef {
  key: string;
  label: string;                       // shown in the UI
  kind: Kind;
  get: (p: UserProfile, f: NormalizedField) => string;
  phrases: string[];                   // ways a form may word it (normalised, lowercase)
  exclude?: string[];                  // if the signal contains any of these words, this key is vetoed
  autocomplete?: string[];             // HTML autocomplete tokens
  inputTypes?: string[];               // <input type=…> that imply this key
  review?: boolean;                    // personal/commercial: always shown for review, never silently filled
  cap?: number;                        // maximum confidence for this key
}

const idx = (f: NormalizedField) => f.repeatIndex ?? 0;
const join = (...p: (string | undefined)[]) => p.filter(Boolean).join(" ");

function currentJob(p: UserProfile) {
  return p.employment.find((e) => e.current) ?? p.employment[0];
}

export function yearsOfExperience(p: UserProfile): string {
  if (p.totalExperience) return p.totalExperience;
  let months = 0;
  for (const e of p.employment) {
    const start = new Date(e.startDate);
    const end = e.current || !e.endDate ? new Date() : new Date(e.endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) months += (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  }
  const years = Math.floor(months / 12);
  return years > 0 ? `${years} years` : "";
}

const edu = (p: UserProfile, f: NormalizedField) => p.education[idx(f)] ?? (idx(f) === 0 ? p.education[0] : undefined);

export const REGISTRY: FieldDef[] = [
  // ── Personal ────────────────────────────────────────────────────────────
  { key: "firstName", label: "First name", kind: "text", get: (p) => p.firstName, autocomplete: ["given-name"],
    phrases: ["first name", "given name", "given names", "forename", "fname", "legal first name", "first names"], exclude: ["last", "middle", "family", "sur"] },
  { key: "lastName", label: "Last name", kind: "text", get: (p) => p.lastName, autocomplete: ["family-name"],
    phrases: ["last name", "surname", "family name", "lname", "last names", "family names", "legal last name"], exclude: ["first", "middle", "given"] },
  { key: "middleName", label: "Middle name", kind: "text", get: (p) => p.middleName, autocomplete: ["additional-name"],
    phrases: ["middle name", "middle initial", "mname", "middle names"] },
  { key: "fullName", label: "Full name", kind: "text", get: (p) => join(p.firstName, p.middleName, p.lastName), autocomplete: ["name"],
    phrases: ["full name", "name", "your name", "complete name", "legal name", "candidate name", "applicant name", "full legal name", "name as per id"],
    exclude: ["company", "first", "last", "middle", "user", "institution", "school", "university", "college", "employer", "organization", "organisation", "file", "reference", "manager", "referee", "project", "course", "degree", "family", "given", "sur", "preferred"] },
  { key: "preferredName", label: "Preferred name", kind: "text", get: (p) => p.firstName, cap: 0.88,
    phrases: ["preferred name", "preferred first name", "nickname", "display name", "name you go by", "what should we call you"] },
  { key: "email", label: "Email", kind: "email", get: (p) => p.email, autocomplete: ["email"], inputTypes: ["email"],
    phrases: ["email", "e mail", "email address", "mail id", "email id", "contact email", "work email", "personal email", "e mail address", "confirm email", "verify email", "re enter email"] },
  { key: "phone", label: "Phone", kind: "phone", get: (p) => p.phone, autocomplete: ["tel", "tel-national"], inputTypes: ["tel"],
    phrases: ["phone", "phone number", "mobile", "mobile number", "cell", "cell phone", "telephone", "contact number", "contact no", "mobile no", "phone no", "primary phone", "contact phone"],
    exclude: ["country code", "extension", "ext", "device"] },
  { key: "dateOfBirth", label: "Date of birth", kind: "date", get: (p) => p.dateOfBirth, autocomplete: ["bday"],
    phrases: ["date of birth", "dob", "birth date", "birthday", "birthdate", "d o b"] },

  // ── Address ─────────────────────────────────────────────────────────────
  { key: "street", label: "Street address", kind: "text", get: (p) => p.address.street, autocomplete: ["street-address", "address-line1"],
    phrases: ["street address", "address line 1", "address line one", "address 1", "street", "address", "mailing address", "residential address", "current address", "home address", "permanent address"],
    exclude: ["email", "web", "ip", "url", "line 2", "line two", "address 2", "apartment", "suite", "unit", "mail id", "website", "linkedin", "company", "employer", "office"] },
  { key: "city", label: "City", kind: "text", get: (p) => p.address.city, autocomplete: ["address-level2"],
    phrases: ["city", "town", "city town", "municipality", "city of residence", "current city", "your city", "current location", "city name", "town city"], exclude: ["state"] },
  { key: "state", label: "State / province", kind: "text", get: (p) => p.address.state, autocomplete: ["address-level1"],
    phrases: ["state", "province", "region", "state province", "state or province", "state of residence", "state name", "state province region"] },
  { key: "country", label: "Country", kind: "text", get: (p) => p.address.country, autocomplete: ["country", "country-name"],
    phrases: ["country", "nation", "country of residence", "country region", "country name", "your country", "country of citizenship"] , exclude: ["code"] },
  { key: "zip", label: "ZIP / PIN code", kind: "text", get: (p) => p.address.zip, autocomplete: ["postal-code"],
    phrases: ["zip", "zip code", "postal code", "pin code", "pincode", "postcode", "post code", "postal", "zipcode", "zip postal code"] },

  // ── Professional ────────────────────────────────────────────────────────
  { key: "currentCompany", label: "Current company", kind: "text", autocomplete: ["organization"],
    get: (p, f) => (idx(f) === 0 ? p.currentCompany || currentJob(p)?.company || "" : p.employment[idx(f)]?.company || ""),
    phrases: ["current company", "present company", "current employer", "present employer", "employer", "employer name", "company name", "company", "organization", "organisation",
      "current organization", "current organisation", "current workplace", "most recent employer", "most recent company", "name of employer", "name of company", "company employer", "recent employer", "current company name", "employer company"],
    exclude: ["previous", "former", "past", "prior", "website", "url", "size", "address", "phone", "email", "reference", "school", "last"] },
  { key: "currentTitle", label: "Current job title", kind: "text", autocomplete: ["organization-title"],
    get: (p, f) => (idx(f) === 0 ? p.currentTitle || currentJob(p)?.title || "" : p.employment[idx(f)]?.title || ""),
    phrases: ["current title", "job title", "current job title", "current role", "designation", "position", "current position", "position title", "role", "your title", "present designation", "current designation", "most recent job title", "job role", "title"],
    exclude: ["desired", "applying", "applied", "target", "salutation", "prefix", "preferred"] },
  { key: "previousCompany", label: "Previous companies", kind: "text", cap: 0.88,
    get: (p) => p.employment.filter((e) => !e.current).map((e) => e.company).filter(Boolean).join(", "),
    phrases: ["previous company", "previous employer", "past employer", "former employer", "prior employer", "last company", "previous organization", "previous organisation", "previous companies", "previous employers", "past companies", "last employer", "previous company name", "previous employer name"] },
  { key: "totalExperience", label: "Years of experience", kind: "number", get: (p) => yearsOfExperience(p),
    phrases: ["years of experience", "total experience", "total years of experience", "work experience", "years experience", "experience in years", "overall experience", "relevant experience", "total work experience", "years of work experience", "how many years of experience", "years of professional experience", "experience years", "professional experience", "total relevant experience", "total years experience"],
    exclude: ["describe", "details", "description", "list", "summary", "history", "previous", "company", "employer"] },
  { key: "skills", label: "Skills", kind: "long", get: (p) => p.skills.join(", "),
    phrases: ["skills", "technical skills", "key skills", "core skills", "your skills", "skill set", "skillset", "primary skills", "top skills", "relevant skills", "key skills and competencies"], exclude: ["describe", "explain", "soft"] },
  { key: "technologies", label: "Technologies", kind: "long", get: (p) => p.technologies.join(", "), cap: 0.88,
    phrases: ["technologies", "tech stack", "tools", "frameworks", "programming languages", "technologies used", "technical stack", "languages and frameworks"] },
  { key: "linkedin", label: "LinkedIn", kind: "url", get: (p) => p.linkedin, inputTypes: [],
    phrases: ["linkedin", "linkedin profile", "linkedin url", "linkedin link", "linkedin profile url", "linkedin page", "linkedin profile link", "linked in", "linkedin account"] },
  { key: "github", label: "GitHub", kind: "url", get: (p) => p.github,
    phrases: ["github", "github profile", "github url", "github link", "github profile url", "git hub", "github account", "github page"] },
  { key: "portfolio", label: "Portfolio / website", kind: "url", get: (p) => p.portfolio,
    phrases: ["portfolio", "portfolio url", "portfolio website", "personal website", "website", "web site", "personal site", "website url", "your website", "personal url", "portfolio link", "other website", "personal web page", "website link", "blog or portfolio"],
    exclude: ["company", "employer", "organization", "organisation"] },
  { key: "summary", label: "Professional summary", kind: "long", get: (p) => p.summary, cap: 0.85,
    phrases: ["summary", "professional summary", "about me", "bio", "professional bio", "brief introduction", "short bio", "personal statement", "profile summary", "about you", "career summary", "brief bio"] },

  // ── Education (repeat-aware) ───────────────────────────────────────────
  { key: "institution", label: "University / school", kind: "text", get: (p, f) => edu(p, f)?.institution || "",
    phrases: ["university", "college", "institution", "school", "school name", "university name", "college name", "alma mater", "school attended", "institute", "name of institution", "university college", "school university", "institution name", "school or university", "college or university", "name of university", "name of college"],
    exclude: ["high", "secondary"] },
  { key: "degree", label: "Degree", kind: "text", get: (p, f) => edu(p, f)?.degree || "",
    phrases: ["degree", "qualification", "highest qualification", "degree type", "highest degree", "education level", "level of education", "highest level of education", "degree name", "degree level", "highest education", "education qualification", "highest education level", "degree earned"] },
  { key: "fieldOfStudy", label: "Field of study", kind: "text", get: (p, f) => edu(p, f)?.field || "",
    phrases: ["field of study", "major", "specialization", "specialisation", "stream", "area of study", "discipline", "branch", "course", "field", "major field of study", "course of study", "major subject", "branch of study"] },
  { key: "graduationYear", label: "Graduation date", kind: "text", get: (p, f) => edu(p, f)?.endDate || "",
    phrases: ["graduation", "graduation date", "graduation year", "year of graduation", "expected graduation", "passing year", "year of passing", "end year", "completion year", "year of completion", "graduated", "date of graduation", "expected graduation date", "graduation month year"] },
  { key: "gpa", label: "GPA / grade", kind: "text", get: (p, f) => edu(p, f)?.gpa || "",
    phrases: ["gpa", "cgpa", "grade", "percentage", "academic score", "cumulative gpa", "grade point average", "marks", "overall gpa", "cgpa percentage", "cgpa or percentage", "final grade", "overall percentage"] },

  // ── Job preferences — always reviewed by the user ──────────────────────
  { key: "expectedSalary", label: "Expected salary", kind: "text", review: true, cap: 0.85, get: (p) => p.expectedSalary,
    phrases: ["expected salary", "expected ctc", "desired salary", "desired compensation", "salary expectation", "salary expectations", "expected compensation", "expected pay", "compensation expectations", "salary requirement", "salary requirements", "expected annual salary", "desired pay", "expected base salary", "expected package", "desired annual salary", "expected ctc lpa", "salary range", "desired ctc", "compensation expectation", "expected total compensation", "expected remuneration"],
    exclude: ["current", "present", "previous", "last", "existing"] },
  { key: "currentSalary", label: "Current salary", kind: "text", review: true, cap: 0.85, get: (p) => p.currentSalary,
    phrases: ["current salary", "current ctc", "present salary", "current compensation", "current package", "current annual salary", "present ctc", "last drawn salary", "existing ctc", "current base salary", "current pay", "current remuneration", "present compensation", "current total compensation"] },
  { key: "noticePeriod", label: "Notice period / availability", kind: "text", review: true, cap: 0.85, get: (p) => p.noticePeriod,
    phrases: ["notice period", "notice", "availability", "how soon can you join", "when can you start", "earliest start date", "available from", "joining time", "date available", "start date", "how soon can you start", "earliest availability", "notice period in days", "when are you available to start", "available to start", "joining period", "date of availability", "earliest date you can start"] },
  { key: "workAuthorization", label: "Work authorization", kind: "text", review: true, cap: 0.85, get: (p) => p.workAuthorization,
    phrases: ["work authorization", "work authorisation", "work permit", "visa status", "work status", "employment eligibility", "citizenship status", "immigration status", "right to work status", "work authorization status", "current visa status", "employment authorization", "citizenship"],
    exclude: ["are you", "do you", "legally authorized", "legally authorised"] },
  { key: "authorizedToWork", label: "Authorized to work", kind: "yesno", review: true, cap: 0.85, get: (p) => p.authorizedToWork,
    phrases: ["authorized to work", "authorised to work", "legally authorized to work", "legally authorised to work", "eligible to work", "right to work", "legally eligible", "work legally", "legally permitted to work", "legally entitled to work", "authorized to work in the country", "eligible to work in", "permitted to work", "authorization to work", "authorised to work in"] },
  { key: "requiresSponsorship", label: "Requires visa sponsorship", kind: "yesno", review: true, cap: 0.85, get: (p) => p.requiresSponsorship,
    phrases: ["require sponsorship", "visa sponsorship", "require visa sponsorship", "need sponsorship", "sponsorship", "require work visa", "now or in the future require", "immigration sponsorship", "need a visa", "employment visa sponsorship", "sponsorship for employment visa status", "require sponsorship now or in the future", "will you require sponsorship", "require sponsorship to work", "need visa sponsorship", "sponsorship to work", "require immigration sponsorship"] },
  { key: "willingToRelocate", label: "Willing to relocate", kind: "yesno", review: true, cap: 0.85, get: (p) => p.willingToRelocate,
    phrases: ["willing to relocate", "open to relocation", "relocate", "relocation", "ready to relocate", "able to relocate", "open to relocating", "willingness to relocate", "willing to relocate for this position", "are you willing to relocate", "relocation assistance", "open to relocate", "comfortable relocating"] },
  { key: "preferredLocations", label: "Preferred locations", kind: "text", review: true, cap: 0.85, get: (p) => p.preferredLocations,
    phrases: ["preferred location", "preferred locations", "preferred work location", "desired location", "location preference", "preferred city", "preferred job location", "preferred locations to work", "location preferences", "preferred office location", "preferred cities"] },
];

export const REGISTRY_KEYS = REGISTRY.map((d) => d.key);
export const getDef = (key: string) => REGISTRY.find((d) => d.key === key);
