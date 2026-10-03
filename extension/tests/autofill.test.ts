import { describe, it, expect, beforeEach } from "vitest";
import { fillItems, undoFill, undoCount, findElement, highlightFields } from "../src/engines/autofill";
import { scanForms } from "../src/engines/formScanner";
import { resolveAllFields } from "../src/engines/profileResolver";
import { profile } from "./helpers";

const scan = () => scanForms({ requireLayout: false });
const html = (s: string) => { document.body.innerHTML = s; };
const idOf = (el: Element) => (el as HTMLElement).dataset.fpId!;
const fill = (el: Element, value: string) => fillItems([{ fieldId: idOf(el), value }]);

beforeEach(() => { document.body.innerHTML = ""; undoFill(); });

describe("text, textarea, number, date", () => {
  it("fills inputs and fires input/change events", () => {
    html(`<input aria-label="Name"><textarea aria-label="Notes"></textarea><input type="number" aria-label="Years"><input type="date" aria-label="DOB">`);
    scan();
    const [t, ta, n, d] = Array.from(document.querySelectorAll<HTMLInputElement>("input,textarea"));
    const events: string[] = [];
    t.addEventListener("input", () => events.push("input"));
    t.addEventListener("change", () => events.push("change"));
    expect(fill(t, "Asha").success).toBe(1);
    expect(fill(ta, "Line 1\nLine 2").success).toBe(1);
    fill(n, "4"); fill(d, "1994-03-12");
    expect([t.value, ta.value, n.value, d.value]).toEqual(["Asha", "Line 1\nLine 2", "4", "1994-03-12"]);
    expect(events).toContain("input");
    expect(events).toContain("change");
  });

  it("works with React-style controlled inputs (state updated from the input event, value tracker bypassed)", () => {
    html(`<input aria-label="Email">`);
    scan();
    const el = document.querySelector("input")!;
    let state = "";
    // React shadows `value` on the instance; only the native prototype setter + a real input event update state
    let tracked = "";
    Object.defineProperty(el, "value", { configurable: true, get: () => tracked, set: (v) => { tracked = v; } });
    el.addEventListener("input", () => { state = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.get!.call(el); });
    fill(el, "asha@example.com");
    expect(state).toBe("asha@example.com");
  });

  it("contenteditable / role=textbox", () => {
    html(`<div contenteditable="true" aria-label="Bio"></div>`);
    scan();
    const el = document.querySelector<HTMLElement>("[contenteditable]")!;
    expect(fill(el, "Hello").success).toBe(1);
    expect(el.innerText ?? el.textContent).toBe("Hello");
  });
});

describe("select", () => {
  const sel = `<select aria-label="Country"><option value="">Select</option><option value="US">United States</option><option value="IN">India</option></select>`;
  it("matches by value, label, and partial label", () => {
    html(sel); scan();
    const el = document.querySelector("select")!;
    fill(el, "IN"); expect(el.value).toBe("IN");
    fill(el, "United States"); expect(el.value).toBe("US");
    fill(el, "ind"); expect(el.value).toBe("IN");
  });
  it("reports failure when nothing matches and leaves the select untouched", () => {
    html(sel); scan();
    const el = document.querySelector("select")!;
    expect(fill(el, "Atlantis")).toMatchObject({ success: 0, failed: 1 });
    expect(el.value).toBe("");
  });
});

describe("radio & checkbox", () => {
  it("selects the radio by value or label text", () => {
    html(`<fieldset><legend>Relocate?</legend><label><input type="radio" name="r" value="y"> Yes</label><label><input type="radio" name="r" value="n"> No</label></fieldset>`);
    const f = scan()[0];
    const first = document.querySelector<HTMLInputElement>('input[type="radio"]')!;
    expect(fillItems([{ fieldId: f.id, value: "n" }]).success).toBe(1);
    expect(document.querySelector<HTMLInputElement>('input[value="n"]')!.checked).toBe(true);
    expect(fillItems([{ fieldId: f.id, value: "Yes" }]).success).toBe(1);
    expect(first.checked).toBe(true);
  });
  it("checks and unchecks a checkbox", () => {
    html(`<label><input type="checkbox"> I am willing to relocate</label>`);
    scan();
    const cb = document.querySelector<HTMLInputElement>("input")!;
    fill(cb, "true"); expect(cb.checked).toBe(true);
    fill(cb, "false"); expect(cb.checked).toBe(false);
  });
  it("never fills file inputs (user must choose the file)", () => {
    html(`<input type="file" aria-label="Resume">`);
    scan();
    expect(fill(document.querySelector("input")!, "x.pdf")).toMatchObject({ success: 0, failed: 1 });
  });
});

describe("undo", () => {
  it("restores original values for every type, per field or all at once", () => {
    html(`<input aria-label="Name" value="Old name"><select aria-label="C"><option value="a">A</option><option value="b">B</option></select>
      <input type="checkbox" aria-label="Chk"><fieldset><legend>Q</legend><input type="radio" name="q" value="y"><input type="radio" name="q" value="n"></fieldset>`);
    scan();
    const [name, chk] = Array.from(document.querySelectorAll<HTMLInputElement>('input:not([type=radio])')).filter((e) => e.type !== "radio");
    const select = document.querySelector("select")!;
    const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'));

    fill(name, "New"); fill(name, "Newer"); // second fill must not overwrite the original snapshot
    fill(select, "b"); fill(chk, "true");
    fillItems([{ fieldId: idOf(radios[0]), value: "n" }]);
    expect(undoCount()).toBe(4);

    expect(undoFill([idOf(name)])).toBe(1);
    expect(name.value).toBe("Old name");
    expect(undoFill()).toBe(3);
    expect(select.value).toBe("a");
    expect(chk.checked).toBe(false);
    expect(radios.every((r) => !r.checked)).toBe(true);
    expect(undoCount()).toBe(0);
  });
});

describe("robustness", () => {
  it("re-finds a field after the page re-rendered and dropped data-fp-id", () => {
    html(`<label for="e">Email</label><input id="e" name="email">`);
    const f = scan()[0];
    document.querySelector("input")!.removeAttribute("data-fp-id");
    expect(findElement(f.id, f)).toBe(document.querySelector("input"));
    expect(fillItems([{ fieldId: f.id, value: "a@b.c", field: f }]).success).toBe(1);
  });
  it("fills fields inside shadow roots", () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    const sr = host.attachShadow({ mode: "open" });
    sr.innerHTML = `<label for="x">Phone</label><input id="x">`;
    const f = scan()[0];
    expect(fillItems([{ fieldId: f.id, value: "123" }]).success).toBe(1);
    expect(sr.querySelector("input")!.value).toBe("123");
  });
  it("skips empty values and unknown fields without throwing", () => {
    html(`<input aria-label="A">`);
    const f = scan()[0];
    expect(fillItems([{ fieldId: f.id, value: "" }, { fieldId: "nope", value: "x" }])).toMatchObject({ success: 0, skipped: 1, failed: 1 });
  });
});

describe("end to end: scan → resolve → fill", () => {
  it("fills a realistic application form from the profile", () => {
    html(`<form>
      <label for="fn">First Name</label><input id="fn" autocomplete="given-name">
      <label for="ln">Last Name</label><input id="ln" name="lastName">
      <label for="em">Email</label><input id="em" type="email">
      <label for="co">Current Organization</label><input id="co">
      <label for="ctc">Expected CTC</label><input id="ctc">
      <label for="ctry">Country</label><select id="ctry"><option value="">Select</option><option value="US">United States</option><option value="IN">India</option></select>
      <fieldset><legend>Are you willing to relocate?</legend><label><input type="radio" name="rl" value="y">Yes</label><label><input type="radio" name="rl" value="n">No</label></fieldset>
      <label for="gender">Gender</label><select id="gender"><option value="m">Male</option><option value="f">Female</option></select>
    </form>`);
    const results = resolveAllFields(scan(), profile);
    const items = results.filter((r) => (r.status === "auto" || r.status === "review") && r.value).map((r) => ({ fieldId: r.fieldId, value: r.value, field: r.normalizedField }));
    const stats = fillItems(items);
    expect(stats.failed).toBe(0);
    const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    expect([v("fn"), v("ln"), v("em"), v("co"), v("ctc"), v("ctry")]).toEqual(["Asha", "Rao", "asha@example.com", "Siemens EDA", "30 LPA", "IN"]);
    expect(document.querySelector<HTMLInputElement>('input[value="y"]')!.checked).toBe(true);
    expect(v("gender")).toBe("m"); // untouched: sensitive fields are never filled
    expect(results.find((r) => r.normalizedField.label === "Gender")!.status).toBe("sensitive");
  });

  it("highlighting marks fields needing attention and leaves clean ones alone", () => {
    html(`<label for="a">First Name</label><input id="a"><label for="b">Favourite colour</label><input id="b">`);
    highlightFields(resolveAllFields(scan(), profile));
    expect(document.getElementById("b")!.style.outline).toContain("solid");
    expect(document.getElementById("a")!.style.outline).toBe("");
  });
});
