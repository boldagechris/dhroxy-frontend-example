/**
 * Test fil for SundhedDkService
 *
 * For at køre tests:
 * npm test
 */

import { SundhedDkService } from './sundhedDkService';

describe('SundhedDkService', () => {
  let service;

  beforeEach(() => {
    service = new SundhedDkService('/fhir');
  });

  describe('Constructor', () => {
    it('should initialize with default base URL', () => {
      const defaultService = new SundhedDkService();
      expect(defaultService.baseUrl).toBe('/fhir');
    });

    it('should initialize with custom base URL', () => {
      const customService = new SundhedDkService('http://localhost:9999/custom');
      expect(customService.baseUrl).toBe('http://localhost:9999/custom');
    });
  });

  describe('API methods', () => {
    beforeEach(() => {
      // Mock fetch globally
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('getPatient should call correct endpoint', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resourceType: 'Patient', id: '123' })
      });

      const result = await service.getPatient();

      expect(global.fetch).toHaveBeenCalledWith(
        '/fhir/Patient',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result.success).toBe(true);
      expect(result.data.resourceType).toBe('Patient');
    });

    it('getLabResults should call correct endpoint with parameters', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resourceType: 'Bundle', total: 10 })
      });

      await service.getLabResults('KliniskBiokemi', 20);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/fhir/Observation'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('date=ge2015-01-01'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('_count=20'),
        expect.any(Object)
      );
    });

    it('should handle fetch errors gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.getPatient();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should surface OperationOutcome diagnostics on errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', diagnostics: 'Requested patient does not match the clinical session' }]
        })
      });

      const result = await service.getPatientSummary('pat-0101900000');

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.diagnostics).toContain('does not match the clinical session');
    });

    it('should handle non-ok responses', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await service.getPatient();

      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
    });

    it('getAllPatientData should fetch each resource with GET and assemble a bundle', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ resourceType: 'Bundle', type: 'searchset', entry: [] })
      });

      const result = await service.getAllPatientData({
        includeLabResults: true,
        includeConditions: true,
        includeEncounters: false,
        includeDocuments: false,
        includeMedication: false,
        includeImmunizations: false,
        includeImaging: false,
        includeAppointments: false,
        includeOrganizations: false
      });

      const urls = global.fetch.mock.calls.map(c => c[0]);
      expect(urls).toEqual([
        '/fhir/Patient',
        expect.stringContaining('/fhir/Observation?date=ge2015-01-01'),
        '/fhir/Condition'
      ]);
      global.fetch.mock.calls.forEach(c => expect(c[1].method).toBeUndefined());
      expect(result.success).toBe(true);
      expect(result.data.entry).toHaveLength(3);
    });
  });

  describe('URL construction', () => {
    it('should build correct lab results URL with Alle category', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      await service.getLabResults('Alle', 50);

      const callUrl = global.fetch.mock.calls[0][0];
      expect(callUrl).toContain('Observation');
      expect(callUrl).toContain('_sort=-date');
      expect(callUrl).toContain('_count=50');
    });

    it('should build correct conditions URL', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      await service.getConditions();

      const callUrl = global.fetch.mock.calls[0][0];
      expect(callUrl).toBe('/fhir/Condition');
    });
  });
});
