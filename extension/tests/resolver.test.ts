import { describe, it, expect } from "vitest";
import { resolveField, DEFAULT_TH, resolveAllFields, isSensitive } from "../src/engines/profileResolver";
import { matchPhrase, tokenize, normalize } from "../src/engines/text";
import { pickOption, adaptValue } from "../src/engines/choices";
import { makeField, profile } from "./helpers";

const r = (p: Parameters<typeof makeField>[0], th = DEFAULT_TH) => resolveField(makeField(p), profile, th);

describe("text matching", () => {
  it("normalises identifiers and punctuation", () => {
    expect(normalize("firstName_1")).toBe("first name 1");
    expect(normalize("Email *")).toBe("email");
    expect(tokenize("Current-Organization:")).toEqual(["current", "organization"]);
  });
  it("scores exact > contained > fuzzy, and generic single words are weak", () => {
    expect(matchPhrase(tokenize("What is your first name?"), tokenize("first name")).score).toBe(1);
    expect(matchPhrase(tokenize("Please tell us your first name here"), tokenize("first name")).score).toBeGreaterThan(0.78);
    expect(matchPhrase(tokenize("Adress line"), tokenize("address line")).kind).toBe("fuzzy");
    expect(matchPhrase(tokenize("Company name"), tokenize("name")).score).toBeLessThan(0.7);
    expect(matchPhrase(tokenize("Estate agent"), tokenize("state")).score).toBe(0);
  });
});

describe("synonyms → canonical keys", () => {
  it.each([
    ["Present Employer", "currentCompany"], ["Current Organization", "currentCompany"], ["Current Company", "currentCompany"], ["Employer", "currentCompany"],
    ["Expected CTC", "expectedSalary"], ["Expected Salary", "expectedSalary"], ["Desired Compensation", "expectedSalary"], ["Salary Expectations", "expectedSalary"],
    ["Surname", "lastName"], ["Given Name", "firstName"], ["Mobile Number", "phone"], ["E-mail address", "email"], ["Pincode", "zip"],
    ["Postal Code", "zip"], ["Notice Period", "noticePeriod"], ["Total years of experience", "totalExperience"], ["LinkedIn Profile URL", "linkedin"],
    ["GitHub", "github"], ["Personal Website", "portfolio"], ["University", "institution"], ["Field of study", "fieldOfStudy"], ["Previous Employer", "previousCompany"],
    ["Are you willing to relocate?", "willingToRelocate"], ["Will you now or in the future require sponsorship?", "requiresSponsorship"],
    ["Are you legally authorized to work in India?", "authorizedToWork"], ["Date of birth", "dateOfBirth"], ["City", "city"], ["State/Province", "state"],
  ])("%s → %s", (label, key) => {
    expect(r({ label }).canonicalKey).toBe(key);
  });

  it("does not confuse look-alike words", () => {
    expect(r({ label: "Email address" }).canonicalKey).toBe("email");          // not street "address"
    expect(r({ label: "Company website" }).canonicalKey).not.toBe("currentCompany");
    expect(r({ label: "Real estate experience" }).canonicalKey).not.toBe("state");
    expect(r({ label: "Last name" }).canonicalKey).toBe("lastName");
    expect(r({ label: "First name" }).canonicalKey).toBe("firstName");
    expect(r({ label: "Name" }).canonicalKey).toBe("fullName");
    expect(r({ label: "Company name", name: "company" }).canonicalKey).toBe("currentCompany");
  });
});

describe("multiple signals (no label)", () => {
  it("autocomplete token", () => {
    const x = r({ autocomplete: "given-name" });
    expect(x.canonicalKey).toBe("firstName");
    expect(x.confidence).toBeGreaterThanOrEqual(0.9);
    expect(x.reason).toMatch(/autocomplete/);
  });
  it("name / id attribute (camelCase and snake_case)", () => {
    expect(r({ name: "applicant_last_name" }).canonicalKey).toBe("lastName");
    expect(r({ attrHints: "firstName" }).canonicalKey).toBe("firstName");
  });
  it("input type", () => {
    expect(r({ fieldType: "email" }).canonicalKey).toBe("email");
    expect(r({ fieldType: "tel" }).canonicalKey).toBe("phone");
  });
  it("placeholder", () => {
    const x = r({ placeholder: "Enter your LinkedIn URL" });
    expect(x.canonicalKey).toBe("linkedin");
  });
  it("corroborating signals raise confidence", () => {
    const one = r({ label: "Employer" }).confidence;
    const two = r({ label: "Employer", name: "employer", placeholder: "Employer" }).confidence;
    expect(two).toBeGreaterThan(one);
  });
  it("weak nearby text alone is never enough to auto-fill", () => {
    const x = r({ nearbyText: "Please give us your phone number so we can reach you" });
    expect(["auto"]).not.toContain(x.status);
  });
});

describe("confidence + thresholds", () => {
  it("every result carries field/value/source/confidence/reason/requiresReview", () => {
    const x = r({ label: "Current Organization" });
    expect(x).toMatchObject({ canonicalKey: "currentCompany", value: "Siemens EDA", source: "profile", requiresReview: false, status: "auto" });
    expect(x.confidence).toBeGreaterThanOrEqual(0.9);
    expect(x.reason).toMatch(/Matched label "Current Organization"/);
  });
  it("salary & job preferences always need review, never silent auto-fill", () => {
    const x = r({ label: "Expected CTC" });
    expect(x.status).toBe("review");
    expect(x.requiresReview).toBe(true);
    expect(x.value).toBe("30 LPA");
  });
  it("thresholds are configurable", () => {
    const strict = { ...DEFAULT_TH, auto: 0.995, review: 0.99 };
    expect(r({ label: "First name" }, strict).status).toBe("needs_input");
    expect(r({ label: "First name" }, strict).suggestion).toBe("Asha");
    const noAuto = { ...DEFAULT_TH, autoFillHigh: false };
    expect(r({ label: "First name" }, noAuto).status).toBe("review");
    const noReview = { ...DEFAULT_TH, reviewMedium: false };
    expect(r({ label: "Expected Salary" }, noReview).status).toBe("needs_input");
  });
  it("matched key with empty profile value asks the user instead of guessing", () => {
    const x = resolveField(makeField({ label: "Current salary" }), profile, DEFAULT_TH);
    expect(x.status).toBe("needs_input");
    expect(x.reason).toMatch(/no current salary/i);
  });
  it("ambiguity lowers confidence", () => {
    const x = r({ label: "Date" , name: "birth_date" });
    expect(x.confidence).toBeLessThan(0.99);
  });
});

describe("never-guess categories", () => {
  it.each(["Gender", "Are you a protected veteran?", "Race/Ethnicity", "Disability status", "Social Security Number", "Do you have a criminal record?"])("%s → sensitive", (label) => {
    const x = r({ label });
    expect(x.status).toBe("sensitive");
    expect(x.value).toBe("");
  });
  it("consent checkboxes are left to the user", () => {
    expect(r({ fieldType: "checkbox", label: "I agree to the Terms and Privacy Policy" }).status).toBe("sensitive");
  });
  it("password fields are skipped; file inputs go to the document manager", () => {
    expect(r({ fieldType: "password", label: "Password" }).status).toBe("skipped");
    expect(r({ fieldType: "file", label: "Upload your resume" })).toMatchObject({ status: "document", canonicalKey: "resume" });
    expect(r({ fieldType: "file", label: "Cover letter" }).canonicalKey).toBe("cover_letter");
  });
  it("isSensitive uses whole words (no false positive on 'sexy' style substrings)", () => {
    expect(isSensitive(makeField({ label: "Essex county" }))).toBe(false);
  });
});

describe("open-ended and unknown fields", () => {
  it("open questions are queued for AI, not matched to the summary", () => {
    expect(r({ fieldType: "textarea", label: "Why do you want to work here?" }).status).toBe("ai");
    expect(r({ fieldType: "textarea", label: "Describe a challenging project" }).status).toBe("ai");
    expect(r({ fieldType: "text", label: "Why are you interested in this role at our company?" }).status).toBe("ai");
  });
  it("'Tell us about yourself' textarea goes to AI (memory/draft) rather than pasting the stored summary silently", () => {
    expect(r({ fieldType: "textarea", label: "Tell us about yourself" }).status).toBe("ai");
  });
  it("a textarea labelled exactly 'Professional summary' uses the profile summary", () => {
    expect(r({ fieldType: "textarea", label: "Professional Summary" })).toMatchObject({ status: expect.stringMatching(/auto|review/), value: "Backend engineer." });
  });
  it("unknown short fields need input", () => {
    const x = r({ label: "Favourite colour" });
    expect(x.status).toBe("needs_input");
    expect(x.source).toBe("no_match");
  });
  it("custom profile fields can be matched by label", () => {
    expect(r({ label: "Favourite editor" })).toMatchObject({ value: "Vim", source: "profile.custom" });
  });
  it("resolves a whole form in one pass", () => {
    const out = resolveAllFields([makeField({ label: "First name" }), makeField({ label: "Email" }), makeField({ fieldType: "file", label: "Resume" })], profile);
    expect(out.map((x) => x.status)).toEqual(["auto", "auto", "document"]);
  });
});

describe("repeated blocks", () => {
  it("second employment block uses the second job; education repeats by index", () => {
    const e1 = r({ label: "Company", repeatIndex: 1, repeatCount: 2, sectionContext: "Work Experience" });
    expect(e1.value).toBe("Initech");
    expect(r({ label: "Job title", repeatIndex: 1, repeatCount: 2 }).value).toBe("Intern");
    expect(r({ label: "School", repeatIndex: 0, repeatCount: 1 }).value).toBe("IIT Madras");
    expect(r({ label: "School", repeatIndex: 1, repeatCount: 2 }).status).toBe("needs_input");
  });
});

describe("selects & radios", () => {
  const yn = [{ value: "y", label: "Yes" }, { value: "n", label: "No" }];
  it("yes/no questions pick the right option", () => {
    const x = r({ fieldType: "radio", groupLabel: "Are you willing to relocate?", label: "Are you willing to relocate?", options: yn });
    expect(x).toMatchObject({ canonicalKey: "willingToRelocate", value: "y", status: "review" });
    const s = r({ fieldType: "select", label: "Will you now or in the future require sponsorship?", options: [{ value: "1", label: "Yes, I will require sponsorship" }, { value: "2", label: "No, I will not require sponsorship" }] });
    expect(s.value).toBe("2");
  });
  it("country aliases and experience ranges", () => {
    expect(pickOption([{ value: "US", label: "United States" }, { value: "IN", label: "India" }], "India", "text", "country")?.value).toBe("IN");
    expect(pickOption([{ value: "a", label: "USA" }], "United States of America", "text")?.value).toBe("a");
    const exp = [{ value: "0", label: "0-2 years" }, { value: "1", label: "3-5 years" }, { value: "2", label: "6+ years" }];
    expect(pickOption(exp, "4 years", "number", "totalExperience")?.value).toBe("1");
    expect(pickOption(exp, "9 years", "number", "totalExperience")?.value).toBe("2");
  });
  it("degree level buckets map B.Tech to Bachelor's", () => {
    expect(pickOption([{ value: "m", label: "Master's Degree" }, { value: "b", label: "Bachelor's Degree" }], "B.Tech", "text", "degree")?.value).toBe("b");
  });
  it("no matching option → needs input with the suggestion preserved", () => {
    const x = r({ fieldType: "select", label: "Country", options: [{ value: "x", label: "Atlantis" }] });
    expect(x.status).toBe("needs_input");
    expect(x.suggestion).toBe("India");
    expect(x.reason).toMatch(/none of the options match/);
  });
});

describe("value adaptation", () => {
  it("number inputs get digits, dates get ISO, URLs get a protocol", () => {
    expect(adaptValue("totalExperience", "number", "4 years", "number", "")).toBe("4");
    expect(adaptValue("dateOfBirth", "date", "12/03/1994", "date", "")).toBe("1994-03-12");
    expect(adaptValue("graduationYear", "text", "2020-05", "text", "graduation year")).toBe("2020");
    expect(adaptValue("linkedin", "url", "linkedin.com/in/asha", "url", "")).toBe("https://linkedin.com/in/asha");
    expect(adaptValue("linkedin", "url", "linkedin.com/in/asha", "text", "")).toBe("linkedin.com/in/asha");
  });
  it("resolver adapts to input type", () => {
    expect(r({ fieldType: "number", label: "Years of experience" }).value).toBe("4");
    expect(r({ fieldType: "date", label: "Date of birth" }).value).toBe("1994-03-12");
  });
});
