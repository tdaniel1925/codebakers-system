# Agent Improvement Workflow

> How agents self-improve from accumulated lessons, bug patterns, and performance data.

---

## Purpose

Agents are not static documents. They evolve based on real-world outcomes. This workflow defines exactly how lessons from projects flow into agent updates — what triggers an update, who reviews it, how it's tested, and how improvement is measured. The goal is a system where every bug that slips through makes the agent smarter, and every pattern that succeeds gets codified.

---

## Improvement Loop

```
┌─────────────────────────────────────────────┐
│                                             │
│   1. SIGNAL                                 │
│   Bug reported / lesson captured /          │
│   metric drops / pattern detected           │
│                                             │
│              │                              │
│              ▼                              │
│                                             │
│   2. DIAGNOSE                               │
│   Which agent should have caught this?      │
│   What was missing from the agent?          │
│                                             │
│              │                              │
│              ▼                              │
│                                             │
│   3. UPDATE                                 │
│   Add pattern / anti-pattern / checklist    │
│   item / code template to the agent         │
│                                             │
│              │                              │
│              ▼                              │
│                                             │
│   4. VALIDATE                               │
│   Would the update have caught the          │
│   original issue? Does it cause false       │
│   positives? Is it clear enough?            │
│                                             │
│              │                              │
│              ▼                              │
│                                             │
│   5. SHIP                                   │
│   Commit to codebakers-system repo          │
│   Manifest auto-rebuilds                    │
│                                             │
│              │                              │
│              ▼                              │
│                                             │
│   6. MEASURE                                │
│   Track: did similar bugs stop appearing    │
│   in subsequent projects?                   │
│                                             │
│              │                              │
│              ▼                              │
│   (back to 1 — continuous loop)             │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Triggers for Agent Updates

### Automatic Triggers (act within 1 week)

| Trigger | Source | Action |
|---------|--------|--------|
| Bug reaches production that an agent's checklist should have caught | Bug report / incident | Add to checklist + anti-patterns |
| Same bug category appears in 3+ projects | `scores.json` bug_patterns | Add to anti-patterns + common pitfalls |
| Agent effectiveness score drops below 70% | `scores.json` agent_performance | Review and strengthen weak areas |
| Lesson marked as `severity: critical` | Lesson capture | Apply same day |
| New framework version introduces breaking change | Framework changelog | Update standards & patterns |

### Manual Triggers (act during monthly review)

| Trigger | Source | Action |
|---------|--------|--------|
| Lesson marked as `severity: medium` or `low` | Lesson capture | Batch and apply during review |
| Estimation variance > 30% for a feature type | `scores.json` estimation | Update estimation benchmarks |
| New code pattern proves effective across 2+ projects | Team observation | Add to standards & code templates |
| Client feedback highlights a gap | Client communication | Add to relevant agent section |
| New third-party best practice published | Documentation / blog | Update integration patterns |

---

## Update Types

### 1. Anti-Pattern Addition

**When:** A mistake was made that the agent should prevent in the future.

**Where in agent:** `## Anti-Patterns (NEVER Do)` section

**Format:**
```markdown
- **NEVER [do the thing]** — [why it's bad and what happens if you do it]
```

**Quality bar:**
- Specific enough to act on (not "be careful with X")
- Includes the consequence (not just "don't do this")
- Generalizable across projects (not project-specific)

---

### 2. Checklist Item Addition

**When:** A verification step was missing that would have caught an issue.

**Where in agent:** `## Checklist` section

**Format:**
```markdown
- [ ] [Specific, verifiable action]
```

**Quality bar:**
- Binary (pass/fail — no ambiguity)
- Can be verified in under 2 minutes
- Not redundant with existing items

---

### 3. Pattern Addition

**When:** A technique proved effective and should be reused.

**Where in agent:** `## Standards & Patterns` section

**Format:**
```markdown
### [Pattern Name]

[1-2 sentences: when to use this pattern]

\`\`\`typescript
// Code example
\`\`\`

[1-2 sentences: key considerations or gotchas]
```

**Quality bar:**
- Tested in at least 1 real project
- Includes working code example
- Explains when to use (not just how)

---

### 4. Common Pitfall Addition

**When:** A non-obvious issue was discovered that others would likely hit.

**Where in agent:** `## Common Pitfalls` section

**Format:**
```markdown
X. **[Short description]** — [explanation of why this happens and how to avoid it]
```

**Quality bar:**
- Not obvious (if everyone would know this, it's not a pitfall)
- Includes the fix, not just the problem
- Drawn from real experience, not hypothetical

---

### 5. Code Template Update

**When:** A reusable code pattern is created or an existing one needs fixing.

**Where:** `templates/code/` directory

**Quality bar:**
- Production-ready (not a rough draft)
- Includes error handling
- Typed (TypeScript, no `any`)
- Tested in at least 1 project

---

### 6. Trigger Keyword Update

**When:** Users describe a need using words that don't match the agent's current triggers.

**Where in agent:** YAML header `triggers:` field

**Format:** Add the new keyword to the comma-separated list.

**Quality bar:**
- The keyword genuinely maps to this agent's domain
- Not so generic that it fires on unrelated requests
- Confirmed by at least 1 real instance of a user using this word

---

## Update Process

### For Critical Updates (same day)

```
1. Identify the agent that needs updating
2. Write the update (anti-pattern, checklist item, etc.)
3. Self-review: "Would this have caught the original issue?"
4. Commit directly to main branch with descriptive message:
   git commit -m "fix(database.md): add RLS check for junction tables
   
   Lesson: 2025-02-15-rls-junction-tables
   Project: Apex Portal
   Bug: Junction table exposed all org memberships"
5. Manifest auto-rebuilds
6. Note in scores.json lessons section: applied = true
```

### For Standard Updates (weekly batch)

```
1. Collect all pending lessons and observations
2. Group by agent
3. Draft all updates for each agent
4. Review each update against quality bar
5. Commit as a single batch:
   git commit -m "improve: weekly agent updates (3 agents, 7 changes)
   
   - database.md: 2 anti-patterns, 1 checklist item
   - security.md: 1 pattern, 1 pitfall
   - billing.md: 2 checklist items"
6. Update scores.json lessons: applied = true for all
```

### For Major Revisions (quarterly)

```
1. Review full agent against current best practices
2. Remove outdated patterns (deprecated APIs, old library versions)
3. Reorganize if needed (split overgrown sections)
4. Update code examples to current framework versions
5. Review against reference projects for completeness
6. Full team review before merge
7. Commit with detailed changelog
```

---

## Agent Quality Standards

Every agent update must maintain these standards:

### Content Standards

```
Accuracy:
├── All code examples compile and run
├── All library references are current (not deprecated)
├── All patterns tested in at least 1 real project
└── No contradictions between sections

Completeness:
├── Every anti-pattern has a consequence stated
├── Every pattern has a code example
├── Every checklist item is verifiable
├── Every pitfall has a prevention strategy
└── "Also Consider" references are valid agent filenames

Clarity:
├── No jargon without explanation
├── No ambiguous instructions ("be careful with X")
├── Code examples include comments on non-obvious lines
├── Section structure matches the standard agent template
└── Trigger keywords actually match user language
```

### Size Guidelines

```
Section maximum lengths:
├── Anti-Patterns: 10-15 items (if more, the domain should be split)
├── Standards & Patterns: 5-8 major patterns with code examples
├── Checklist: 12-18 items (if more, group into subsections)
├── Common Pitfalls: 5-8 items
├── Code Templates: reference, don't inline (unless < 30 lines)
└── Total agent file: aim for < 500 lines (excluding code blocks)

If an agent exceeds these limits, consider:
├── Splitting into two agents with narrower scope
├── Moving code examples to templates/code/
└── Condensing repetitive patterns into tables
```

---

## Measuring Improvement

### Per-Agent Metrics

Track in `scores.json` → `agent_performance`:

```
effectiveness_score = (bugs_caught_by_checklist / total_bugs_in_domain) × 100

Target: > 80% effectiveness
Action if < 70%: Priority review and strengthening
```

### System-Wide Metrics

```
Quarterly comparison:
├── Total bugs per project: trending down?
├── Bugs caught before production: percentage increasing?
├── Average estimation variance: shrinking?
├── Mean time to resolve incidents: decreasing?
├── Agent effectiveness scores: improving?
└── Lessons applied vs pending: ratio staying healthy?
```

### Improvement Velocity

```
Track per quarter:
├── Agent updates shipped: [count]
├── New anti-patterns added: [count]
├── New checklist items added: [count]
├── New code templates added: [count]
├── Outdated patterns removed: [count]
└── Agents receiving updates: [count] / [total agents]

Healthy system: 10-20 agent updates per quarter
Stale system: < 5 updates per quarter → review process
Churning system: > 40 updates per quarter → updates may be too granular
```

---

## Deprecation and Removal

Not all agent content lives forever. Remove content when:

```
REMOVE when:
├── A library or framework is no longer in the stack
├── A pattern has been superseded by a better one
├── An anti-pattern is no longer possible (API changed)
├── A checklist item has had 0 catches in 6+ months (may be too obvious)
└── A code template references deprecated APIs

Process:
1. Mark as deprecated with a comment: <!-- DEPRECATED: [reason], remove after [date] -->
2. Add replacement pattern if one exists
3. Remove after 1 quarter if no objections
4. Log removal in quarterly lessons archive
```

---

## Quick Reference

```
Bug hit production?
→ Which agent? → Add anti-pattern + checklist item → Commit today

Pattern worked great?
→ Which agent? → Add to Standards & Patterns → Commit this week

Same issue in 3+ projects?
→ scores.json confirms pattern → Strengthen agent → Commit today

Quarterly review?
→ Review all agent effectiveness scores
→ Remove outdated content
→ Update code examples to current versions
→ Archive lessons
→ Measure: are we getting better?
```

---

## The Flywheel

```
Better agents → Fewer bugs → Better scores → More lessons
     ↑                                           │
     └───────────────── applied to ──────────────┘
```

This is the core value of the CodeBakers system: every project makes the system smarter. The agents aren't just documentation — they're a living, evolving knowledge base that compounds in value with every engagement.
