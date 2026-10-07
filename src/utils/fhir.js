/**
 * Small helpers for reading dhroxy FHIR output.
 *
 * Kept tolerant of both older and newer dhroxy versions:
 * - CPR identifier system changed from 'urn:dk:cpr' to the DK Core OID
 *   'urn:oid:1.2.208.176.1.2'.
 * - Lab values without a unit are now returned as valueString instead of
 *   valueQuantity, even when the text is a plain number.
 */

export const CPR_SYSTEMS = ['urn:oid:1.2.208.176.1.2', 'urn:dk:cpr'];

/** CPR number from a Patient (or any resource with identifier[]), or ''. */
export const getCpr = (resource) =>
  resource?.identifier?.find((id) => CPR_SYSTEMS.includes(id.system))?.value || '';

const NUMERIC = /^-?\d+(?:[.,]\d+)?$/;

/**
 * Value of an Observation as { value, unit, isNumeric }, or null if it has none.
 * Numeric text in valueString (e.g. "5.2") is returned as a number.
 */
export const getObservationValue = (obs) => {
  if (!obs) return null;
  const q = obs.valueQuantity;
  if (q?.value !== undefined && q?.value !== null) {
    return { value: q.value, unit: q.unit || q.code || '', isNumeric: true };
  }
  const s = typeof obs.valueString === 'string' ? obs.valueString.trim() : '';
  if (s) {
    if (NUMERIC.test(s)) {
      return { value: Number(s.replace(',', '.')), unit: '', isNumeric: true };
    }
    return { value: s, unit: '', isNumeric: false };
  }
  return null;
};

/** Numeric value of an Observation, or undefined. */
export const getNumericValue = (obs) => {
  const v = getObservationValue(obs);
  return v?.isNumeric ? v.value : undefined;
};

/** Unit of an Observation value ('' when none). */
export const getValueUnit = (obs) => getObservationValue(obs)?.unit || '';

/** dhroxy DocumentReference ids are 'doc-epikrise-…' or 'doc-notat-…'. */
export const isEpikrise = (doc) => typeof doc?.id === 'string' && doc.id.startsWith('doc-epikrise-');
export const isNotat = (doc) => typeof doc?.id === 'string' && doc.id.startsWith('doc-notat-');
