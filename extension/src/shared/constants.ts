export const LOCAL_API_BASE = "http://localhost:3710";

export const CONFIDENCE_THRESHOLDS = {
  AUTO: 0.85,      // fill automatically
  MEDIUM: 0.6,     // show preview
  LOW: 0.3,        // ask user
} as const;

export const SENSITIVE_KEYWORDS = [
  "social security",
  "ssn",
  "passport",
  "visa",
  "work authorization",
  "authorized to work",
  "legal status",
  "citizenship",
  "salary",
  "compensation",
  "expected salary",
  "current salary",
  "notice period",
  "criminal",
  "background check",
  "drug test",
  "disability",
  "gender",
  "race",
  "ethnicity",
  "veteran",
  "religion",
] as const;

export const PROFILE_FIELD_MAP: Record<string, string> = {
  // Personal
  "personal.first_name": "firstName",
  "personal.last_name": "lastName",
  "personal.middle_name": "middleName",
  "personal.full_name": "__derived__.fullName",
  "personal.email": "email",
  "personal.phone": "phone",
  "personal.dob": "dateOfBirth",
  "personal.address.street": "address.street",
  "personal.address.city": "address.city",
  "personal.address.state": "address.state",
  "personal.address.country": "address.country",
  "personal.address.zip": "address.zip",

  // Professional
  "employment.current_company": "currentCompany",
  "employment.current_title": "currentTitle",
  "employment.total_experience": "totalExperience",
  "employment.skills": "__derived__.skillsJoined",
  "employment.technologies": "__derived__.techJoined",
  "professional.linkedin": "linkedin",
  "professional.github": "github",
  "professional.portfolio": "portfolio",
  "professional.summary": "summary",

  // Education
  "education.institution": "__derived__.latestInstitution",
  "education.degree": "__derived__.latestDegree",
  "education.field": "__derived__.latestField",
  "education.graduation": "__derived__.latestGraduation",
  "education.gpa": "__derived__.latestGpa",
};
