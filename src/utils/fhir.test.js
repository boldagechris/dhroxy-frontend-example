import { getCpr, getObservationValue, getNumericValue, isEpikrise, isNotat } from './fhir';

describe('getCpr', () => {
  it('reads the DK Core CPR system used by current dhroxy', () => {
    const patient = { identifier: [{ system: 'urn:oid:1.2.208.176.1.2', value: '0101900000' }] };
    expect(getCpr(patient)).toBe('0101900000');
  });

  it('still reads the legacy urn:dk:cpr system', () => {
    const patient = { identifier: [{ system: 'urn:dk:cpr', value: '0101900000' }] };
    expect(getCpr(patient)).toBe('0101900000');
  });

  it('returns empty string when there is no CPR', () => {
    expect(getCpr({})).toBe('');
    expect(getCpr({ identifier: [{ system: 'http://cvr.dk', value: '12345678' }] })).toBe('');
  });
});

describe('getObservationValue', () => {
  it('reads valueQuantity', () => {
    expect(getObservationValue({ valueQuantity: { value: 4.2, unit: 'mmol/L' } }))
      .toEqual({ value: 4.2, unit: 'mmol/L', isNumeric: true });
  });

  it('keeps a zero value', () => {
    expect(getNumericValue({ valueQuantity: { value: 0, unit: 'mg/L' } })).toBe(0);
  });

  it('treats unitless numeric valueString as a number', () => {
    expect(getObservationValue({ valueString: '12' })).toEqual({ value: 12, unit: '', isNumeric: true });
    expect(getNumericValue({ valueString: '1,5' })).toBe(1.5);
  });

  it('keeps text values as text', () => {
    expect(getObservationValue({ valueString: 'Ikke påvist' }))
      .toEqual({ value: 'Ikke påvist', unit: '', isNumeric: false });
    expect(getNumericValue({ valueString: 'Ikke påvist' })).toBeUndefined();
  });

  it('returns null when there is no value', () => {
    expect(getObservationValue({})).toBeNull();
  });
});

describe('document kinds', () => {
  it('tells epikriser and notater apart by dhroxy id', () => {
    expect(isEpikrise({ id: 'doc-epikrise-abc-0' })).toBe(true);
    expect(isNotat({ id: 'doc-notat-abc-0' })).toBe(true);
    expect(isEpikrise({ id: 'doc-notat-abc-0' })).toBe(false);
  });
});
