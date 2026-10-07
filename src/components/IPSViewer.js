import React, { useState } from 'react';
import {
  FileText,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Heart,
  Pill,
  Shield,
  Syringe,
  FlaskConical,
  Info,
  Calendar,
  User
} from 'lucide-react';
import sundhedDkService from '../services/sundhedDkService';
import PersonSelector from './PersonSelector';

const SECTION_CONFIG = {
  '11450-4': { label: 'Problemer / Diagnoser', icon: Heart, color: 'red', gradient: 'from-red-500 to-rose-600' },
  '10160-0': { label: 'Medicin', icon: Pill, color: 'purple', gradient: 'from-purple-500 to-violet-600' },
  '48765-2': { label: 'Allergier', icon: Shield, color: 'amber', gradient: 'from-amber-500 to-orange-600' },
  '11369-6': { label: 'Vaccinationer', icon: Syringe, color: 'green', gradient: 'from-green-500 to-emerald-600' },
  '30954-2': { label: 'Laboratorieresultater', icon: FlaskConical, color: 'blue', gradient: 'from-blue-500 to-cyan-600' },
};

const IPSViewer = () => {
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [ipsBundle, setIpsBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});

  const toggleSection = (code) => {
    setExpandedSections(prev => ({ ...prev, [code]: !prev[code] }));
  };

  const fetchIPS = async () => {
    if (!selectedPerson?.id) {
      setError('Vælg en person først');
      return;
    }
    setLoading(true);
    setError(null);
    setIpsBundle(null);
    try {
      const result = await sundhedDkService.getPatientSummary(selectedPerson.id);
      if (result.success) {
        const parsed = parseIpsBundle(result.data);
        setIpsBundle(parsed);
        // Auto-expand all sections
        const expanded = {};
        parsed.sections.forEach(s => { expanded[s.code] = true; });
        setExpandedSections(expanded);
      } else if (result.status === 400 && /does not match the clinical session/i.test(result.diagnostics || '')) {
        // Newer dhroxy only builds a summary for the person logged in on sundhed.dk
        setError('Patientresuméet kan kun hentes for den person, der er logget ind på sundhed.dk. Vælg dig selv i personvælgeren og prøv igen.');
      } else {
        setError(result.error || 'Kunne ikke hente IPS');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const parseIpsBundle = (bundle) => {
    if (!bundle || bundle.resourceType !== 'Bundle') {
      return { composition: null, patient: null, sections: [], metadata: {} };
    }

    // Build fullUrl -> resource map
    const resourceMap = {};
    (bundle.entry || []).forEach(entry => {
      if (entry.fullUrl && entry.resource) {
        resourceMap[entry.fullUrl] = entry.resource;
      }
    });

    // Find Composition
    const compositionEntry = (bundle.entry || []).find(
      e => e.resource?.resourceType === 'Composition'
    );
    const composition = compositionEntry?.resource || null;

    // Find Patient
    const patientEntry = (bundle.entry || []).find(
      e => e.resource?.resourceType === 'Patient'
    );
    const patient = patientEntry?.resource || null;

    // Resolve sections
    const sections = (composition?.section || []).map(section => {
      const code = section.code?.coding?.[0]?.code || 'unknown';
      const title = section.title || SECTION_CONFIG[code]?.label || code;

      // Resolve references to actual resources
      const resources = (section.entry || []).map(ref => {
        const reference = ref.reference;
        // Try direct fullUrl match
        if (resourceMap[reference]) return resourceMap[reference];
        // Try matching by relative reference (e.g. "Condition/123")
        const match = Object.entries(resourceMap).find(([url]) =>
          url.endsWith('/' + reference) || url === reference
        );
        return match ? match[1] : { _unresolved: reference };
      });

      return { code, title, resources, text: section.text };
    });

    // Metadata
    const metadata = {
      title: composition?.title || 'International Patient Summary',
      date: composition?.date,
      author: composition?.author?.[0]?.display || '',
      status: composition?.status,
    };

    return { composition, patient, sections, metadata };
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('da-DK', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isNoKnownEntry = (resource) => {
    const codings = resource.code?.coding || [];
    return codings.some(c =>
      c.system?.includes('absent-unknown-uv-ips') ||
      c.code?.startsWith('no-known-')
    );
  };

  const getPatientName = (patient) => {
    if (!patient) return '';
    const name = patient.name?.[0];
    if (!name) return '';
    const given = name.given?.join(' ') || '';
    const family = name.family || '';
    return `${given} ${family}`.trim();
  };

  // --- Section renderers ---

  const renderCondition = (resource, index) => {
    if (isNoKnownEntry(resource)) {
      return renderNoKnownInfo('Ingen kendte problemer registreret', index);
    }
    const display = resource.code?.coding?.[0]?.display || resource.code?.text || 'Ukendt';
    const clinicalStatus = resource.clinicalStatus?.coding?.[0]?.code;
    const onset = resource.onsetDateTime || resource.onsetPeriod?.start;
    const abatement = resource.abatementDateTime || resource.abatementPeriod?.start;

    return (
      <div key={index} className="flex items-start gap-4 p-4 bg-gradient-to-r from-red-50 to-rose-50 rounded-xl border border-red-200">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center flex-shrink-0">
          <Heart className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between mb-1">
            <h4 className="font-semibold text-slate-800">{display}</h4>
            {clinicalStatus && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                clinicalStatus === 'active' ? 'bg-red-100 text-red-700' :
                clinicalStatus === 'resolved' ? 'bg-green-100 text-green-700' :
                'bg-slate-100 text-slate-700'
              }`}>
                {clinicalStatus === 'active' ? 'Aktiv' : clinicalStatus === 'resolved' ? 'Ophørt' : clinicalStatus}
              </span>
            )}
          </div>
          <div className="flex gap-4 text-xs text-slate-500 mt-1">
            {onset && <span>Start: {formatDate(onset)}</span>}
            {abatement && <span>Ophørt: {formatDate(abatement)}</span>}
          </div>
        </div>
      </div>
    );
  };

  const renderMedication = (resource, index) => {
    if (isNoKnownEntry(resource)) {
      return renderNoKnownInfo('Ingen kendte medicin ordinationer registreret', index);
    }
    const drugName =
      resource.medicationCodeableConcept?.coding?.[0]?.display ||
      resource.medicationCodeableConcept?.text ||
      resource.medicationReference?.display ||
      'Ukendt medicin';
    const status = resource.status;
    const dosage = resource.dosage?.[0]?.text || '';
    const periodStart = resource.effectivePeriod?.start;
    const periodEnd = resource.effectivePeriod?.end;

    return (
      <div key={index} className="flex items-start gap-4 p-4 bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl border border-purple-200">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center flex-shrink-0">
          <Pill className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between mb-1">
            <h4 className="font-semibold text-slate-800">{drugName}</h4>
            {status && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                status === 'active' ? 'bg-purple-100 text-purple-700' :
                status === 'completed' ? 'bg-green-100 text-green-700' :
                'bg-slate-100 text-slate-700'
              }`}>
                {status === 'active' ? 'Aktiv' : status === 'completed' ? 'Afsluttet' : status}
              </span>
            )}
          </div>
          {dosage && <p className="text-sm text-slate-600">{dosage}</p>}
          <div className="flex gap-4 text-xs text-slate-500 mt-1">
            {periodStart && <span>Fra: {formatDate(periodStart)}</span>}
            {periodEnd && <span>Til: {formatDate(periodEnd)}</span>}
          </div>
        </div>
      </div>
    );
  };

  const renderAllergy = (resource, index) => {
    // Allergies are typically marked unavailable from sundhed.dk
    const codings = resource.code?.coding || [];
    const isUnavailable = codings.some(c =>
      c.system?.includes('absent-unknown-uv-ips') ||
      c.code?.startsWith('no-known-') ||
      c.code === 'no-allergy-info'
    );

    if (isUnavailable || isNoKnownEntry(resource)) {
      return (
        <div key={index} className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-amber-900 font-medium">Allergioplysninger ikke tilgængelige</p>
            <p className="text-xs text-amber-700 mt-1">
              Allergidata er ikke tilgængelig fra sundhed.dk
            </p>
          </div>
        </div>
      );
    }

    const display = resource.code?.coding?.[0]?.display || resource.code?.text || 'Ukendt allergi';
    return (
      <div key={index} className="flex items-start gap-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-slate-800">{display}</h4>
        </div>
      </div>
    );
  };

  const renderImmunization = (resource, index) => {
    if (isNoKnownEntry(resource)) {
      return renderNoKnownInfo('Ingen kendte vaccinationer registreret', index);
    }
    const vaccine =
      resource.vaccineCode?.coding?.[0]?.display ||
      resource.vaccineCode?.text ||
      'Ukendt vaccine';
    const date = resource.occurrenceDateTime || resource.occurrenceString;
    const status = resource.status;
    const performer = resource.performer?.[0]?.actor?.display || '';

    return (
      <div key={index} className="flex items-start gap-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
          <Syringe className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between mb-1">
            <h4 className="font-semibold text-slate-800">{vaccine}</h4>
            {status && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
              }`}>
                {status === 'completed' ? 'Gennemført' : status}
              </span>
            )}
          </div>
          <div className="flex gap-4 text-xs text-slate-500 mt-1">
            {date && <span>{formatDate(date)}</span>}
            {performer && <span>{performer}</span>}
          </div>
        </div>
      </div>
    );
  };

  const renderObservation = (resource, index) => {
    if (isNoKnownEntry(resource)) {
      return renderNoKnownInfo('Ingen kendte laboratorieresultater registreret', index);
    }
    const testName = resource.code?.coding?.[0]?.display || resource.code?.text || 'Ukendt test';
    const value = resource.valueQuantity?.value;
    const unit = resource.valueQuantity?.unit || resource.valueQuantity?.code || '';
    const refRange = resource.referenceRange?.[0];
    const refText = refRange?.text ||
      (refRange?.low && refRange?.high ? `${refRange.low.value} - ${refRange.high.value} ${refRange.high.unit || ''}` : '');
    const date = resource.effectiveDateTime || resource.effectivePeriod?.start;
    const status = resource.status;

    return (
      <div key={index} className="flex items-start gap-4 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
          <FlaskConical className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between mb-1">
            <h4 className="font-semibold text-slate-800">{testName}</h4>
            {status && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                status === 'final' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {status === 'final' ? 'Færdig' : status}
              </span>
            )}
          </div>
          {value != null && (
            <p className="text-xl font-bold text-blue-600 mb-0.5">
              {value} {unit}
            </p>
          )}
          <div className="flex gap-4 text-xs text-slate-500 mt-1">
            {date && <span>{formatDate(date)}</span>}
            {refText && <span>Ref: {refText}</span>}
          </div>
        </div>
      </div>
    );
  };

  const renderNoKnownInfo = (message, index) => (
    <div key={index} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3">
      <Info className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
      <p className="text-sm text-slate-600">{message}</p>
    </div>
  );

  const renderSectionResources = (section) => {
    if (!section.resources || section.resources.length === 0) {
      return <p className="text-sm text-slate-500 italic">Ingen data i denne sektion</p>;
    }

    return section.resources.map((resource, index) => {
      if (resource._unresolved) {
        return (
          <div key={index} className="p-3 bg-slate-50 rounded-lg text-sm text-slate-500">
            Kunne ikke opslå: {resource._unresolved}
          </div>
        );
      }

      switch (section.code) {
        case '11450-4': return renderCondition(resource, index);
        case '10160-0': return renderMedication(resource, index);
        case '48765-2': return renderAllergy(resource, index);
        case '11369-6': return renderImmunization(resource, index);
        case '30954-2': return renderObservation(resource, index);
        default:
          return (
            <div key={index} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-sm font-medium text-slate-700">
                {resource.resourceType || 'Ukendt ressource'}
              </p>
              <pre className="text-xs text-slate-500 mt-2 whitespace-pre-wrap">
                {JSON.stringify(resource, null, 2)}
              </pre>
            </div>
          );
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top card: Person selector + fetch button */}
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-xl border border-teal-100">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-800">
              International Patient Summary (IPS)
            </h2>
            <p className="text-slate-500 text-sm">
              Konsolideret sundhedsoversigt via FHIR $summary
            </p>
          </div>
        </div>

        <div className="flex items-end gap-4">
          <div className="flex-1">
            <PersonSelector
              selectedPerson={selectedPerson}
              onPersonSelected={setSelectedPerson}
            />
          </div>
          <button
            onClick={fetchIPS}
            disabled={loading || !selectedPerson}
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2 font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Henter...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                Hent IPS
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-900">{error}</p>
          </div>
        )}
      </div>

      {/* IPS Content */}
      {ipsBundle && (
        <>
          {/* Metadata header */}
          <div className="bg-gradient-to-r from-indigo-500 to-blue-600 rounded-3xl p-8 text-white">
            <h3 className="text-2xl font-bold mb-2">{ipsBundle.metadata.title}</h3>
            <div className="flex flex-wrap gap-6 text-indigo-100 text-sm">
              {ipsBundle.patient && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>{getPatientName(ipsBundle.patient)}</span>
                </div>
              )}
              {ipsBundle.metadata.date && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(ipsBundle.metadata.date)}</span>
                </div>
              )}
              {ipsBundle.metadata.author && (
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span>{ipsBundle.metadata.author}</span>
                </div>
              )}
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-4">
            {ipsBundle.sections.map((section) => {
              const config = SECTION_CONFIG[section.code] || {
                label: section.title,
                icon: FileText,
                color: 'slate',
                gradient: 'from-slate-500 to-slate-600'
              };
              const Icon = config.icon;
              const isExpanded = expandedSections[section.code];

              return (
                <div
                  key={section.code}
                  className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-slate-100 overflow-hidden"
                >
                  <button
                    onClick={() => toggleSection(section.code)}
                    className="w-full p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold text-slate-800 text-lg">{section.title}</h3>
                      <p className="text-sm text-slate-500">
                        {section.resources.length} {section.resources.length === 1 ? 'post' : 'poster'}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-100 p-5 bg-slate-50/50 space-y-3">
                      {renderSectionResources(section)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Empty state */}
      {!ipsBundle && !loading && !error && (
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-12 shadow-xl border border-slate-100 text-center">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-800 mb-2">
            Ingen IPS hentet endnu
          </h3>
          <p className="text-slate-500">
            Vælg en person og klik "Hent IPS" for at se den konsoliderede sundhedsoversigt
          </p>
        </div>
      )}
    </div>
  );
};

export default IPSViewer;
