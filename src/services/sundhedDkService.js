/**
 * Service til at hente sundhedsdata fra Sundhed.dk via dhroxy FHIR proxy
 *
 * Mapper mellem Sundhed.dk API endpoints og FHIR ressourcer:
 * - Patient → /app/personvaelgerportal/api/v1/GetPersonSelection
 * - Observation (labs) → /app/proevesvarportal/api/v1/svaroversigt
 * - Condition → /app/ejournalportalborger/api/ejournal/forloebsoversigt
 * - Encounter → /app/ejournalportalborger/api/ejournal/kontaktperioder
 * - DocumentReference (epikriser) → /app/ejournalportalborger/api/ejournal/epikriser
 * - DocumentReference (notater) → /app/ejournalportalborger/api/ejournal/notater
 * - MedicationStatement → /app/medicinkort2borger/api/v1/ordinations/{id}/details
 * - MedicationRequest → /app/medicinkort2borger/api/v1/prescriptions/overview
 * - Immunization → /app/vaccination/api/v1/effectuatedvaccinations
 * - ImagingStudy → /app/billedbeskrivelserborger/api/v1/billedbeskrivelser/henvisninger
 * - Appointment → /app/aftalerborger/api/v1/aftaler/cpr
 * - Organization → /api/minlaegeorganization
 */

const DHROXY_BASE_URL = '/fhir';

/**
 * Default custom headers der kan override dhroxy YAML konfiguration
 * Disse headers sendes med alle requests til dhroxy
 */
const DEFAULT_CUSTOM_HEADERS = {
  // Eksempler på headers der kan override YAML:
  // 'X-Dhroxy-Config-Override': 'true',
  // 'X-Custom-Base-Url': 'https://custom-endpoint.sundhed.dk',
  // 'X-Custom-Auth-Token': 'bearer-token-here',
};

/**
 * Mapper labsvar kategori til FHIR Observation category
 */
const mapLabCategory = (sundhedDkCategory) => {
  const categoryMap = {
    'KliniskBiokemi': 'laboratory',
    'Mikrobiologi': 'laboratory',
    'Patologi': 'laboratory',
    'Alle': 'laboratory'
  };
  return categoryMap[sundhedDkCategory] || 'laboratory';
};

/**
 * Mapper sundhed.dk område til labsvar kategori
 */
const mapOmraadeToCategory = (omraade) => {
  if (omraade === 'KliniskBiokemi') return 'laboratory|kliniskbiokemi';
  if (omraade === 'Mikrobiologi') return 'mikro*';
  if (omraade === 'Patologi') return 'patologi';
  return 'Alle'; // default
};

class SundhedDkService {
  constructor(baseUrl = DHROXY_BASE_URL, customHeaders = {}) {
    this.baseUrl = baseUrl;
    this.customHeaders = { ...DEFAULT_CUSTOM_HEADERS, ...customHeaders };
  }

  /**
   * Sæt custom headers der overrider YAML konfiguration
   * @param {Object} headers - Headers der skal tilføjes/overrides
   */
  setCustomHeaders(headers) {
    this.customHeaders = { ...this.customHeaders, ...headers };
  }

  /**
   * Hent nuværende custom headers
   */
  getCustomHeaders() {
    return { ...this.customHeaders };
  }

  /**
   * Fjern en specifik custom header
   * @param {string} headerName - Navnet på headeren der skal fjernes
   */
  removeCustomHeader(headerName) {
    delete this.customHeaders[headerName];
  }

  /**
   * Nulstil alle custom headers
   */
  clearCustomHeaders() {
    this.customHeaders = {};
  }

  /**
   * Generisk fetch funktion med error handling
   * Custom headers sendes automatisk og kan override YAML-konfiguration i dhroxy
   */
  async fetchFromDhroxy(url, options = {}) {
    try {
      // Merge headers: defaults < custom headers < request-specific headers
      const mergedHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...this.customHeaders,
        ...options.headers
      };

      const response = await fetch(url, {
        ...options,
        headers: mergedHeaders
      });

      if (!response.ok) {
        // dhroxy returns a FHIR OperationOutcome on errors; surface its message
        let diagnostics = '';
        try {
          const body = await response.json();
          diagnostics = body?.issue?.map(i => i.diagnostics).filter(Boolean).join('; ') || '';
        } catch (_) {
          // body was not JSON
        }
        const error = new Error(`HTTP error! status: ${response.status}${diagnostics ? ` - ${diagnostics}` : ''}`);
        error.status = response.status;
        error.diagnostics = diagnostics;
        throw error;
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error(`Error fetching from ${url}:`, error);
      return { success: false, error: error.message, status: error.status, diagnostics: error.diagnostics };
    }
  }

  /**
   * Hent patient data fra personvælger
   */
  async getPatient() {
    return this.fetchFromDhroxy(`${this.baseUrl}/Patient`);
  }

  /**
   * Hent International Patient Summary (IPS) for en patient
   * @param {string} patientId - Patient ID
   */
  async getPatientSummary(patientId) {
    return this.fetchFromDhroxy(`${this.baseUrl}/Patient/${patientId}/$summary`);
  }

  /**
   * Hent labsvar (Observations)
   * @param {string} omraade - KliniskBiokemi, Mikrobiologi, Patologi, eller Alle
   * @param {number} count - Antal resultater (default 50)
   */
  async getLabResults(omraade = 'Alle', count = 50) {
    // dhroxy defaults to 6 months lookback — use 10 years instead
    // _sort=-date ensures newest results first (server-side sorting)
    let url = `${this.baseUrl}/Observation?date=ge2015-01-01&_sort=-date&_count=${count}`;
    return this.fetchFromDhroxy(url);
  }

  /**
   * Hent diagnoser (Conditions) fra e-journal forløbsoversigt
   */
  async getConditions() {
    return this.fetchFromDhroxy(`${this.baseUrl}/Condition`);
  }

  /**
   * Hent kontaktperioder (Encounters)
   * dhroxy's Encounter search takes no parameters; filter client-side if needed.
   */
  async getEncounters() {
    return this.fetchFromDhroxy(`${this.baseUrl}/Encounter`);
  }

  /**
   * Hent epikriser (DocumentReference)
   */
  async getEpikriser() {
    return this.fetchFromDhroxy(
      `${this.baseUrl}/DocumentReference`
    );
  }

  /**
   * Hent notater (DocumentReference)
   */
  async getNotater() {
    return this.fetchFromDhroxy(
      `${this.baseUrl}/DocumentReference`
    );
  }

  /**
   * Hent alle dokumenter (epikriser + notater)
   */
  async getAllDocuments() {
    return this.fetchFromDhroxy(
      `${this.baseUrl}/DocumentReference`
    );
  }

  /**
   * Hent medicin ordination detaljer (MedicationStatement)
   * @param {string} id - Ordinations ID
   */
  async getMedicationStatement(id) {
    return this.fetchFromDhroxy(`${this.baseUrl}/MedicationStatement/${id}`);
  }

  /**
   * Hent alle medicin ordinationer
   */
  async getAllMedicationStatements() {
    return this.fetchFromDhroxy(
      `${this.baseUrl}/MedicationStatement`
    );
  }

  /**
   * Hent medicin recepter (MedicationRequest)
   */
  async getMedicationRequests() {
    return this.fetchFromDhroxy(
      `${this.baseUrl}/MedicationRequest`
    );
  }

  /**
   * Hent vaccinationer (Immunization)
   */
  async getImmunizations() {
    return this.fetchFromDhroxy(
      `${this.baseUrl}/Immunization`
    );
  }

  /**
   * Hent billedbeskrivelser (ImagingStudy/DiagnosticReport)
   */
  async getImagingStudies() {
    return this.fetchFromDhroxy(
      `${this.baseUrl}/ImagingStudy`
    );
  }

  /**
   * Hent billedbeskrivelse rapporter som DiagnosticReport
   */
  async getDiagnosticReports() {
    return this.fetchFromDhroxy(
      `${this.baseUrl}/DiagnosticReport`
    );
  }

  /**
   * Hent aftaler (Appointment)
   * Default range: 1 år tilbage til 1 år frem (håndteret af dhroxy)
   */
  async getAppointments() {
    // Dhroxy håndterer default dato range (1 år tilbage til 1 år frem)
    return this.fetchFromDhroxy(
      `${this.baseUrl}/Appointment`
    );
  }

  /**
   * Hent min læge organisation (Organization)
   */
  async getMyDoctorOrganization() {
    return this.fetchFromDhroxy(
      `${this.baseUrl}/Organization`
    );
  }

  /**
   * Hent organisation detaljer
   * @param {string} id - Organisation ID
   */
  async getOrganization(id) {
    return this.fetchFromDhroxy(`${this.baseUrl}/Organization/${id}`);
  }

  /**
   * Hent alt patient data via individuelle parallelle GET requests.
   * Resultater samles i et bundle-lignende format.
   */
  async getAllPatientData(options = {}) {
    const {
      includeLabResults = true,
      labOmraade = 'Alle',
      labCount = 50,
      includeConditions = true,
      includeEncounters = true,
      includeDocuments = true,
      includeMedication = true,
      includeImmunizations = true,
      includeImaging = true,
      includeAppointments = true,
      includeOrganizations = true
    } = options;

    // Build list of resources to fetch
    const resources = ['Patient'];

    if (includeLabResults) {
      resources.push(`Observation?date=ge2015-01-01&_sort=-date&_count=${labCount}`);
    }
    if (includeConditions) resources.push('Condition');
    if (includeEncounters) resources.push('Encounter');
    if (includeDocuments) resources.push('DocumentReference');
    if (includeMedication) {
      resources.push('MedicationStatement');
      resources.push('MedicationRequest');
    }
    if (includeImmunizations) resources.push('Immunization');
    if (includeImaging) resources.push('DiagnosticReport');
    if (includeAppointments) resources.push('Appointment');
    if (includeOrganizations) resources.push('Organization');

    try {
      const results = await Promise.allSettled(
        resources.map(res => this.fetchFromDhroxy(`${this.baseUrl}/${res}`))
      );

      const entries = results.map((result) => ({
        resource: (result.status === 'fulfilled' && result.value?.success)
          ? result.value.data
          : null
      }));

      const successCount = entries.filter(e => e.resource).length;
      if (successCount > 0) {
        return {
          success: true,
          data: {
            resourceType: 'Bundle',
            type: 'transaction-response',
            entry: entries
          }
        };
      }
      return { success: false, error: 'All resource requests failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Eksporter singleton instance
const sundhedDkService = new SundhedDkService();
export default sundhedDkService;

// Eksporter også klassen for custom instances
export { SundhedDkService };
