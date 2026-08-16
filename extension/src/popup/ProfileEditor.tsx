import React, { useRef, useState } from "react";
import { UserProfile, EmploymentEntry, EducationEntry, CustomField, defaultProfile } from "../shared/types";
import { Plus, Trash2, Save, Download, Upload } from "lucide-react";

interface Props {
  profile: UserProfile;
  onSave: (p: UserProfile) => void;
}

type Section = "personal" | "professional" | "employment" | "education" | "custom";

export default function ProfileEditor({ profile, onSave }: Props) {
  const [data, setData] = useState<UserProfile>(profile);
  const [activeSection, setActiveSection] = useState<Section>("personal");
  const [saved, setSaved] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function updateAddress(key: keyof UserProfile["address"], value: string) {
    setData((d) => ({ ...d, address: { ...d.address, [key]: value } }));
  }

  function handleSave() {
    onSave(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `formpilot-profile-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const merged: UserProfile = { ...defaultProfile, ...parsed, updatedAt: new Date().toISOString() };
        setData(merged);
        onSave(merged);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch { /* ignore */ } finally {
        if (importRef.current) importRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  const sections: { id: Section; label: string }[] = [
    { id: "personal", label: "Personal" },
    { id: "professional", label: "Professional" },
    { id: "employment", label: "Employment" },
    { id: "education", label: "Education" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Section pill tabs */}
      <div className="flex overflow-x-auto px-3 gap-1.5 py-2" style={{ scrollbarWidth: "none" }}>
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-all ${
              activeSection === s.id
                ? "text-white border-transparent"
                : "text-gray-500 border-gray-200 bg-white hover:border-brand-300 hover:text-brand-600"
            }`}
            style={activeSection === s.id ? { background: "linear-gradient(135deg,#6366f1,#8b5cf6)" } : {}}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {activeSection === "personal" && (
          <PersonalSection data={data} update={update} updateAddress={updateAddress} />
        )}
        {activeSection === "professional" && (
          <ProfessionalSection data={data} update={update} />
        )}
        {activeSection === "employment" && (
          <EmploymentSection entries={data.employment} onChange={(e) => update("employment", e)} />
        )}
        {activeSection === "education" && (
          <EducationSection entries={data.education} onChange={(e) => update("education", e)} />
        )}
        {activeSection === "custom" && (
          <CustomSection fields={data.customFields} onChange={(f) => update("customFields", f)} />
        )}
      </div>

      <div className="shrink-0 px-4 py-3 border-t border-gray-100 space-y-2">
        <button
          onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 text-white text-[13px] font-bold py-3 rounded-2xl transition-all active:scale-95"
          style={saved
            ? { background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 4px 18px rgba(16,185,129,0.4)" }
            : { background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 4px 18px rgba(99,102,241,0.4)" }
          }
        >
          <Save size={15} />
          {saved ? "Profile Saved!" : "Save Profile"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold border transition-all active:scale-95"
            style={{ borderColor: "rgba(99,102,241,0.25)", color: "#6366f1", background: "rgba(99,102,241,0.06)" }}
          >
            <Download size={12} /> Export JSON
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold border transition-all active:scale-95"
            style={{ borderColor: "rgba(99,102,241,0.25)", color: "#6366f1", background: "rgba(99,102,241,0.06)" }}
          >
            <Upload size={12} /> Import JSON
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>
      </div>
    </div>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "input-water";

function PersonalSection({
  data,
  update,
  updateAddress,
}: {
  data: UserProfile;
  update: <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => void;
  updateAddress: (k: keyof UserProfile["address"], v: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First Name">
          <input className={inputCls} value={data.firstName} onChange={(e) => update("firstName", e.target.value)} />
        </Field>
        <Field label="Last Name">
          <input className={inputCls} value={data.lastName} onChange={(e) => update("lastName", e.target.value)} />
        </Field>
      </div>
      <Field label="Middle Name">
        <input className={inputCls} value={data.middleName} onChange={(e) => update("middleName", e.target.value)} />
      </Field>
      <Field label="Email">
        <input type="email" className={inputCls} value={data.email} onChange={(e) => update("email", e.target.value)} />
      </Field>
      <Field label="Phone">
        <input type="tel" className={inputCls} value={data.phone} onChange={(e) => update("phone", e.target.value)} />
      </Field>
      <Field label="Date of Birth">
        <input type="date" className={inputCls} value={data.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} />
      </Field>
      <div className="pt-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Address</div>
      <Field label="Street">
        <input className={inputCls} value={data.address.street} onChange={(e) => updateAddress("street", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <input className={inputCls} value={data.address.city} onChange={(e) => updateAddress("city", e.target.value)} />
        </Field>
        <Field label="State">
          <input className={inputCls} value={data.address.state} onChange={(e) => updateAddress("state", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Country">
          <input className={inputCls} value={data.address.country} onChange={(e) => updateAddress("country", e.target.value)} />
        </Field>
        <Field label="ZIP/PIN">
          <input className={inputCls} value={data.address.zip} onChange={(e) => updateAddress("zip", e.target.value)} />
        </Field>
      </div>
    </>
  );
}

function ProfessionalSection({
  data,
  update,
}: {
  data: UserProfile;
  update: <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => void;
}) {
  return (
    <>
      <Field label="Current Company">
        <input className={inputCls} value={data.currentCompany} onChange={(e) => update("currentCompany", e.target.value)} />
      </Field>
      <Field label="Current Title">
        <input className={inputCls} value={data.currentTitle} onChange={(e) => update("currentTitle", e.target.value)} />
      </Field>
      <Field label="Total Experience">
        <input className={inputCls} placeholder="e.g. 5 years" value={data.totalExperience} onChange={(e) => update("totalExperience", e.target.value)} />
      </Field>
      <Field label="LinkedIn URL">
        <input type="url" className={inputCls} value={data.linkedin} onChange={(e) => update("linkedin", e.target.value)} />
      </Field>
      <Field label="GitHub URL">
        <input type="url" className={inputCls} value={data.github} onChange={(e) => update("github", e.target.value)} />
      </Field>
      <Field label="Portfolio URL">
        <input type="url" className={inputCls} value={data.portfolio} onChange={(e) => update("portfolio", e.target.value)} />
      </Field>
      <Field label="Skills (comma-separated)">
        <textarea
          className={inputCls}
          rows={2}
          value={data.skills.join(", ")}
          onChange={(e) => update("skills", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        />
      </Field>
      <Field label="Technologies (comma-separated)">
        <textarea
          className={inputCls}
          rows={2}
          value={data.technologies.join(", ")}
          onChange={(e) => update("technologies", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        />
      </Field>
      <Field label="Professional Summary">
        <textarea className={`${inputCls} resize-none`} rows={4} value={data.summary} onChange={(e) => update("summary", e.target.value)} />
      </Field>
    </>
  );
}

function EmploymentSection({
  entries,
  onChange,
}: {
  entries: EmploymentEntry[];
  onChange: (e: EmploymentEntry[]) => void;
}) {
  function addEntry() {
    onChange([
      ...entries,
      {
        id: crypto.randomUUID(),
        company: "",
        title: "",
        startDate: "",
        endDate: null,
        current: false,
        description: "",
      },
    ]);
  }

  function updateEntry(id: string, key: keyof EmploymentEntry, value: unknown) {
    onChange(entries.map((e) => (e.id === id ? { ...e, [key]: value } : e)));
  }

  function removeEntry(id: string) {
    onChange(entries.filter((e) => e.id !== id));
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <div key={entry.id} className="border border-brand-100 bg-brand-50/30 rounded-2xl p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold text-brand-700">{entry.company || "New Entry"}</span>
            <button onClick={() => removeEntry(entry.id)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
          <Field label="Company">
            <input className={inputCls} value={entry.company} onChange={(e) => updateEntry(entry.id, "company", e.target.value)} />
          </Field>
          <Field label="Title">
            <input className={inputCls} value={entry.title} onChange={(e) => updateEntry(entry.id, "title", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start">
              <input type="month" className={inputCls} value={entry.startDate} onChange={(e) => updateEntry(entry.id, "startDate", e.target.value)} />
            </Field>
            <Field label="End">
              <input type="month" className={inputCls} value={entry.endDate || ""} disabled={entry.current} onChange={(e) => updateEntry(entry.id, "endDate", e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={entry.current} onChange={(e) => updateEntry(entry.id, "current", e.target.checked)} />
            Current position
          </label>
          <Field label="Description">
            <textarea className={`${inputCls} resize-none`} rows={2} value={entry.description} onChange={(e) => updateEntry(entry.id, "description", e.target.value)} />
          </Field>
        </div>
      ))}
      <button onClick={addEntry} className="flex items-center gap-1.5 text-brand-600 text-[12px] font-bold hover:text-brand-700 transition-colors">
        <Plus size={16} /> Add Employment
      </button>
    </div>
  );
}

function EducationSection({
  entries,
  onChange,
}: {
  entries: EducationEntry[];
  onChange: (e: EducationEntry[]) => void;
}) {
  function addEntry() {
    onChange([
      ...entries,
      { id: crypto.randomUUID(), institution: "", degree: "", field: "", startDate: "", endDate: "", gpa: "", certifications: [] },
    ]);
  }

  function updateEntry(id: string, key: keyof EducationEntry, value: unknown) {
    onChange(entries.map((e) => (e.id === id ? { ...e, [key]: value } : e)));
  }

  function removeEntry(id: string) {
    onChange(entries.filter((e) => e.id !== id));
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <div key={entry.id} className="border border-violet-100 bg-violet-50/30 rounded-2xl p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold text-violet-700">{entry.institution || "New Entry"}</span>
            <button onClick={() => removeEntry(entry.id)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
          <Field label="Institution">
            <input className={inputCls} value={entry.institution} onChange={(e) => updateEntry(entry.id, "institution", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Degree">
              <input className={inputCls} value={entry.degree} onChange={(e) => updateEntry(entry.id, "degree", e.target.value)} />
            </Field>
            <Field label="Field of Study">
              <input className={inputCls} value={entry.field} onChange={(e) => updateEntry(entry.id, "field", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start Year">
              <input type="month" className={inputCls} value={entry.startDate} onChange={(e) => updateEntry(entry.id, "startDate", e.target.value)} />
            </Field>
            <Field label="End Year">
              <input type="month" className={inputCls} value={entry.endDate} onChange={(e) => updateEntry(entry.id, "endDate", e.target.value)} />
            </Field>
          </div>
          <Field label="GPA / CGPA">
            <input className={inputCls} value={entry.gpa} onChange={(e) => updateEntry(entry.id, "gpa", e.target.value)} />
          </Field>
        </div>
      ))}
      <button onClick={addEntry} className="flex items-center gap-1.5 text-brand-600 text-[12px] font-bold hover:text-brand-700 transition-colors">
        <Plus size={16} /> Add Education
      </button>
    </div>
  );
}

function CustomSection({
  fields,
  onChange,
}: {
  fields: CustomField[];
  onChange: (f: CustomField[]) => void;
}) {
  function addField() {
    onChange([...fields, { key: "", label: "", value: "" }]);
  }

  function updateField(idx: number, key: keyof CustomField, value: string) {
    onChange(fields.map((f, i) => (i === idx ? { ...f, [key]: value } : f)));
  }

  function removeField(idx: number) {
    onChange(fields.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Add any extra information you want FormPilot to use when filling forms.
      </p>
      {fields.map((field, idx) => (
        <div key={idx} className="border border-amber-100 bg-amber-50/30 rounded-2xl p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold text-amber-700">Custom Field {idx + 1}</span>
            <button onClick={() => removeField(idx)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Key (identifier)">
              <input className={inputCls} placeholder="notice_period" value={field.key} onChange={(e) => updateField(idx, "key", e.target.value)} />
            </Field>
            <Field label="Label (display)">
              <input className={inputCls} placeholder="Notice Period" value={field.label} onChange={(e) => updateField(idx, "label", e.target.value)} />
            </Field>
          </div>
          <Field label="Value">
            <input className={inputCls} placeholder="60 days" value={field.value} onChange={(e) => updateField(idx, "value", e.target.value)} />
          </Field>
        </div>
      ))}
      <button onClick={addField} className="flex items-center gap-1 text-brand-600 text-sm font-medium hover:text-brand-700">
        <Plus size={16} /> Add Custom Field
      </button>
    </div>
  );
}
