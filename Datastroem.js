import React, { useEffect, useMemo, useState } from 'react';
import {
  Waves, FlaskConical, ClipboardList, Pill, Syringe, Calendar, User,
  Info, RotateCcw, CheckCircle2, HelpCircle, Ban
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Datastroem ("Din datastrøm")
//
// Patient-facing view of which FHIR resources dhroxy is able to fetch from
// sundhed.dk right now, laid out as a small appscape-style diagram, next to a
// place for the patient to record — per resource type — whether they want it
// shared with their healthcare provider.
//
// Two independent things are tracked per resource type:
//   - "teknisk status": did the last fetch for this resource type succeed?
//     (this is observed directly from patientData, not self-reported)
//   - "samtykke": what the patient says they want (tilladt / uafklaret /
//     blokeret) — stored locally, independent of whether the plumbing works.
//
// The distinction matters: data that a patient wants to share but that the
// infrastructure fails to move ("sticky") is a different problem from data
// flowing to a use the patient hasn't reviewed or agreed to ("leaky"). See
// Klausen & Lomborg (2026), Social Theory & Health, for the source framing.
//
// NB: dhroxy only proxies sundhed.dk itself — it has no visibility into
// third-party SDKs embedded in sundhed.dk's own app/web infrastructure, so
// this view does not (and should not pretend to) show a "leaky data" column.
// That would need a separate infrastructural audit; see the note at the
// bottom of this component instead of fabricating it.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'datastroem-samtykke-v1';

const RESOURCE_TYPES = [
  {
    id: 'Patient',
    label: 'Stamdata',
    icon: User,
    purpose: 'Identificerer dig entydigt, så dine øvrige data kobles korrekt sammen.',
  },
  {
    id: 'Observation',
    label: 'Prøvesvar',
    icon: FlaskConical,
    purpose: 'Bruges af din læge til at vurdere og følge din behandling.',
  },
  {
    id: 'Condition',
    label: 'Diagnoser',
    icon: ClipboardList,
    purpose: 'Danner grundlag for din behandlingsplan på tværs af afdelinger.',
  },
  {
    id: 'MedicationStatement',
    label: 'Medicin',
    icon: Pill,
    purpose: 'Sikrer at din medicinering er opdateret og undgår fejlmedicinering.',
  },
  {
    id: 'Immunization',
    label: 'Vaccinationer',
    icon: Syringe,
    purpose: 'Dokumentation for gennemførte vaccinationer.',
  },
  {
    id: 'Appointment',
    label: 'Aftaler',
    icon: Calendar,
    purpose: 'Koordinerer dine tider med sundhedsvæsenet.',
  },
];

const CONSENT_OPTIONS = [
  { value: 'tilladt', label: 'Del med behandler', icon: CheckCircle2 },
  { value: 'uafklaret', label: 'Ikke taget stilling', icon: HelpCircle },
  { value: 'blokeret', label: 'Kun til mig selv', icon: Ban },
];

function defaultConsents() {
  const out = {};
  RESOURCE_TYPES.forEach((r) => { out[r.id] = 'uafklaret'; });
  return out;
}

function loadConsents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConsents();
    const saved = JSON.parse(raw);
    return { ...defaultConsents(), ...saved };
  } catch {
    return defaultConsents();
  }
}

// Reads technical status for a resource type out of the bundle assembled by
// fetchPatientData in App.js. Expects entries of the shape
// { type: 'Patient', resource: {...} | null }. Falls back to 'ukendt' when
// the resource type isn't present at all (fetch hasn't run yet).
function technicalStatus(patientData, resourceId) {
  if (!patientData || !Array.isArray(patientData.entry)) return 'ukendt';
  const entry = patientData.entry.find((e) => e.type === resourceId);
  if (!entry) return 'ukendt';
  return entry.resource ? 'virker' : 'fejler';
}

function combinedStatus(consent, technical) {
  if (consent === 'blokeret') return 'blocked';
  if (consent === 'uafklaret') return 'leaky';
  // consent === 'tilladt'
  if (technical === 'fejler') return 'sticky';
  if (technical === 'virker') return 'flowing';
  return 'unknown';
}

const STATUS_STYLES = {
  flowing: { stroke: '#0d9488', dash: '6 6', label: 'Flyder', text: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-200' },
  sticky: { stroke: '#b45309', dash: '2 7', label: 'Sidder fast', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  leaky: { stroke: '#b91c1c', dash: '1 5', label: 'Uafklaret', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  blocked: { stroke: '#64748b', dash: '9 6', label: 'Blokeret', text: 'text-slate-500', bg: 'bg-slate-100', border: 'border-slate-200' },
  unknown: { stroke: '#94a3b8', dash: '3 5', label: 'Ikke hentet endnu', text: 'text-slate-500', bg: 'bg-slate-100', border: 'border-slate-200' },
};

const Datastroem = ({ patientData, dhroxyConnected }) => {
  const [consents, setConsents] = useState(loadConsents);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consents));
    } catch {
      // localStorage utilgængelig (privat browsing) — samtykke gemmes kun for denne session
    }
  }, [consents]);

  const rows = useMemo(() => RESOURCE_TYPES.map((r) => {
    const technical = technicalStatus(patientData, r.id);
    const consent = consents[r.id];
    const status = combinedStatus(consent, technical);
    return { ...r, technical, consent, status };
  }), [patientData, consents]);

  const setConsent = (id, value) => {
    setConsents((prev) => ({ ...prev, [id]: value }));
  };

  const resetAll = () => setConsents(defaultConsents());

  // --- diagram geometry -----------------------------------------------
  const W = 420;
  const rowH = 64;
  const topPad = 24;
  const H = topPad * 2 + rowH * rows.length;
  const xPatient = 44;
  const xHub = 200;
  const xResource = 372;
  const hubY = H / 2;

  const curve = (x1, y1, x2, y2) => {
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-xl border border-teal-100">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center">
            <Waves className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-800">Din datastrøm</h2>
        </div>
        <p className="text-slate-600 mb-8 max-w-2xl">
          Se hvilke data dhroxy rent faktisk kan hente fra sundhed.dk lige nu, og afgør selv om hver
          datatype må deles med din behandler. De to ting er uafhængige af hinanden: du kan sagtens
          sige ja til deling, selvom det (endnu) ikke virker teknisk.
        </p>

        {!dhroxyConnected && (
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-6">
            <Info className="w-4 h-4 flex-none" />
            Hent data fra Sundhed.dk under "Overblik" for at se den reelle tekniske status herunder.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Diagram */}
          <div className="lg:col-span-2">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
                 aria-label="Diagram over datastrømme fra dig via dhroxy til Sundhed.dk">
              {rows.map((r, i) => {
                const y = topPad + rowH * i + rowH / 2;
                const style = STATUS_STYLES[r.status];
                return (
                  <path key={r.id} d={curve(xHub + 16, hubY, xResource - 14, y)}
                        fill="none" stroke={style.stroke} strokeWidth="2.4"
                        strokeDasharray={style.dash} strokeLinecap="round" opacity="0.9" />
                );
              })}
              <path d={curve(xPatient + 14, hubY, xHub - 16, hubY)}
                    fill="none" stroke="#cbd5e1" strokeWidth="1.6" />

              <circle cx={xPatient} cy={hubY} r="16" fill="#0f766e" />
              <text x={xPatient} y={hubY + 4} textAnchor="middle" fontSize="11" fill="white" fontWeight="600">Dig</text>

              <circle cx={xHub} cy={hubY} r="13" fill="white" stroke="#cbd5e1" strokeWidth="1.4" />
              <text x={xHub} y={hubY - 20} textAnchor="middle" fontSize="10.5" fill="#334155" fontWeight="500">
                Sundhed.dk
              </text>
              <text x={xHub} y={hubY + 32} textAnchor="middle" fontSize="9" fill="#94a3b8">via dhroxy</text>

              {rows.map((r, i) => {
                const y = topPad + rowH * i + rowH / 2;
                return (
                  <g key={r.id}>
                    <circle cx={xResource} cy={y} r="10" fill="white" stroke="#cbd5e1" strokeWidth="1.4" />
                    <text x={xResource + 16} y={y + 3.5} fontSize="10.5" fill="#334155">{r.label}</text>
                  </g>
                );
              })}
            </svg>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs text-slate-500">
              {Object.entries(STATUS_STYLES).filter(([k]) => k !== 'unknown').map(([key, s]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-0" style={{ borderTop: `2px solid ${s.stroke}` }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="lg:col-span-3 space-y-3">
            {rows.map((r) => {
              const Icon = r.icon;
              const style = STATUS_STYLES[r.status];
              return (
                <div key={r.id} className={`rounded-2xl border ${style.border} ${style.bg} p-4`}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3 min-w-[200px]">
                      <Icon className="w-5 h-5 text-slate-500 mt-0.5 flex-none" />
                      <div>
                        <p className="font-medium text-slate-800">{r.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5 max-w-sm">{r.purpose}</p>
                        <p className={`text-xs mt-1 font-medium ${style.text}`}>
                          {r.technical === 'ukendt' ? 'Endnu ikke hentet' : r.technical === 'virker' ? 'System: virker' : 'System: fejler lige nu'}
                        </p>
                      </div>
                    </div>

                    <div className="inline-flex rounded-full border border-slate-200 overflow-hidden bg-white flex-none">
                      {CONSENT_OPTIONS.map((opt) => {
                        const active = r.consent === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setConsent(r.id, opt.value)}
                            aria-pressed={active}
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                              active
                                ? opt.value === 'tilladt'
                                  ? 'bg-teal-600 text-white'
                                  : opt.value === 'blokeret'
                                    ? 'bg-slate-500 text-white'
                                    : 'bg-red-500 text-white'
                                : 'text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
              >
                <RotateCcw className="w-4 h-4" />
                Nulstil dine valg
              </button>
              <span className="text-xs text-slate-400">Dine valg gemmes kun i denne browser</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 flex gap-3">
        <Info className="w-5 h-5 text-amber-600 flex-none mt-0.5" />
        <p className="text-sm text-amber-800">
          Denne visning viser kun forbindelsen mellem dig og sundhed.dk via dhroxy — den kender ikke
          til eventuelle tredjeparter (fx analyse- eller annonce-SDK'er) i sundhed.dk's egen
          app-infrastruktur. At vise det ærligt ville kræve en separat infrastrukturel kortlægning
          ("appscape"), ikke gætværk. Se{' '}
          <a
            href="https://doi.org/10.1057/s41285-026-00267-8"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Klausen &amp; Lomborg (2026)
          </a>{' '}
          for metoden bag begreberne sticky, leaky og flowing data, som denne visning er inspireret af.
        </p>
      </div>
    </div>
  );
};

export default Datastroem;
