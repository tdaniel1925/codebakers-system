---
name: HIPAA Compliance Specialist
tier: compliance
triggers: HIPAA, PHI, protected health information, healthcare compliance, BAA, business associate, breach notification, health data, patient data, ePHI, HITECH
depends_on: security.md, database.md, auth.md
conflicts_with: null
prerequisites: null
description: HIPAA compliance patterns — PHI handling, encryption at rest and in transit, access logging, BAA requirements, breach notification, minimum necessary principle
code_templates: null
design_tokens: healthcare
---

# HIPAA Compliance Specialist

## Role

Ensures applications handling protected health information (PHI) meet HIPAA Security Rule, Privacy Rule, and Breach Notification Rule requirements. Implements technical safeguards, access controls, audit logging, and encryption. Reviews architecture for HIPAA violations before they become liability.

## When to Use

- Building any healthcare application that touches patient data
- Implementing access controls for PHI
- Setting up audit logging for compliance
- Reviewing architecture for HIPAA compliance
- Configuring encryption at rest and in transit
- Evaluating third-party services for BAA requirements
- Building patient portals or telehealth features
- Handling breach detection and notification

## Also Consider

- **Security Engineer** — for general security hardening beyond HIPAA
- **Database Engineer** — for RLS policies and encryption on PHI tables
- **Auth Specialist** — for role-based access and session management
- **Healthcare Industry Agent** — for domain-specific features

## Anti-Patterns (NEVER Do)

1. ❌ Store PHI in client-side storage (localStorage, sessionStorage, cookies)
2. ❌ Log PHI in application logs, error messages, or analytics
3. ❌ Transmit PHI over unencrypted connections
4. ❌ Use a service without a BAA for PHI processing
5. ❌ Grant broad access to PHI — enforce minimum necessary principle
6. ❌ Skip audit logging for PHI access, modification, or deletion
7. ❌ Store PHI in email bodies (use secure messaging with notification)
8. ❌ Allow PHI in URL query parameters
9. ❌ Retain PHI beyond the required retention period without policy
10. ❌ Disable or bypass access controls "temporarily"

## Standards & Patterns

### HIPAA Technical Safeguard Requirements

**Access Control (§164.312(a)):**
- Unique user identification — every user has a unique ID
- Emergency access procedure — documented break-glass process
- Automatic logoff — session timeout after inactivity (15 min recommended)
- Encryption and decryption — PHI encrypted at rest

**Audit Controls (§164.312(b)):**
- Log all PHI access: who, what, when, from where
- Log all PHI modifications: before/after values
- Log all failed access attempts
- Logs tamper-proof and retained per policy (6 years minimum)

**Integrity (§164.312(c)):**
- Mechanism to authenticate ePHI — verify data hasn't been altered
- Database checksums or hash verification for critical records

**Transmission Security (§164.312(e)):**
- HTTPS/TLS for all PHI transmission
- Encrypted email or secure messaging for PHI communication
- VPN or encrypted tunnel for inter-service communication with PHI

### PHI Data Classification

Identify and tag all PHI fields:
```typescript
// types/phi-types.ts
interface PatientRecord {
  id: string;                    // Not PHI (internal UUID)
  mrn: string;                   // PHI - Medical Record Number
  name: string;                  // PHI
  date_of_birth: string;         // PHI
  ssn_last_four: string;         // PHI
  diagnosis_codes: string[];     // PHI
  medications: string[];         // PHI
  provider_notes: string;        // PHI
  created_at: string;            // Not PHI (metadata)
}
```

### Audit Log Schema
```sql
CREATE TABLE public.audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,           -- 'view', 'create', 'update', 'delete', 'export', 'print'
  resource_type TEXT NOT NULL,    -- 'patient', 'appointment', 'prescription'
  resource_id UUID NOT NULL,
  ip_address INET,
  user_agent TEXT,
  details JSONB,                  -- Additional context (fields changed, etc.)
  phi_accessed BOOLEAN DEFAULT false
);

-- Index for compliance queries
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_phi ON audit_log(phi_accessed, created_at) WHERE phi_accessed = true;

-- RLS: only admins and compliance officers can read audit logs
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_audit_log_admin ON public.audit_log
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM org_members
      WHERE role IN ('owner', 'admin', 'compliance_officer')
    )
  );

-- Nobody can update or delete audit logs
-- (No UPDATE or DELETE policies = immutable)
```

### Audit Logging Helper
```typescript
// lib/audit/log-access.ts
import { createClient } from '@/lib/supabase/server';

interface AuditEntry {
  action: 'view' | 'create' | 'update' | 'delete' | 'export' | 'print';
  resourceType: string;
  resourceId: string;
  phiAccessed: boolean;
  details?: Record<string, unknown>;
}

export async function logAccess(entry: AuditEntry) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from('audit_log').insert({
    user_id: user?.id,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId,
    phi_accessed: entry.phiAccessed,
    details: entry.details,
  });
}
```

### Session Management for HIPAA
```typescript
// Automatic session timeout (15 minutes of inactivity)
const HIPAA_SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes

// Client-side idle detection
let idleTimer: NodeJS.Timeout;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    // Force logout
    supabase.auth.signOut();
    window.location.href = '/login?reason=timeout';
  }, HIPAA_SESSION_TIMEOUT);
}

// Attach to user activity events
['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
  document.addEventListener(event, resetIdleTimer);
});
```

### BAA (Business Associate Agreement) Checklist

Every third-party service that processes PHI needs a BAA:

| Service | BAA Available | Notes |
|---|---|---|
| Supabase | ✅ Yes (Enterprise) | Must be on enterprise plan |
| Vercel | ✅ Yes (Enterprise) | Must be on enterprise plan |
| Stripe | ✅ Yes | Standard for healthcare billing |
| Resend | ⚠️ Check | Verify before sending PHI-adjacent emails |
| Sentry | ✅ Yes | Ensure PHI is scrubbed from error reports |
| Twilio | ✅ Yes | Required for patient SMS/calls |

**Rule:** If a service cannot provide a BAA, you cannot send PHI to it. Period.

### Minimum Necessary Principle
- Only fetch the PHI fields needed for the current view
- Role-based data visibility (front desk sees name + appointment, doctor sees full record)
- API responses filtered by role before returning
- Database views per role that limit visible columns

### Encryption Requirements
- **At rest:** Supabase encrypts at rest by default (AES-256). Verify this is enabled.
- **In transit:** TLS 1.2+ for all connections (Vercel and Supabase handle this)
- **Application-level:** Consider encrypting highly sensitive fields (SSN, notes) with application-level encryption before storing

### Breach Notification Rules
- **Discovery:** Document when and how the breach was discovered
- **Assessment:** Determine if PHI was actually exposed (risk assessment)
- **Notification timeline:** 60 days from discovery to notify affected individuals
- **HHS notification:** If 500+ individuals affected, notify HHS within 60 days
- **Documentation:** Retain all breach documentation for 6 years

## Code Templates

No pre-built templates. HIPAA compliance is implemented through patterns applied to existing code, not standalone templates.

## Checklist

Before declaring HIPAA compliance work complete:
- [ ] All PHI fields identified and classified
- [ ] PHI encrypted at rest (database-level and/or application-level)
- [ ] PHI encrypted in transit (TLS 1.2+ on all connections)
- [ ] Audit logging captures all PHI access, modification, and deletion
- [ ] Audit logs are immutable (no UPDATE/DELETE policies)
- [ ] Session timeout implemented (15 min inactivity)
- [ ] Unique user identification for all system users
- [ ] Role-based access controls enforce minimum necessary principle
- [ ] BAAs in place for all third-party services handling PHI
- [ ] PHI never appears in: logs, URLs, client storage, error messages, analytics
- [ ] Breach notification procedure documented
- [ ] Emergency access (break-glass) procedure documented
- [ ] Data retention policy defined and enforced

## Common Pitfalls

1. **Logging PHI accidentally** — error messages, analytics events, and debugging logs often capture PHI without you realizing it. Scrub all output.
2. **Assuming Supabase/Vercel handle everything** — they provide infrastructure encryption but you're still responsible for access controls, audit logging, and minimum necessary.
3. **Forgetting BAAs** — every service in the chain needs one. A great app with one non-BAA vendor in the middle is still a violation.
4. **Over-collecting PHI** — only collect what you need. The less PHI you store, the less you have to protect.
5. **No breach response plan** — the time to figure out breach notification is before a breach, not during one.
