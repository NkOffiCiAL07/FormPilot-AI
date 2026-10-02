import { NormalizedField, UserProfile, defaultProfile, normalizeProfile } from "../src/shared/types";

export const profile: UserProfile = normalizeProfile({
  ...defaultProfile,
  firstName: "Asha", middleName: "K", lastName: "Rao", email: "asha@example.com", phone: "+91 98765 43210", dateOfBirth: "1994-03-12",
  address: { street: "12 MG Road", city: "Bangalore", state: "Karnataka", country: "India", zip: "560001" },
  currentCompany: "Siemens EDA", currentTitle: "Software Engineer", totalExperience: "4 years",
  skills: ["C++", "Python"], technologies: ["Linux", "Docker"],
  linkedin: "linkedin.com/in/asha", github: "https://github.com/asha", portfolio: "https://asha.dev", summary: "Backend engineer.",
  expectedSalary: "30 LPA", noticePeriod: "30 days", authorizedToWork: "yes", requiresSponsorship: "no", willingToRelocate: "yes",
  employment: [
    { id: "1", company: "Siemens EDA", title: "Software Engineer", startDate: "2021-06", endDate: null, current: true, description: "" },
    { id: "2", company: "Initech", title: "Intern", startDate: "2020-01", endDate: "2020-06", current: false, description: "" },
  ],
  education: [{ id: "e1", institution: "IIT Madras", degree: "B.Tech", field: "Computer Science", startDate: "2016", endDate: "2020", gpa: "8.7", certifications: [] }],
  customFields: [{ key: "pan", label: "Favourite editor", value: "Vim" }],
});

let n = 0;
export function makeField(p: Partial<NormalizedField> = {}): NormalizedField {
  n++;
  return {
    id: `f${n}`, elementId: `el${n}`, fieldType: "text", label: "", placeholder: "", name: "", ariaLabel: "", required: false,
    options: [], sectionContext: "", pageContext: "", nearbyText: "", ...p,
  };
}
