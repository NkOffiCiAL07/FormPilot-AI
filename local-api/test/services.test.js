import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeJob } from "../src/services/jobAnalysis.js";
import { scoreMatch, rankResumes } from "../src/services/matching.js";
import { findSimilar, saveAnswer, categorize, tokenize } from "../src/services/answerMemory.js";
import { docxText, pdfText } from "../src/services/documentText.js";
import { deflateSync } from "zlib";

const JD = `Senior Software Engineer
Location: Bangalore / Hybrid
Full-time

About us
We build things.

Requirements
- 4+ years of experience in C++ and Python
- Strong Linux and distributed systems background
- Bachelor's degree in Computer Science

Nice to have
- Kubernetes
- Docker

We are unable to sponsor visas. Salary: ₹30 LPA - ₹40 LPA.
Why do you want to work here?`;

test("analyzeJob extracts structured facts deterministically", () => {
  const j = analyzeJob({ title: "Senior Software Engineer", company: "Acme", text: JD });
  assert.deepEqual(j.requiredSkills.sort(), ["C++", "Distributed Systems", "Linux", "Python"].sort());
  assert.deepEqual(j.preferredSkills.sort(), ["Docker", "Kubernetes"]);
  assert.equal(j.minYears, 4);
  assert.match(j.location, /Bangalore/);
  assert.ok(j.workModes.includes("Hybrid"));
  assert.equal(j.employmentType, "Full-time");
  assert.equal(j.educationLevel, 2);
  assert.match(j.sponsorship, /No sponsorship/);
  assert.match(j.salary, /30/);
  assert.ok(j.applicationQuestions.includes("Why do you want to work here?"));
});

test("skill detection respects word boundaries", () => {
  const j = analyzeJob({ text: "We use Javascript, not Java. Experience with Go-lang? golang yes. Rustic charm." });
  assert.ok(j.requiredSkills.includes("JavaScript"));
  assert.ok(j.requiredSkills.includes("Go"));
  assert.ok(!j.requiredSkills.includes("Rust"));
});

const profile = { totalExperience: "5 years", skills: ["C++", "Python", "Linux"], education: [{ degree: "B.Tech" }], address: { city: "Bangalore", country: "India" } };

test("scoreMatch is explainable: components, matched and missing skills", () => {
  const job = analyzeJob({ title: "SWE", text: JD });
  const m = scoreMatch({ job, profile });
  assert.ok(m.score > 60 && m.score <= 100);
  assert.deepEqual(m.matchedSkills.sort(), ["C++", "Linux", "Python"]);
  assert.deepEqual(m.missingSkills, ["Distributed Systems"]);
  assert.deepEqual(m.missingPreferred.sort(), ["Docker", "Kubernetes"]);
  assert.ok(m.components.every((c) => c.detail && c.weight > 0));
  assert.match(m.disclaimer, /not a prediction/);
  assert.match(m.components.find((c) => c.key === "location").detail, /Matches your location/);
});

test("scoreMatch with nothing to compare returns null instead of a fake number", () => {
  assert.equal(scoreMatch({ job: analyzeJob({ text: "Join us!" }), profile: {} }).score, null);
});

test("rankResumes prefers the resume covering more required skills, with reasons", () => {
  const job = analyzeJob({ title: "Backend Engineer", text: JD });
  const ranked = rankResumes({ job, profile: { address: {} }, resumes: [
    { id: "a", name: "Designer", skills: ["Figma"], text: "", targetRole: "UX" },
    { id: "b", name: "Backend Engineer", skills: ["C++", "Python", "Linux", "Distributed Systems"], text: "", targetRole: "Backend Engineer" },
  ] });
  assert.equal(ranked[0].id, "b");
  assert.ok(ranked[0].reasons.some((r) => /Covers/.test(r)));
  assert.ok(ranked[1].missingSkills.length > 0);
});

test("categorize + tokenize", () => {
  assert.equal(categorize("Why do you want to work at our company?"), "why_company");
  assert.equal(categorize("Tell us about yourself"), "about_you");
  assert.equal(categorize("Favourite colour"), "general");
  assert.ok(!tokenize("Why do you want to join").includes("you"));
});

test("answer memory: only approved answers are reused; company-specific answers need the same company", () => {
  saveAnswer({ question: "Tell us about yourself", answer: "I'm a C++ engineer.", approved: true });
  saveAnswer({ question: "Why do you want to work here?", answer: "Because Acme builds EDA tools.", company: "Acme", approved: true });
  saveAnswer({ question: "Describe your biggest weakness", answer: "unapproved draft", approved: false });

  const about = findSimilar("Please tell us a bit about yourself", { company: "Globex" });
  assert.equal(about[0].answer, "I'm a C++ engineer.");
  assert.equal(about[0].contextMatch, true, "generic answers carry over");

  const sameCo = findSimilar("Why do you want to join this company?", { company: "Acme" });
  assert.equal(sameCo[0].contextMatch, true);
  const otherCo = findSimilar("Why do you want to join this company?", { company: "Globex" });
  assert.equal(otherCo[0].contextMatch, false, "never silently reused for a different company");
  assert.equal(findSimilar("Describe your biggest weakness").length, 0, "unapproved answers are not offered");
  assert.equal(findSimilar("What is your favourite colour?").length, 0);
});

test("docx text extraction", () => {
  // minimal stored (method 0) zip with word/document.xml
  const xml = Buffer.from('<w:document><w:p><w:r><w:t>Hello &amp; welcome</w:t></w:r></w:p><w:p><w:r><w:t>C++ developer</w:t></w:r></w:p></w:document>');
  const name = Buffer.from("word/document.xml");
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(xml.length, 18); lh.writeUInt32LE(xml.length, 22); lh.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt32LE(xml.length, 20); cd.writeUInt32LE(xml.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 42);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(30 + name.length + xml.length, 16);
  const zip = Buffer.concat([lh, name, xml, cd, name, eocd]);
  assert.equal(docxText(zip), "Hello & welcome\nC++ developer");
});

test("pdf text extraction (flate stream with Tj/TJ)", () => {
  const content = deflateSync(Buffer.from("BT /F1 12 Tf 72 700 Td (Python and \\(Linux\\) engineer) Tj T* [(Dist) -300 (ributed)] TJ ET"));
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n1 0 obj\n<</Filter /FlateDecode>>\nstream\n", "latin1"), content, Buffer.from("\nendstream\nendobj\n", "latin1")]);
  const t = pdfText(pdf);
  assert.match(t, /Python and \(Linux\) engineer/);
  assert.match(t, /Dist ributed/);
});
