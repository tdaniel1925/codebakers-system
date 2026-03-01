---
name: Healthcare Industry Specialist
tier: industries
triggers: healthcare, hipaa, patient scheduling, ehr, emr, patient portal, telehealth, telemedicine, medical records, prescriptions, clinical, provider, patient intake, medical billing, hl7, fhir, practice management medical, appointment scheduling medical
depends_on: database.md, auth.md, scheduling.md, compliance/hipaa.md
conflicts_with: null
prerequisites: null
description: Healthcare domain expertise — patient scheduling, EHR/EMR integration via FHIR/HL7, patient portals, telehealth workflows, clinical data models, medical billing (CPT/ICD-10), prescription management, and HIPAA-compliant architecture patterns
code_templates: null
design_tokens: tokens-healthcare.css
---

# Healthcare Industry Specialist

## Role

Provides deep domain expertise for building healthcare technology applications — practice management systems, patient portals, telehealth platforms, EHR integrations, and clinical workflow tools. Understands the unique regulatory environment (HIPAA, HITECH, 21st Century Cures Act), clinical data standards (FHIR, HL7v2), medical coding systems (CPT, ICD-10, SNOMED), and the complex multi-stakeholder workflows that define healthcare IT. Ensures every healthcare app protects patient data by default and supports clinical workflows without creating friction for providers.

## When to Use

- Building a patient scheduling or practice management system
- Implementing patient intake forms and clinical questionnaires
- Building a patient portal (appointments, records, messaging, billing)
- Integrating with EHR/EMR systems via FHIR or HL7v2
- Building telehealth / telemedicine video visit workflows
- Implementing medical billing with CPT and ICD-10 codes
- Building prescription or medication management features
- Designing clinical dashboards or population health tools
- Implementing consent management and HIPAA-compliant data handling
- Building provider directories or referral management systems

## Also Consider

- **hipaa.md** — for detailed HIPAA technical implementation (encryption, access logging, BAA)
- **scheduling.md** — for underlying appointment scheduling infrastructure
- **auth.md** — for multi-role access (provider, nurse, admin, patient, billing)
- **realtime.md** — for real-time waiting room status and provider availability
- **notifications.md** — for appointment reminders and clinical alerts
- **billing.md** — for payment processing underlying medical billing
- **document-ai.md** — for clinical document processing and PDF generation
- **video/chatbot.md** — for telehealth video integration and symptom checkers

## Anti-Patterns (NEVER Do)

1. **Never store PHI without encryption at rest and in transit.** Protected Health Information requires AES-256 encryption at rest and TLS 1.2+ in transit. This is non-negotiable under HIPAA.
2. **Never allow access to patient records without audit logging.** Every view, create, update, and export of PHI must be logged with who, what, when, and from where. HIPAA requires 6-year audit log retention.
3. **Never transmit PHI via standard email or SMS.** Use encrypted messaging channels for any communication containing patient information. Standard SMS and email are not HIPAA-compliant.
4. **Never use a single role for all clinical users.** Providers, nurses, medical assistants, front desk, billing, and patients all need different access levels. Implement granular RBAC.
5. **Never build clinical decision support without disclaimers.** Any feature that suggests diagnoses, medications, or treatment plans must clearly state it's for informational purposes and does not replace clinical judgment.
6. **Never hardcode medical codes.** CPT, ICD-10, SNOMED, and LOINC codes are updated annually. Use reference tables that can be versioned and updated independently.
7. **Never store patient photos or biometrics without explicit consent.** Facial photos, fingerprints, and voice recordings are PHI under HIPAA. Require documented consent before collection.
8. **Never skip the BAA.** Any third-party service that handles PHI (hosting, email, analytics, error tracking) requires a signed Business Associate Agreement. No exceptions.

## Standards & Patterns

### Core Data Model

```
Practice / Organization
├── Providers (physicians, NPs, PAs, therapists)
│   ├── Credentials (NPI, licenses, DEA)
│   ├── Specialties
│   └── Schedules / Availability
├── Patients
│   ├── Demographics (with consent tracking)
│   ├── Insurance Information
│   ├── Medical History
│   ├── Allergies / Medications
│   ├── Appointments
│   │   ├── Scheduling → Check-in → Rooming → Visit → Checkout
│   │   └── Telehealth visits
│   ├── Encounters / Visit Notes
│   │   ├── Chief Complaint, HPI, ROS, Physical Exam
│   │   ├── Assessment (ICD-10 diagnoses)
│   │   ├── Plan (orders, prescriptions, referrals)
│   │   └── Signed/Locked clinical notes
│   ├── Orders (labs, imaging, referrals)
│   ├── Documents (uploaded, generated, received)
│   ├── Messages (patient-provider secure messaging)
│   └── Billing
│       ├── Claims (CPT + ICD-10 → Payer)
│       ├── Payments / ERA
│       └── Patient Statements
└── Locations / Facilities
```

### Patient Schema

```sql
-- Core patient record — minimal PHI in main table, detailed data in related tables
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  mrn TEXT NOT NULL,                     -- Medical Record Number (unique per org)
  first_name TEXT NOT NULL,              -- Encrypted at application layer
  last_name TEXT NOT NULL,               -- Encrypted at application layer
  date_of_birth DATE NOT NULL,           -- Encrypted at application layer
  sex TEXT NOT NULL CHECK (sex IN ('male', 'female', 'other', 'unknown')),
  gender_identity TEXT,
  preferred_name TEXT,
  preferred_language TEXT DEFAULT 'en',
  preferred_pronoun TEXT,
  email TEXT,                            -- Encrypted
  phone TEXT,                            -- Encrypted
  ssn_last4 TEXT,                        -- Last 4 only, encrypted
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'deceased', 'merged')),
  primary_provider_id UUID REFERENCES providers(id),
  primary_location_id UUID REFERENCES locations(id),
  consent_hipaa_signed_at TIMESTAMPTZ,
  consent_telehealth_signed_at TIMESTAMPTZ,
  consent_messaging_signed_at TIMESTAMPTZ,
  portal_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(org_id, mrn)
);

-- RLS: Staff see patients at their locations, providers see their patients
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Patient address (separate for audit trail on changes)
CREATE TABLE patient_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  address_type TEXT NOT NULL CHECK (address_type IN ('home', 'work', 'temporary', 'billing')),
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insurance coverage
CREATE TABLE patient_insurance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  priority TEXT NOT NULL CHECK (priority IN ('primary', 'secondary', 'tertiary')),
  payer_name TEXT NOT NULL,
  payer_id TEXT,                         -- Payer identifier
  plan_name TEXT,
  member_id TEXT NOT NULL,               -- Encrypted
  group_number TEXT,
  subscriber_name TEXT,
  subscriber_relationship TEXT CHECK (subscriber_relationship IN ('self', 'spouse', 'child', 'other')),
  subscriber_dob DATE,
  effective_date DATE NOT NULL,
  termination_date DATE,
  copay DECIMAL(6,2),
  coinsurance DECIMAL(5,4),
  deductible DECIMAL(8,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Provider Schema

```sql
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  credentials TEXT NOT NULL,             -- MD, DO, NP, PA, LCSW, etc.
  npi TEXT UNIQUE,                       -- National Provider Identifier (10 digits)
  dea_number TEXT,                       -- For prescribing controlled substances
  specialty TEXT NOT NULL,
  taxonomy_code TEXT,                    -- Provider taxonomy (NUCC)
  license_state TEXT NOT NULL,
  license_number TEXT NOT NULL,
  license_expiration DATE,
  accepting_new_patients BOOLEAN NOT NULL DEFAULT true,
  telehealth_enabled BOOLEAN NOT NULL DEFAULT false,
  default_appointment_duration INT NOT NULL DEFAULT 30, -- minutes
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Provider schedule templates
CREATE TABLE provider_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id),
  location_id UUID NOT NULL REFERENCES locations(id),
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  appointment_types TEXT[],              -- Which visit types during this block
  is_telehealth BOOLEAN NOT NULL DEFAULT false,
  effective_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Appointment Scheduling

```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  provider_id UUID NOT NULL REFERENCES providers(id),
  location_id UUID REFERENCES locations(id),
  appointment_type TEXT NOT NULL
    CHECK (appointment_type IN ('new_patient', 'follow_up', 'annual_wellness',
      'sick_visit', 'procedure', 'telehealth', 'lab_only', 'injection', 'consultation', 'urgent')),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'checked_in', 'roomed',
      'in_progress', 'completed', 'checked_out', 'cancelled', 'no_show', 'rescheduled')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  is_telehealth BOOLEAN NOT NULL DEFAULT false,
  telehealth_url TEXT,                   -- Video visit link
  chief_complaint TEXT,
  reason_for_visit TEXT,
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  checked_in_at TIMESTAMPTZ,
  roomed_at TIMESTAMPTZ,
  visit_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  notes TEXT,                            -- Staff notes (not clinical)
  recurring_rule TEXT,                   -- iCal RRULE for recurring appointments
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appts_provider_time ON appointments(provider_id, start_time);
CREATE INDEX idx_appts_patient ON appointments(patient_id, start_time DESC);
CREATE INDEX idx_appts_status ON appointments(status, start_time)
  WHERE status IN ('scheduled', 'confirmed', 'checked_in', 'roomed', 'in_progress');
```

### Appointment Workflow

```
Patient Journey:
┌─────────────┐   ┌───────────┐   ┌──────────┐   ┌───────────┐   ┌───────────┐   ┌────────────┐
│  Scheduled   │ → │ Confirmed │ → │Checked In│ → │   Roomed  │ → │ In Progress│ → │ Completed  │
│              │   │ (reminder)│   │ (kiosk/  │   │ (vitals,  │   │ (provider  │   │ (note      │
│              │   │           │   │  front   │   │  intake)  │   │  encounter)│   │  signed)   │
└─────────────┘   └───────────┘   │  desk)   │   └───────────┘   └───────────┘   └────────────┘
                                  └──────────┘                                          │
                                                                                  ┌────────────┐
                                                                                  │ Checked Out│
                                                                                  │ (billing,  │
                                                                                  │  follow-up)│
                                                                                  └────────────┘
```

### Clinical Encounter / Visit Note

```sql
CREATE TABLE encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  provider_id UUID NOT NULL REFERENCES providers(id),
  encounter_date DATE NOT NULL,
  encounter_type TEXT NOT NULL
    CHECK (encounter_type IN ('office_visit', 'telehealth', 'phone', 'hospital', 'emergency', 'procedure')),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'signed', 'addended', 'cosigned')),

  -- SOAP Note / Clinical Documentation
  chief_complaint TEXT,
  hpi TEXT,                              -- History of Present Illness
  review_of_systems JSONB,              -- ROS checklist
  physical_exam JSONB,                  -- PE findings
  assessment TEXT,                      -- Clinical assessment narrative
  plan TEXT,                            -- Treatment plan narrative

  -- Vitals (captured during rooming)
  vitals JSONB,
  /*
    {
      "height_inches": 68,
      "weight_lbs": 175,
      "bmi": 26.6,
      "blood_pressure_systolic": 120,
      "blood_pressure_diastolic": 80,
      "heart_rate": 72,
      "respiratory_rate": 16,
      "temperature_f": 98.6,
      "oxygen_saturation": 98,
      "pain_level": 0
    }
  */

  signed_at TIMESTAMPTZ,
  signed_by UUID REFERENCES providers(id),
  cosigned_at TIMESTAMPTZ,
  cosigned_by UUID REFERENCES providers(id),
  addendum TEXT,
  addendum_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Diagnoses per encounter (ICD-10)
CREATE TABLE encounter_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  icd10_code TEXT NOT NULL,              -- e.g., 'J06.9' (Acute upper respiratory infection)
  description TEXT NOT NULL,
  rank INT NOT NULL DEFAULT 1,           -- 1 = primary, 2+ = secondary
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Once signed, encounter is LOCKED. Only addendums allowed.
-- This is a legal medical record requirement.
```

### Medical Coding Reference Tables

```sql
-- ICD-10 diagnosis codes (updated annually, ~70,000 codes)
CREATE TABLE icd10_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT,
  is_billable BOOLEAN NOT NULL,
  effective_date DATE,
  termination_date DATE
);

-- CPT procedure codes (updated annually, ~10,000 codes)
CREATE TABLE cpt_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT,
  base_rvu DECIMAL(6,2),                -- Relative Value Unit (for reimbursement)
  effective_date DATE,
  termination_date DATE
);

-- Medication reference (from RxNorm or similar)
CREATE TABLE medications (
  rxcui TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  generic_name TEXT,
  dosage_form TEXT,
  strength TEXT,
  route TEXT,
  schedule TEXT,                          -- DEA schedule (II, III, IV, V, or null)
  is_active BOOLEAN NOT NULL DEFAULT true
);
```

### Patient Medications & Allergies

```sql
CREATE TABLE patient_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  medication_name TEXT NOT NULL,
  rxcui TEXT REFERENCES medications(rxcui),
  dosage TEXT NOT NULL,                  -- e.g., '500mg'
  frequency TEXT NOT NULL,               -- e.g., 'twice daily'
  route TEXT,                            -- oral, topical, injection, etc.
  prescribing_provider_id UUID REFERENCES providers(id),
  prescribed_date DATE,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'discontinued', 'completed', 'on_hold')),
  is_prn BOOLEAN NOT NULL DEFAULT false, -- As needed
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patient_allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  allergen TEXT NOT NULL,
  allergen_type TEXT NOT NULL
    CHECK (allergen_type IN ('medication', 'food', 'environmental', 'other')),
  reaction TEXT,                         -- e.g., 'hives', 'anaphylaxis', 'nausea'
  severity TEXT NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe', 'life_threatening')),
  onset_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'resolved', 'entered_in_error')),
  reported_by TEXT,                      -- patient, provider, pharmacy
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meds_patient ON patient_medications(patient_id) WHERE status = 'active';
CREATE INDEX idx_allergies_patient ON patient_allergies(patient_id) WHERE status = 'active';
```

### FHIR Integration Pattern

```typescript
// FHIR R4 — the standard API for EHR interoperability
// Most EHRs (Epic, Cerner, Athena) expose FHIR R4 endpoints

// Common FHIR resources:
// Patient, Practitioner, Appointment, Encounter, Condition,
// MedicationRequest, AllergyIntolerance, Observation, DiagnosticReport

interface FHIRConfig {
  baseUrl: string;           // e.g., https://ehr.example.com/fhir/R4
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scope: string;             // e.g., 'patient/*.read launch/patient'
}

class FHIRClient {
  private accessToken: string | null = null;

  constructor(private config: FHIRConfig) {}

  private async getToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;

    const res = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        scope: this.config.scope,
      }),
    });

    const data = await res.json();
    this.accessToken = data.access_token;
    return this.accessToken!;
  }

  async getPatient(patientId: string): Promise<any> {
    return this.request(`/Patient/${patientId}`);
  }

  async searchPatients(params: { family?: string; given?: string; birthdate?: string }): Promise<any> {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request(`/Patient?${query}`);
  }

  async getAppointments(patientId: string, dateRange?: { start: string; end: string }): Promise<any> {
    let url = `/Appointment?patient=${patientId}`;
    if (dateRange) url += `&date=ge${dateRange.start}&date=le${dateRange.end}`;
    return this.request(url);
  }

  async getConditions(patientId: string): Promise<any> {
    return this.request(`/Condition?patient=${patientId}&clinical-status=active`);
  }

  async getMedications(patientId: string): Promise<any> {
    return this.request(`/MedicationRequest?patient=${patientId}&status=active`);
  }

  async getAllergies(patientId: string): Promise<any> {
    return this.request(`/AllergyIntolerance?patient=${patientId}&clinical-status=active`);
  }

  private async request(path: string): Promise<any> {
    const token = await this.getToken();
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/fhir+json',
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(`FHIR error ${res.status}: ${JSON.stringify(error)}`);
    }

    return res.json();
  }
}
```

### Telehealth Workflow

```
Telehealth Visit Flow:
1. Patient books telehealth appointment (type = 'telehealth')
2. System generates unique video room URL
3. 24hr reminder sent with video link + tech check instructions
4. 15min before: SMS/email with direct join link
5. Patient checks in via portal (completes intake form)
6. Provider joins video room, starts encounter
7. Encounter documented same as in-person (SOAP note)
8. E-prescriptions sent if needed
9. Visit summary sent to patient portal
10. Billing: Telehealth modifier appended to CPT codes (modifier 95 or GT)
```

### HIPAA Audit Log

```sql
-- EVERY access to PHI must be logged (HIPAA §164.312(b))
CREATE TABLE phi_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL,
  patient_id UUID,
  resource_type TEXT NOT NULL,           -- 'patient', 'encounter', 'medication', etc.
  resource_id UUID,
  action TEXT NOT NULL                   -- 'view', 'create', 'update', 'delete', 'export', 'print'
    CHECK (action IN ('view', 'create', 'update', 'delete', 'export', 'print', 'download', 'fax')),
  ip_address INET,
  user_agent TEXT,
  details JSONB,                         -- What fields were accessed/changed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partitioned by month for performance (audit logs get large)
-- Retention: minimum 6 years per HIPAA
CREATE INDEX idx_audit_patient ON phi_audit_log(patient_id, created_at DESC);
CREATE INDEX idx_audit_user ON phi_audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_time ON phi_audit_log(created_at);
```

### Patient Portal Features

```
Patient Self-Service Portal:
├── Appointments — View upcoming, request new, cancel/reschedule
├── Messages — Secure messaging with care team
├── Visit Summaries — After Visit Summary (AVS) documents
├── Lab Results — View results with normal/abnormal flagging
├── Medications — Current medication list
├── Health Records — Demographics, allergies, immunizations, problems
├── Billing — View statements, make payments, insurance info
├── Forms — Pre-visit intake forms, consent forms, questionnaires
├── Telehealth — Join video visits
└── Proxy Access — Parents/guardians for minor patients
```

## Code Templates

No dedicated code templates — the inline patterns cover patient data models, scheduling, encounters, FHIR integration, and audit logging comprehensively.

## Checklist

- [ ] All PHI encrypted at rest (AES-256) and in transit (TLS 1.2+)
- [ ] HIPAA audit log captures every PHI access with user, resource, action, timestamp
- [ ] Role-based access control with granular permissions (provider, nurse, admin, billing, patient)
- [ ] Patient consent tracking (HIPAA notice, telehealth, messaging)
- [ ] Appointment workflow covers full journey (schedule → check-in → rooming → visit → checkout)
- [ ] Clinical notes lockable after provider signature (legal medical record)
- [ ] Addendum-only editing on signed encounters
- [ ] ICD-10 and CPT reference tables versioned and updatable
- [ ] Medication and allergy lists with drug interaction awareness
- [ ] FHIR R4 client for EHR integration (Patient, Appointment, Condition, MedicationRequest)
- [ ] Telehealth visits with unique video URLs and encounter documentation
- [ ] Patient portal with secure messaging, results, and self-scheduling
- [ ] BAA in place with every third-party service handling PHI
- [ ] 6-year minimum retention on all audit logs
- [ ] Emergency access ("break the glass") procedure documented and logged

## Common Pitfalls

1. **Minimum Necessary Rule** — HIPAA requires that users only access the minimum PHI needed for their role. A billing clerk shouldn't see clinical notes. A front desk staff shouldn't see detailed diagnoses. Build views that show only what each role needs.
2. **Signed note immutability** — Once a provider signs a clinical note, it becomes a legal medical record. It cannot be edited, only addended. This is a common gap in healthcare apps that creates serious legal liability.
3. **Minor patient access** — Parents/guardians can access minor children's records, but rules change at age 12-18 depending on state and visit type (reproductive health, mental health, substance abuse). Build age-aware access rules.
4. **Medication reconciliation** — Every visit should prompt medication reconciliation (confirming current meds). Outdated medication lists are a patient safety hazard.
5. **Telehealth state licensure** — Providers can only deliver telehealth to patients in states where they hold a license. The system must verify provider-patient state compatibility for telehealth appointments.
6. **After-hours coverage** — Clinical messages require timely response. The system needs escalation rules for urgent messages and after-hours routing to on-call providers.
7. **FHIR scope limitations** — FHIR APIs expose different data depending on the granted scope. A `patient/*.read` scope won't allow writing. Always verify the granted scopes match your integration needs before building features.
