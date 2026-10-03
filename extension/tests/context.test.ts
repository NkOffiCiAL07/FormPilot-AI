import { describe, it, expect, beforeEach } from "vitest";
import { guessCompany, guessRole, domainOf } from "../src/shared/jobMeta";
import { extractPageContext } from "../src/content/pageContext";
import { quickValue, comboOf, isValidCombo } from "../src/shared/quickCopy";
import { profile } from "./helpers";

describe("jobMeta", () => {
  it("company from ATS URLs and titles", () => {
    expect(guessCompany("https://boards.greenhouse.io/acme-corp/jobs/1", "Job Application for SWE")).toBe("Acme corp");
    expect(guessCompany("https://jobs.lever.co/globex/abc", "x")).toBe("Globex");
    expect(guessCompany("https://x.com/job", "Senior Engineer at Initech - Careers")).toBe("Initech");
    expect(guessCompany("https://careers.umbrella.com/job", "Engineer | Umbrella")).toBe("Umbrella");
    expect(domainOf("https://www.example.com/a")).toBe("example.com");
  });
  it("role from titles", () => {
    expect(guessRole("Senior Engineer at Initech - Careers")).toBe("Senior Engineer");
    expect(guessRole("Job Application for Data Analyst | Acme")).toBe("Data Analyst");
  });
});

describe("page context extraction", () => {
  beforeEach(() => { document.head.innerHTML = ""; document.body.innerHTML = ""; });
  it("prefers JSON-LD JobPosting and converts HTML description to text", () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Backend Engineer", hiringOrganization: { name: "Acme" },
      jobLocation: { address: { addressLocality: "Pune", addressCountry: "IN" } }, description: "<p>Build things</p><ul><li>C++</li><li>Linux</li></ul>" })}</script>`;
    const c = extractPageContext("https://acme.com/jobs/1", "Whatever");
    expect(c).toMatchObject({ role: "Backend Engineer", company: "Acme", location: "Pune, IN", hasJobPosting: true });
    expect(c.description).toContain("- C++");
    expect(c.description).not.toContain("<");
  });
  it("handles @graph and tolerates broken JSON-LD", () => {
    document.head.innerHTML = `<script type="application/ld+json">{broken</script><script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":["JobPosting"],"title":"QA","hiringOrganization":"Globex","description":"x"}]}</script>`;
    expect(extractPageContext("https://g.com/1", "t")).toMatchObject({ role: "QA", company: "Globex" });
  });
  it("falls back to h1 + page text when there is no structured data", () => {
    document.title = "Senior SWE at Initech";
    document.body.innerHTML = `<h1>Senior SWE</h1><main>${"We are looking for someone. Responsibilities include building services. Requirements: 4 years experience. ".repeat(6)}</main>`;
    const c = extractPageContext("https://initech.com/careers/1", document.title);
    expect(c.role).toBe("Senior SWE");
    expect(c.company).toBe("Initech");
    expect(c.hasJobPosting).toBe(true);
  });
  it("a page with no job content is not a job posting", () => {
    document.body.innerHTML = `<h1>Contact us</h1><p>Hi</p>`;
    expect(extractPageContext("https://x.com/contact", "Contact").hasJobPosting).toBe(false);
  });
});

describe("quick copy", () => {
  it("builds values from the profile", () => {
    expect(quickValue(profile, "email")).toBe("asha@example.com");
    expect(quickValue(profile, "address")).toBe("12 MG Road, Bangalore, Karnataka, 560001, India");
    expect(quickValue(profile, "fullName")).toBe("Asha K Rao");
    expect(quickValue(profile, "currentCompany")).toBe("Siemens EDA");
    expect(quickValue(profile, "nope")).toBe("");
  });
  it("shortcut combos: capture and validate", () => {
    const e = (o: Partial<KeyboardEventInit>) => new KeyboardEvent("keydown", o);
    expect(comboOf(e({ altKey: true, shiftKey: true, code: "KeyE", key: "E" }))).toBe("Alt+Shift+E");
    expect(comboOf(e({ ctrlKey: true, code: "Digit1", key: "1" }))).toBe("Ctrl+1");
    expect(isValidCombo("Alt+Shift+E")).toBe(true);
    expect(isValidCombo("Shift+E")).toBe(false);   // would fire while typing
    expect(isValidCombo("E")).toBe(false);
  });
});
