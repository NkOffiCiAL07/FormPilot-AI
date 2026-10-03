import { describe, it, expect } from "vitest";
import { parseExport, validateExport, validateProfile, diffProfile, mergeProfile, replaceProfile, EXPORT_VERSION, ExportFile } from "../src/shared/dataTransfer";
import { normalizeProfile } from "../src/shared/types";
import { profile } from "./helpers";

const file = (over: Partial<ExportFile> = {}): ExportFile => ({ app: "formpilot-ai", version: 1, exportedAt: "x", profile: {}, preferences: {}, answers: [], applications: [], coverLetters: [], documents: [], ...over });

describe("parse + validate", () => {
  it("rejects invalid JSON and non-objects", () => {
    expect(parseExport("{not json").error).toMatch(/valid JSON/);
    expect(parseExport("[1,2]").error).toMatch(/isn't a FormPilot export/);
    expect(parseExport("42").data).toBeNull();
  });
  it("accepts a valid export", () => {
    const { data } = parseExport(JSON.stringify(file({ profile: { firstName: "A" } })));
    expect(validateExport(data!)).toMatchObject({ ok: true, errors: [] });
  });
  it("rejects incompatible versions and foreign files", () => {
    expect(validateExport(file({ version: EXPORT_VERSION + 1 })).errors[0]).toMatch(/newer/);
    expect(validateExport(file({ version: undefined as never })).ok).toBe(false);
    expect(validateExport(file({ app: "other-app" })).errors[0]).toMatch(/wasn't exported from FormPilot/);
  });
  it("rejects malformed profile data", () => {
    expect(validateProfile({ firstName: 5, skills: "C++", address: "x" })).toHaveLength(3);
    expect(validateProfile(undefined)).toEqual([]);
    expect(validateExport(file({ profile: [] as never })).ok).toBe(false);
  });
});

describe("merge never silently overwrites", () => {
  const incoming = { firstName: "Different", lastName: "Name", expectedSalary: "40 LPA", phone: "", skills: ["C++", "Rust"],
    address: { street: "", city: "Mumbai", state: "MH", country: "India", zip: "400001" },
    employment: [{ id: "x", company: "Initech", title: "Intern", startDate: "2020-01", endDate: "2020-06", current: false, description: "" }, { id: "y", company: "NewCo", title: "Dev", startDate: "2022-01", endDate: null, current: false, description: "" }],
    customFields: [{ key: "pan", label: "Other", value: "zzz" }, { key: "ref", label: "Ref", value: "42" }] };

  it("keeps existing non-empty values and reports them as conflicts", () => {
    const d = diffProfile(profile, incoming);
    expect(d.conflicts).toContain("firstName");
    expect(d.conflicts).toContain("address.city");
    const merged = mergeProfile(profile, incoming);
    expect(merged.firstName).toBe("Asha");
    expect(merged.address.city).toBe("Bangalore");
  });
  it("fills blanks and unions lists without duplicates", () => {
    const base = normalizeProfile({ firstName: "Asha", skills: ["c++"], employment: profile.employment, customFields: profile.customFields });
    const merged = mergeProfile(base, incoming);
    expect(merged.lastName).toBe("Name");
    expect(merged.expectedSalary).toBe("40 LPA");
    expect(merged.address.state).toBe("MH");
    expect(merged.skills).toEqual(["c++", "Rust"]);
    expect(merged.employment.map((e) => e.company)).toEqual(["Siemens EDA", "Initech", "NewCo"]);
    expect(merged.customFields.map((c) => c.key)).toEqual(["pan", "ref"]);
    expect(merged.customFields[0].value).toBe("Vim");
  });
  it("replace is a full overwrite (only used after explicit confirmation)", () => {
    const r = replaceProfile({ firstName: "Only" });
    expect(r.firstName).toBe("Only");
    expect(r.email).toBe("");
    expect(r.skills).toEqual([]);
  });
  it("old exports missing newer keys still import (backward compatible)", () => {
    const old = { firstName: "Old", lastName: "Timer", email: "o@t.com" };
    const merged = mergeProfile(normalizeProfile(null), old);
    expect(merged).toMatchObject({ firstName: "Old", expectedSalary: "", willingToRelocate: "" });
  });
});
