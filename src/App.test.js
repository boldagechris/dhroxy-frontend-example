import { render, screen, fireEvent, within } from '@testing-library/react';
import App from './App';

// Minimal search bundles shaped like current dhroxy output
const bundle = (resources) => ({
  resourceType: 'Bundle',
  type: 'searchset',
  total: resources.length,
  entry: resources.map((resource) => ({ resource }))
});

const subject = { type: 'Patient', identifier: { system: 'urn:oid:1.2.208.176.1.2', value: '0101900000' } };

const responses = {
  Patient: bundle([{
    resourceType: 'Patient',
    id: 'pat-0101900000',
    identifier: [{ system: 'urn:oid:1.2.208.176.1.2', value: '0101900000', use: 'official' }],
    name: [{ text: 'Test Person', family: 'Person', given: ['Test'] }]
  }]),
  Observation: bundle([
    { resourceType: 'Observation', id: 'lab-1', status: 'final', subject,
      code: { text: 'CRP' }, valueQuantity: { value: 4, unit: 'mg/L' },
      effectiveDateTime: '2026-06-15T08:00:00+02:00' },
    { resourceType: 'Observation', id: 'lab-2', status: 'final', subject,
      code: { text: 'Leukocytter tælling' }, valueString: '12',
      effectiveDateTime: '2026-06-14T08:00:00+02:00' }
  ]),
  Condition: bundle([]),
  MedicationStatement: bundle([]),
  Immunization: bundle([]),
  Appointment: bundle([
    { resourceType: 'Appointment', id: 'apt-1', status: 'booked',
      description: 'Kontrol hos egen læge', start: '2026-06-20T09:00:00+02:00' }
  ]),
  DocumentReference: bundle([
    { resourceType: 'DocumentReference', id: 'doc-epikrise-course-1-0', status: 'current', subject,
      description: 'Udskrivningsepikrise', type: { text: 'epikrise' } },
    { resourceType: 'DocumentReference', id: 'doc-notat-course-1-0', status: 'current', subject,
      description: 'Sygeplejenotat', type: { text: 'notat' } }
  ])
};

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn(async (url) => {
    const resource = String(url).replace(/^.*\/fhir\//, '').split('?')[0];
    return { ok: true, status: 200, json: async () => responses[resource] };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders the dashboard', () => {
  render(<App />);
  expect(screen.getAllByText(/Min Sundhedsagent/i).length).toBeGreaterThan(0);
});

test('shows dhroxy data in the right dashboard sections', async () => {
  render(<App />);
  fireEvent.click(screen.getByText('Hent data fra Sundhed.dk'));

  // Lab results: both a Quantity value and a unitless valueString value
  await screen.findByText('Seneste laboratoriesvar');
  expect(screen.getByText('CRP')).toBeInTheDocument();
  expect(screen.getByText(/^4\s+mg\/L$/)).toBeInTheDocument();
  expect(screen.getByText(/^12\s*$/)).toBeInTheDocument();

  // Epikriser and notater come from DocumentReference, appointments are separate
  const epikriser = screen.getByText('Epikriser (1)').closest('div');
  expect(within(epikriser).getByText('Udskrivningsepikrise')).toBeInTheDocument();
  expect(within(epikriser).queryByText('Kontrol hos egen læge')).toBeNull();

  const notater = screen.getByText('Notater (1)').closest('div');
  expect(within(notater).getByText('Sygeplejenotat')).toBeInTheDocument();

  const aftaler = screen.getByText('Aftaler (1)').closest('div');
  expect(within(aftaler).getByText('Kontrol hos egen læge')).toBeInTheDocument();

  const requested = global.fetch.mock.calls.map((c) => c[0]);
  expect(requested).toContain('/fhir/DocumentReference');
});
