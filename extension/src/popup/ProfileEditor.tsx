import React, { useEffect, useRef, useState } from "react";
import { Briefcase, Check, GraduationCap, Plus, SlidersHorizontal, Trash2, User, Wand2 } from "lucide-react";
import { CustomField, EducationEntry, EmploymentEntry, UserProfile, YesNo } from "../shared/types";
import { Button, Card, EmptyState, Tabs, TextInput, Field } from "../ui/components";
import { profileCompleteness } from "../ui/hooks";

type Section = "personal" | "work" | "prefs" | "education" | "custom";

// Comma-separated list input. Keeps the raw text while typing so a trailing comma isn't eaten.
function ListInput({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(", "));
  const last = useRef(value.join(", "));
  useEffect(() => {
    if (value.join(", ") !== last.current) { last.current = value.join(", "); setText(value.join(", ")); }
  }, [value]);
  return (
    <TextInput label={label} value={text} placeholder={placeholder} help="Separate with commas"
      onChange={(t) => { setText(t); const list = t.split(",").map((s) => s.trim()).filter(Boolean); last.current = list.join(", "); onChange(list); }} />
  );
}

const YesNoSelect = ({ label, value, onChange, help }: { label: string; value: YesNo; onChange: (v: YesNo) => void; help?: string }) => (
  <Field label={label} help={help}>
    <select className="fp-select" value={value} onChange={(e) => onChange(e.target.value as YesNo)} aria-label={label}>
      <option value="">Ask me each time</option><option value="yes">Yes</option><option value="no">No</option>
    </select>
  </Field>
);

const uid = () => crypto.randomUUID();

export default function ProfileEditor({ profile, onSave }: { profile: UserProfile; onSave: (p: UserProfile) => void }) {
  const [data, setData] = useState<UserProfile>(profile);
  const [section, setSection] = useState<Section>("personal");
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // accept external updates (import, other window) only when there are no unsaved local edits
  useEffect(() => { if (!dirty.current) setData(profile); }, [profile]);

  function update<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setData((d) => {
      const next = { ...d, [key]: value };
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { onSave(next); dirty.current = false; setSaved(true); setTimeout(() => setSaved(false), 1600); }, 600);
      return next;
    });
  }
  const setAddr = (k: keyof UserProfile["address"], v: string) => update("address", { ...data.address, [k]: v });
  useEffect(() => () => clearTimeout(timer.current), []);

  const pct = profileCompleteness(data);

  return (
    <div className="fp-screen">
      <div className="fp-row">
        <div className="fp-col" style={{ flex: 1, gap: 4 }}>
          <div className="fp-row"><h1 className="fp-h1">Your profile</h1>{saved && <span className="fp-badge ok" role="status"><Check size={11} /> Saved</span>}</div>
          <div className="fp-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness"><i style={{ width: `${pct}%` }} /></div>
          <div className="fp-help">{pct}% complete · stored only on this computer</div>
        </div>
      </div>

      <Tabs<Section> label="Profile sections" value={section} onChange={setSection} tabs={[
        { id: "personal", label: "Personal", icon: <User size={13} /> }, { id: "work", label: "Work", icon: <Briefcase size={13} /> },
        { id: "prefs", label: "Prefs", icon: <SlidersHorizontal size={13} /> }, { id: "education", label: "Study", icon: <GraduationCap size={13} /> },
        { id: "custom", label: "Custom", icon: <Wand2 size={13} /> },
      ]} />

      {section === "personal" && (
        <Card><div className="fp-col" style={{ gap: 10 }}>
          <div className="fp-row"><div style={{ flex: 1 }}><TextInput label="First name" value={data.firstName} onChange={(v) => update("firstName", v)} autoComplete="given-name" /></div>
            <div style={{ flex: 1 }}><TextInput label="Last name" value={data.lastName} onChange={(v) => update("lastName", v)} autoComplete="family-name" /></div></div>
          <TextInput label="Middle name" value={data.middleName} onChange={(v) => update("middleName", v)} />
          <TextInput label="Email" type="email" value={data.email} onChange={(v) => update("email", v)} autoComplete="email" />
          <TextInput label="Phone" type="tel" value={data.phone} onChange={(v) => update("phone", v)} autoComplete="tel" />
          <TextInput label="Date of birth" type="date" value={data.dateOfBirth} onChange={(v) => update("dateOfBirth", v)} />
          <TextInput label="Street address" value={data.address.street} onChange={(v) => setAddr("street", v)} />
          <div className="fp-row"><div style={{ flex: 1 }}><TextInput label="City" value={data.address.city} onChange={(v) => setAddr("city", v)} /></div>
            <div style={{ flex: 1 }}><TextInput label="State / province" value={data.address.state} onChange={(v) => setAddr("state", v)} /></div></div>
          <div className="fp-row"><div style={{ flex: 1 }}><TextInput label="Country" value={data.address.country} onChange={(v) => setAddr("country", v)} /></div>
            <div style={{ flex: 1 }}><TextInput label="ZIP / PIN" value={data.address.zip} onChange={(v) => setAddr("zip", v)} /></div></div>
        </div></Card>
      )}

      {section === "work" && (<>
        <Card><div className="fp-col" style={{ gap: 10 }}>
          <TextInput label="Current company" value={data.currentCompany} onChange={(v) => update("currentCompany", v)} />
          <TextInput label="Current job title" value={data.currentTitle} onChange={(v) => update("currentTitle", v)} />
          <TextInput label="Total experience" placeholder="e.g. 5 years" value={data.totalExperience} onChange={(v) => update("totalExperience", v)} />
          <TextInput label="LinkedIn" value={data.linkedin} onChange={(v) => update("linkedin", v)} placeholder="linkedin.com/in/…" />
          <TextInput label="GitHub" value={data.github} onChange={(v) => update("github", v)} />
          <TextInput label="Portfolio / website" value={data.portfolio} onChange={(v) => update("portfolio", v)} />
          <ListInput label="Skills" value={data.skills} onChange={(v) => update("skills", v)} placeholder="C++, Python, Linux" />
          <ListInput label="Technologies" value={data.technologies} onChange={(v) => update("technologies", v)} placeholder="Docker, PostgreSQL" />
          <Field label="Professional summary" help="Used to draft answers — only facts you write here are ever used.">
            <textarea className="fp-textarea" rows={4} value={data.summary} onChange={(e) => update("summary", e.target.value)} aria-label="Professional summary" />
          </Field>
        </div></Card>
        <EmploymentList entries={data.employment} onChange={(e) => update("employment", e)} />
      </>)}

      {section === "prefs" && (
        <Card><div className="fp-col" style={{ gap: 10 }}>
          <div className="fp-help" style={{ marginTop: -2 }}>These are always shown for your review before they're filled.</div>
          <TextInput label="Expected salary" value={data.expectedSalary} onChange={(v) => update("expectedSalary", v)} placeholder="e.g. 30 LPA / $120,000" />
          <TextInput label="Current salary" value={data.currentSalary} onChange={(v) => update("currentSalary", v)} />
          <TextInput label="Notice period / availability" value={data.noticePeriod} onChange={(v) => update("noticePeriod", v)} placeholder="e.g. 30 days" />
          <TextInput label="Work authorization" value={data.workAuthorization} onChange={(v) => update("workAuthorization", v)} placeholder="e.g. Citizen, H-1B" />
          <YesNoSelect label="Authorized to work (where you apply)" value={data.authorizedToWork} onChange={(v) => update("authorizedToWork", v)} />
          <YesNoSelect label="Will you require visa sponsorship?" value={data.requiresSponsorship} onChange={(v) => update("requiresSponsorship", v)} />
          <YesNoSelect label="Willing to relocate?" value={data.willingToRelocate} onChange={(v) => update("willingToRelocate", v)} />
          <TextInput label="Preferred locations" value={data.preferredLocations} onChange={(v) => update("preferredLocations", v)} />
        </div></Card>
      )}

      {section === "education" && <EducationList entries={data.education} onChange={(e) => update("education", e)} />}
      {section === "custom" && <CustomList fields={data.customFields} onChange={(f) => update("customFields", f)} />}
    </div>
  );
}

function EmploymentList({ entries, onChange }: { entries: EmploymentEntry[]; onChange: (e: EmploymentEntry[]) => void }) {
  const set = (id: string, patch: Partial<EmploymentEntry>) => onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  return (
    <div className="fp-col">
      <div className="fp-row"><h2 className="fp-h2" style={{ flex: 1 }}>Employment history</h2>
        <Button size="sm" onClick={() => onChange([...entries, { id: uid(), company: "", title: "", startDate: "", endDate: "", current: entries.length === 0, description: "" }])}><Plus size={13} /> Add job</Button></div>
      {entries.length === 0 && <EmptyState icon={<Briefcase size={22} />} title="No jobs added" body="Add your most recent job first. Forms with a work-history section will be filled in order." />}
      {entries.map((e, i) => (
        <Card key={e.id} tight><div className="fp-col" style={{ gap: 8 }}>
          <div className="fp-row"><span className="fp-eyebrow" style={{ flex: 1 }}>{i === 0 ? "Most recent" : `Job ${i + 1}`}</span>
            <Button variant="ghost" icon size="sm" aria-label={`Remove job ${i + 1}`} onClick={() => onChange(entries.filter((x) => x.id !== e.id))}><Trash2 size={14} /></Button></div>
          <TextInput label="Company" value={e.company} onChange={(v) => set(e.id, { company: v })} />
          <TextInput label="Title" value={e.title} onChange={(v) => set(e.id, { title: v })} />
          <div className="fp-row"><div style={{ flex: 1 }}><TextInput label="Start" type="month" value={e.startDate} onChange={(v) => set(e.id, { startDate: v })} /></div>
            <div style={{ flex: 1 }}><TextInput label="End" type="month" value={e.endDate ?? ""} disabled={e.current} onChange={(v) => set(e.id, { endDate: v })} /></div></div>
          <label className="fp-row"><input type="checkbox" checked={e.current} onChange={(ev) => set(e.id, { current: ev.target.checked, endDate: ev.target.checked ? null : e.endDate })} /> I currently work here</label>
          <Field label="What you did"><textarea className="fp-textarea" rows={3} value={e.description} onChange={(ev) => set(e.id, { description: ev.target.value })} aria-label="Job description" /></Field>
        </div></Card>
      ))}
    </div>
  );
}

function EducationList({ entries, onChange }: { entries: EducationEntry[]; onChange: (e: EducationEntry[]) => void }) {
  const set = (id: string, patch: Partial<EducationEntry>) => onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  return (
    <div className="fp-col">
      <div className="fp-row"><h2 className="fp-h2" style={{ flex: 1 }}>Education</h2>
        <Button size="sm" onClick={() => onChange([...entries, { id: uid(), institution: "", degree: "", field: "", startDate: "", endDate: "", gpa: "", certifications: [] }])}><Plus size={13} /> Add</Button></div>
      {entries.length === 0 && <EmptyState icon={<GraduationCap size={22} />} title="No education added" body="Add your highest qualification first — forms use the first entry for 'University', 'Degree' and 'GPA'." />}
      {entries.map((e, i) => (
        <Card key={e.id} tight><div className="fp-col" style={{ gap: 8 }}>
          <div className="fp-row"><span className="fp-eyebrow" style={{ flex: 1 }}>{i === 0 ? "Highest / latest" : `Entry ${i + 1}`}</span>
            <Button variant="ghost" icon size="sm" aria-label={`Remove education ${i + 1}`} onClick={() => onChange(entries.filter((x) => x.id !== e.id))}><Trash2 size={14} /></Button></div>
          <TextInput label="Institution" value={e.institution} onChange={(v) => set(e.id, { institution: v })} />
          <div className="fp-row"><div style={{ flex: 1 }}><TextInput label="Degree" value={e.degree} onChange={(v) => set(e.id, { degree: v })} placeholder="B.Tech" /></div>
            <div style={{ flex: 1 }}><TextInput label="Field of study" value={e.field} onChange={(v) => set(e.id, { field: v })} /></div></div>
          <div className="fp-row"><div style={{ flex: 1 }}><TextInput label="Start year" value={e.startDate} onChange={(v) => set(e.id, { startDate: v })} /></div>
            <div style={{ flex: 1 }}><TextInput label="End year" value={e.endDate} onChange={(v) => set(e.id, { endDate: v })} /></div></div>
          <TextInput label="GPA / CGPA" value={e.gpa} onChange={(v) => set(e.id, { gpa: v })} />
        </div></Card>
      ))}
    </div>
  );
}

function CustomList({ fields, onChange }: { fields: CustomField[]; onChange: (f: CustomField[]) => void }) {
  const set = (i: number, patch: Partial<CustomField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="fp-col">
      <div className="fp-row"><h2 className="fp-h2" style={{ flex: 1 }}>Custom fields</h2>
        <Button size="sm" onClick={() => onChange([...fields, { key: "", label: "", value: "" }])}><Plus size={13} /> Add</Button></div>
      <div className="fp-help">Anything forms ask that isn't covered above. Matched by the label text.</div>
      {fields.length === 0 && <EmptyState icon={<Wand2 size={22} />} title="No custom fields" body="For example “Favourite editor”, “Referral code” or “Passport country” — add a label and a value." />}
      {fields.map((f, i) => (
        <Card key={i} tight><div className="fp-col" style={{ gap: 8 }}>
          <TextInput label="Question label" value={f.label} onChange={(v) => set(i, { label: v, key: f.key || v.toLowerCase().replace(/\W+/g, "_") })} placeholder="e.g. Referral code" />
          <TextInput label="Your answer" value={f.value} onChange={(v) => set(i, { value: v })} />
          <Button variant="ghost" size="sm" onClick={() => onChange(fields.filter((_, j) => j !== i))}><Trash2 size={13} /> Remove</Button>
        </div></Card>
      ))}
    </div>
  );
}
