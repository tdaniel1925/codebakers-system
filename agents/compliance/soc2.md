---
name: SOC 2 Compliance Specialist
tier: compliance
triggers: SOC 2, SOC2, audit logging, access controls, incident response, trust services, security controls, compliance audit, change management, vendor management
depends_on: security.md, devops.md, auth.md
conflicts_with: null
prerequisites: null
description: SOC 2 compliance — access controls, audit logging, encryption, incident response, change management, vendor assessment, and trust services criteria
code_templates: null
design_tokens: null
---

# SOC 2 Compliance Specialist

## Role

Ensures applications and infrastructure meet SOC 2 Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy. Implements access controls, comprehensive audit logging, change management, incident response procedures, and vendor assessment processes.

## When to Use

- Preparing for a SOC 2 Type I or Type II audit
- Implementing access controls and audit logging
- Building change management workflows
- Setting up incident response procedures
- Reviewing vendor/third-party security
- Building enterprise applications that require SOC 2 certification
- Documenting security policies and procedures

## Also Consider

- **Security Engineer** — for technical security implementation
- **DevOps Engineer** — for CI/CD controls and infrastructure security
- **Auth Specialist** — for access control implementation
- **Database Engineer** — for audit logging and data integrity

## Anti-Patterns (NEVER Do)

1. ❌ Shared accounts or credentials — every user gets unique credentials
2. ❌ Unlogged access to production systems
3. ❌ Deploy to production without approval process
4. ❌ Skip security reviews on code changes
5. ❌ No incident response plan documented
6. ❌ Unvetted third-party services with access to customer data
7. ❌ Missing or incomplete audit trails
8. ❌ No access review process (quarterly minimum)
9. ❌ Undocumented exceptions to security policies

## Standards & Patterns

### SOC 2 Trust Services Criteria

**CC6 — Logical and Physical Access Controls:**
- MFA required for all production system access
- Role-based access with least privilege principle
- Access provisioning and de-provisioning documented
- Quarterly access reviews — remove unnecessary access
- Service accounts have documented owners

**CC7 — System Operations:**
- Monitoring and alerting for security events
- Vulnerability scanning (automated, regular)
- Patch management process documented
- Capacity planning and monitoring

**CC8 — Change Management:**
- All changes go through version control (Git)
- Code reviews required before merge
- Automated testing in CI pipeline
- Staging environment for pre-production testing
- Deployment approval process for production
- Rollback procedures documented and tested

**CC9 — Risk Mitigation:**
- Risk assessment performed annually
- Vendor security assessments for critical services
- Business continuity plan documented
- Disaster recovery tested annually

### Audit Log Requirements (Comprehensive)
```sql
CREATE TABLE public.system_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  actor_id UUID REFERENCES auth.users(id),
  actor_type TEXT NOT NULL,         -- 'user', 'system', 'api_key', 'service_account'
  action TEXT NOT NULL,             -- 'login', 'logout', 'create', 'read', 'update', 'delete', 'export', 'permission_change'
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL,            -- 'success', 'failure', 'error'
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  session_id TEXT
);

-- Immutable: no UPDATE or DELETE policies
ALTER TABLE public.system_audit_log ENABLE ROW LEVEL SECURITY;

-- Retention: keep for minimum 1 year, recommended 3+ years
-- Partition by month for performance
CREATE INDEX idx_sysaudit_actor ON system_audit_log(actor_id, created_at);
CREATE INDEX idx_sysaudit_action ON system_audit_log(action, created_at);
CREATE INDEX idx_sysaudit_outcome ON system_audit_log(outcome) WHERE outcome = 'failure';
```

### Change Management Workflow
```yaml
# .github/workflows/change-management.yml
# Enforces SOC 2 change management controls

name: Change Management
on:
  pull_request:
    branches: [main, master]

jobs:
  controls:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Require code review approval
        # Branch protection rules enforce this

      - name: Run automated tests
        run: pnpm test

      - name: Run security scan
        run: pnpm audit --audit-level=high

      - name: Run lint and type check
        run: |
          pnpm lint
          pnpm type-check

      # Production deploys require manual approval
      # configured via GitHub Environments
```

### Incident Response Plan Template
```markdown
## Incident Response Procedure

### Severity Levels
- **P1 (Critical):** Data breach, system down, security compromise → respond within 15 min
- **P2 (High):** Partial outage, data integrity issue → respond within 1 hour
- **P3 (Medium):** Performance degradation, non-critical bug → respond within 4 hours
- **P4 (Low):** Minor issue, cosmetic → respond within 24 hours

### Response Steps
1. **Detect** — monitoring alerts, user reports, or security scan
2. **Triage** — assess severity, assign incident commander
3. **Contain** — stop the bleeding (disable access, roll back, isolate)
4. **Investigate** — root cause analysis, determine scope
5. **Remediate** — fix the issue, verify fix, deploy
6. **Communicate** — notify affected parties per policy
7. **Review** — post-incident review within 5 business days
8. **Document** — full incident report retained for audit
```

### Access Review Process
```markdown
## Quarterly Access Review

1. Export list of all users with system access
2. For each user, verify:
   - Still employed / still a valid contractor
   - Role is appropriate for current job function
   - No excessive permissions beyond job requirements
3. Remove access for terminated users immediately
4. Adjust permissions for role changes
5. Document review: who reviewed, when, actions taken
6. Sign-off by security officer
```

### Vendor Assessment Checklist
For every third-party service that accesses customer data:
- [ ] SOC 2 report available and reviewed
- [ ] Data processing agreement (DPA) signed
- [ ] Encryption in transit and at rest confirmed
- [ ] Data residency requirements met
- [ ] Incident notification clause in contract
- [ ] Access controls and audit logging verified
- [ ] Annual reassessment scheduled

## Code Templates

No pre-built templates. SOC 2 compliance involves process documentation and configuration rather than application code.

## Checklist

Before declaring SOC 2 compliance work complete:
- [ ] All users have unique credentials with MFA
- [ ] Role-based access control implemented with least privilege
- [ ] Comprehensive audit logging for all system actions
- [ ] Audit logs are immutable and retained per policy
- [ ] Change management: code review + testing + approval for all production changes
- [ ] Incident response plan documented and team trained
- [ ] Quarterly access reviews scheduled and documented
- [ ] Vendor security assessments completed for all critical services
- [ ] Monitoring and alerting configured for security events
- [ ] Vulnerability scanning automated and regular
- [ ] Business continuity and disaster recovery plans documented
- [ ] All policies versioned, approved, and accessible

## Common Pitfalls

1. **Audit fatigue** — logging everything creates noise. Log security-relevant events comprehensively, but make sure you can actually query and review them.
2. **Paper compliance** — policies that exist as documents but aren't followed are worse than no policies. Automate enforcement where possible.
3. **Scope creep** — SOC 2 audits have a defined scope. Document what's in scope clearly and don't accidentally include systems you can't control.
4. **Vendor blind spots** — your SOC 2 compliance is only as strong as your weakest vendor. Assess all services that touch customer data.
5. **Treating it as one-time** — SOC 2 Type II is ongoing. Build compliance into daily operations, not as a project with an end date.
