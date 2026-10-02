import { describe, it, expect, beforeEach } from "vitest";
import { scanForms, watchForNewFields, findByFpId, deepQuery } from "../src/engines/formScanner";
import { resolveAllFields } from "../src/engines/profileResolver";
import { profile } from "./helpers";

const scan = () => scanForms({ requireLayout: false });
const html = (s: string) => { document.body.innerHTML = s; };
const byLabel = (fields: ReturnType<typeof scan>, label: string) => fields.find((f) => f.label === label)!;

beforeEach(() => { document.body.innerHTML = ""; document.title = "Apply — Acme"; });

describe("standard forms", () => {
  it("label[for], wrapping label, aria-label, aria-labelledby, placeholder", () => {
    html(`
      <form>
        <label for="a">First name *</label><input id="a" name="fn" required>
        <label>Email <input type="email" name="em"></label>
        <input aria-label="Phone number" type="tel">
        <span id="lbl">Current Company</span><input aria-labelledby="lbl">
        <input placeholder="LinkedIn URL">
      </form>`);
    const f = scan();
    expect(f.map((x) => x.label)).toEqual(["First name *", "Email", "Phone number", "Current Company", "LinkedIn URL"]);
    expect(f[0].required).toBe(true);
    expect(f[0].name).toBe("fn");
  });

  it("detects all field types", () => {
    html(`<form>
      <input type="text" aria-label="t"><input type="email" aria-label="e"><input type="tel" aria-label="p"><input type="number" aria-label="n">
      <input type="date" aria-label="d"><input type="url" aria-label="u"><textarea aria-label="ta"></textarea>
      <select aria-label="s"><option value="">Select</option><option value="a">A</option></select>
      <input type="checkbox" aria-label="c"><input type="file" aria-label="f"><input type="password" aria-label="pw">
      <input type="hidden" name="csrf"><input type="submit" value="Go"><button>Go</button></form>`);
    expect(scan().map((x) => x.fieldType)).toEqual(["text", "email", "tel", "number", "date", "url", "textarea", "select", "checkbox", "file", "password"]);
  });

  it("select options skip the placeholder entry", () => {
    html(`<select aria-label="Country"><option value="">Select…</option><option value="IN">India</option><option value="US">United States</option></select>`);
    expect(scan()[0].options).toEqual([{ value: "IN", label: "India" }, { value: "US", label: "United States" }]);
  });

  it("autocomplete, id and data-* hints are captured as signals", () => {
    html(`<input autocomplete="given-name"><input id="applicantLastName" data-automation-id="legalNameSection_lastName">`);
    const f = scan();
    expect(f[0].autocomplete).toBe("given-name");
    expect(f[1].attrHints).toContain("applicantLastName");
    expect(f[1].attrHints).toContain("legalNameSection_lastName");
  });

  it("skips hidden, disabled, readonly and search inputs", () => {
    html(`<input style="display:none" aria-label="a"><input disabled aria-label="b"><input readonly aria-label="c"><div role="search"><input aria-label="q"></div><input aria-label="ok">`);
    expect(scan().map((x) => x.label)).toEqual(["ok"]);
  });
});

describe("fields without labels", () => {
  it("falls back to sibling/container label text, then name, and the resolver still matches", () => {
    html(`
      <div class="row"><span class="field-label">Surname</span><input name="x1"></div>
      <div><p>Mobile Number</p><input name="x2"></div>
      <input name="candidate_email" type="email">
      <input name="user[first_name]">`);
    const f = scan();
    expect(f[0].label).toBe("Surname");
    expect(f[1].label).toBe("Mobile Number");
    expect(f[2].label).toBe("");
    const res = resolveAllFields(f, profile);
    expect(res.map((r) => r.canonicalKey)).toEqual(["lastName", "phone", "email", "firstName"]);
  });
});

describe("radio / checkbox groups", () => {
  it("uses the fieldset legend as the question and collects options", () => {
    html(`<fieldset><legend>Are you willing to relocate?</legend>
      <label><input type="radio" name="rel" value="y"> Yes</label><label><input type="radio" name="rel" value="n"> No</label></fieldset>`);
    const f = scan();
    expect(f).toHaveLength(1);
    expect(f[0].label).toBe("Are you willing to relocate?");
    expect(f[0].options).toEqual([{ value: "y", label: "Yes" }, { value: "n", label: "No" }]);
    const [r] = resolveAllFields(f, profile);
    expect(r).toMatchObject({ canonicalKey: "willingToRelocate", value: "y" });
  });
  it("finds the question for groups without a fieldset", () => {
    html(`<div class="q"><div>Will you require sponsorship?</div><div>
      <label><input type="radio" name="sp" value="1"> Yes</label><label><input type="radio" name="sp" value="0"> No</label></div></div>`);
    expect(scan()[0].label).toBe("Will you require sponsorship?");
  });
  it("aria radiogroup label", () => {
    html(`<span id="q">Legally authorized to work?</span><div role="radiogroup" aria-labelledby="q">
      <label><input type="radio" name="w" value="y"> Yes</label><label><input type="radio" name="w" value="n"> No</label></div>`);
    expect(scan()[0].label).toBe("Legally authorized to work?");
  });
});

describe("repeated blocks", () => {
  it("assigns repeatIndex to repeated labels", () => {
    html(`<section><h3>Work Experience</h3>
      <div><label>Company <input name="exp[0].company"></label><label>Title <input name="exp[0].title"></label></div>
      <div><label>Company <input name="exp[1].company"></label><label>Title <input name="exp[1].title"></label></div></section>`);
    const f = scan();
    expect(f.map((x) => [x.label, x.repeatIndex, x.repeatCount])).toEqual([["Company", 0, 2], ["Title", 0, 2], ["Company", 1, 2], ["Title", 1, 2]]);
    const res = resolveAllFields(f, profile);
    expect(res.map((r) => r.value)).toEqual(["Siemens EDA", "Software Engineer", "Initech", "Intern"]);
  });
  it("section heading numbering ('Education 2')", () => {
    html(`<h3>Education 2</h3><label>School <input name="s"></label>`);
    expect(scan()[0].repeatIndex).toBe(1);
  });
});

describe("shadow DOM", () => {
  it("scans open shadow roots and can find fields again by id", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const sr = host.attachShadow({ mode: "open" });
    sr.innerHTML = `<label for="e">Email address</label><input id="e" type="email">`;
    const f = scan();
    expect(f).toHaveLength(1);
    expect(f[0].label).toBe("Email address");
    expect(f[0].inShadow).toBe(true);
    expect(findByFpId(f[0].id)).toBe(sr.querySelector("input"));
    expect(deepQuery("input", document)).toBeTruthy();
  });
  it("handles nested shadow roots", () => {
    const outer = document.createElement("div"); document.body.appendChild(outer);
    const so = outer.attachShadow({ mode: "open" });
    const inner = document.createElement("div"); so.appendChild(inner);
    inner.attachShadow({ mode: "open" }).innerHTML = `<input aria-label="City">`;
    expect(scan().map((x) => x.label)).toEqual(["City"]);
  });
});

describe("dynamic forms", () => {
  it("re-scan keeps stable ids and picks up new fields", () => {
    html(`<input aria-label="One">`);
    const a = scan();
    document.body.insertAdjacentHTML("beforeend", `<input aria-label="Two">`);
    const b = scan();
    expect(b).toHaveLength(2);
    expect(b[0].id).toBe(a[0].id);
  });

  it("observer fires (debounced) for added fields but ignores unrelated mutations", async () => {
    html(`<div id="root"></div>`);
    let calls = 0;
    const obs = watchForNewFields(() => { calls++; }, { requireLayout: false });
    document.getElementById("root")!.insertAdjacentHTML("beforeend", "<p>hello</p>");
    await new Promise((r) => setTimeout(r, 750));
    expect(calls).toBe(0);
    document.getElementById("root")!.insertAdjacentHTML("beforeend", `<input aria-label="Late field"><input aria-label="Another">`);
    await new Promise((r) => setTimeout(r, 750));
    expect(calls).toBe(1);
    obs.disconnect();
  });
});

describe("React-style wrappers and custom widgets", () => {
  it("label inside wrapper div without for=", () => {
    html(`<div class="MuiFormControl"><label class="MuiLabel">Years of experience</label><div><input type="number"></div></div>`);
    expect(scan()[0].label).toBe("Years of experience");
  });
  it("contenteditable and role=textbox are treated as text areas/inputs", () => {
    html(`<div contenteditable="true" aria-label="Cover note"></div><div role="textbox" aria-label="Headline"></div>`);
    expect(scan().map((x) => [x.label, x.fieldType])).toEqual([["Cover note", "textarea"], ["Headline", "text"]]);
  });
  it("hidden file inputs behind custom upload buttons are still found", () => {
    html(`<div><button>Upload resume</button><input type="file" style="display:none" aria-label="Resume"></div>`);
    expect(scan().map((x) => x.fieldType)).toEqual(["file"]);
  });
});
