---
name: Education Industry Specialist
tier: industries
triggers: education, lms, courses, enrollment, grading, certificates, learning management, curriculum, students, instructors, assignments, quizzes, transcripts, e-learning, continuing education, training platform, courseware, gradebook, academic
depends_on: database.md, auth.md, billing.md, video.md
conflicts_with: null
prerequisites: null
description: Education domain expertise — course catalog and curriculum management, student enrollment, assignment and quiz systems, gradebook with weighted scoring, certificate/credential issuance, LMS patterns, continuing education credits, and student/instructor portals
code_templates: null
design_tokens: tokens-saas.css
---

# Education Industry Specialist

## Role

Provides deep domain expertise for building education technology applications — learning management systems (LMS), course marketplaces, training platforms, and academic management tools. Understands course structure design, enrollment workflows, assignment and assessment patterns, grading calculations, certificate issuance, and the compliance requirements for accredited education (FERPA, continuing education credits). Ensures every education app supports both self-paced and instructor-led learning with proper progress tracking, assessments, and credentialing.

## When to Use

- Building a learning management system (LMS) or course platform
- Implementing course catalog with curriculum and lesson structures
- Building enrollment and registration workflows with payment
- Implementing assignments, quizzes, and exam systems
- Building a gradebook with weighted scoring and grade scales
- Implementing certificate or credential issuance upon completion
- Building continuing education (CE/CPE/CME) credit tracking
- Designing student and instructor dashboards
- Building cohort-based or self-paced course delivery
- Implementing discussion forums and peer interaction features

## Also Consider

- **billing.md** — for course payments, subscription models, and refund policies
- **video.md** — for video lesson hosting and streaming
- **saas.md** — for multi-tenant architecture if building a platform (multiple schools/orgs)
- **notifications.md** — for assignment due dates, grade alerts, and enrollment confirmations
- **email.md** — for enrollment receipts, course reminders, and certificate delivery
- **scheduling.md** — for live session scheduling (webinars, office hours)
- **document-ai.md** — for certificate PDF generation
- **dashboard.md** — for student progress and instructor analytics
- **gamification.md** — for badges, streaks, leaderboards, and engagement mechanics

## Anti-Patterns (NEVER Do)

1. **Never expose student grades to other students.** FERPA prohibits disclosure of education records to unauthorized parties. Grade visibility must be strictly limited to the student, their instructors, and authorized administrators.
2. **Never allow grade modification without audit trail.** Every grade change must record who changed it, when, and why. Grade disputes are common and the audit trail is the resolution mechanism.
3. **Never hardcode grading scales.** A-F, pass/fail, percentage, competency-based — different courses and institutions use different scales. Make grading configurable per course.
4. **Never delete student enrollment or completion records.** These are academic records with legal retention requirements. Archived or withdrawn, never deleted.
5. **Never auto-submit timed assessments without warning.** Students must receive clear warnings at 5 minutes and 1 minute before time expires. Auto-submission without warning is a top complaint.
6. **Never issue certificates without verifiable credentials.** Every certificate needs a unique verification code or URL that third parties can use to confirm authenticity.
7. **Never assume linear course progression.** Some courses allow skipping ahead, some require strict sequential completion, some use prerequisite chains. Support all three models.
8. **Never ignore accessibility.** Educational content must meet WCAG 2.1 AA standards. Video needs captions, documents need screen reader support, and timed assessments need accommodation extensions.

## Standards & Patterns

### Core Data Model

```
Education Platform
├── Courses
│   ├── Course Info (title, description, objectives, prerequisites)
│   ├── Curriculum Structure
│   │   ├── Modules (units/chapters)
│   │   │   ├── Lessons (individual learning items)
│   │   │   │   ├── Video, Text, File, Interactive, External Link
│   │   │   │   └── Completion criteria (view, duration, interaction)
│   │   │   ├── Assignments (submitted work)
│   │   │   └── Quizzes / Exams (auto-graded or manual)
│   │   └── Completion Rules (all lessons, min score, % complete)
│   ├── Pricing (free, one-time, subscription, bundle)
│   ├── Instructor(s)
│   └── Settings (self-paced, cohort, scheduled, prerequisite chain)
├── Enrollments
│   ├── Student → Course mapping
│   ├── Progress tracking per lesson
│   ├── Assignment submissions
│   ├── Quiz attempts and scores
│   └── Final grade and completion status
├── Certificates
│   ├── Templates per course
│   ├── Issued certificates with verification codes
│   └── CE/CPE credits (if applicable)
├── Students (Learners)
│   ├── Profile, enrollments, progress, grades
│   └── Transcript (all courses + grades + certificates)
└── Instructors
    ├── Courses taught
    ├── Gradebook access
    └── Analytics (student progress, completion rates)
```

### Course & Curriculum Schema

```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  description_html TEXT,
  thumbnail_url TEXT,
  preview_video_url TEXT,
  
  -- Classification
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced', 'all_levels')),
  language TEXT DEFAULT 'en',
  estimated_duration_minutes INT,
  
  -- Delivery
  delivery_type TEXT NOT NULL DEFAULT 'self_paced'
    CHECK (delivery_type IN ('self_paced', 'cohort', 'instructor_led', 'blended')),
  enrollment_type TEXT NOT NULL DEFAULT 'open'
    CHECK (enrollment_type IN ('open', 'approval_required', 'invite_only', 'closed')),
  progression_type TEXT NOT NULL DEFAULT 'sequential'
    CHECK (progression_type IN ('sequential', 'flexible', 'prerequisite_based')),
  
  -- Completion
  completion_criteria TEXT NOT NULL DEFAULT 'all_required'
    CHECK (completion_criteria IN ('all_required', 'percentage', 'minimum_score', 'manual')),
  completion_percentage INT DEFAULT 100,     -- For percentage-based completion
  passing_score DECIMAL(5,2),                -- Minimum grade to pass
  
  -- Pricing
  pricing_type TEXT NOT NULL DEFAULT 'free'
    CHECK (pricing_type IN ('free', 'one_time', 'subscription', 'bundle_only')),
  price DECIMAL(8,2),
  currency TEXT DEFAULT 'USD',
  stripe_price_id TEXT,
  
  -- Credentials
  certificate_enabled BOOLEAN NOT NULL DEFAULT false,
  ce_credits DECIMAL(5,2),                   -- Continuing education credits awarded
  ce_credit_type TEXT,                       -- 'CPE', 'CME', 'CLE', 'CE', etc.
  
  -- Prerequisites
  prerequisite_course_ids UUID[] DEFAULT '{}',
  
  -- Instructors
  primary_instructor_id UUID REFERENCES users(id),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived', 'under_review')),
  published_at TIMESTAMPTZ,
  
  -- Metadata
  max_students INT,                          -- NULL = unlimited
  enrollment_count INT NOT NULL DEFAULT 0,   -- Denormalized
  average_rating DECIMAL(3,2),
  rating_count INT DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(org_id, slug)
);

-- Modules (sections/chapters within a course)
CREATE TABLE course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  position INT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  unlock_date TIMESTAMPTZ,               -- For drip/scheduled content
  prerequisite_module_id UUID REFERENCES course_modules(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(course_id, position)
);

-- Lessons (individual learning items within a module)
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,
  lesson_type TEXT NOT NULL
    CHECK (lesson_type IN ('video', 'text', 'file', 'interactive', 'external_link',
      'assignment', 'quiz', 'live_session', 'discussion')),
  content_html TEXT,                     -- For text lessons
  video_url TEXT,                        -- For video lessons
  video_duration_seconds INT,
  file_url TEXT,                         -- For downloadable files
  external_url TEXT,
  
  -- Completion rules for this lesson
  completion_type TEXT NOT NULL DEFAULT 'view'
    CHECK (completion_type IN ('view', 'duration', 'interaction', 'submission', 'score', 'manual')),
  min_duration_seconds INT,              -- For duration-based completion
  min_score DECIMAL(5,2),                -- For score-based completion
  
  position INT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_previewable BOOLEAN NOT NULL DEFAULT false,  -- Can non-enrolled users preview?
  estimated_minutes INT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(module_id, position)
);
```

### Enrollment Schema

```sql
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  student_id UUID NOT NULL REFERENCES users(id),
  
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'completed', 'failed',
      'withdrawn', 'suspended', 'expired')),
  
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,                -- When student first accessed content
  completed_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,                -- For time-limited access
  
  -- Progress
  progress_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  lessons_completed INT NOT NULL DEFAULT 0,
  lessons_total INT NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  last_lesson_id UUID REFERENCES lessons(id),
  time_spent_seconds BIGINT NOT NULL DEFAULT 0,
  
  -- Grading
  current_grade DECIMAL(5,2),            -- Running grade (0-100)
  final_grade DECIMAL(5,2),
  grade_letter TEXT,
  passed BOOLEAN,
  
  -- Payment
  payment_status TEXT DEFAULT 'paid'
    CHECK (payment_status IN ('free', 'paid', 'refunded', 'scholarship')),
  stripe_payment_id TEXT,
  amount_paid DECIMAL(8,2),
  
  -- Certificate
  certificate_issued BOOLEAN NOT NULL DEFAULT false,
  certificate_id UUID REFERENCES certificates(id),
  
  -- Cohort (for cohort-based courses)
  cohort_id UUID REFERENCES cohorts(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(course_id, student_id)
);

-- Per-lesson progress tracking
CREATE TABLE lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id),
  student_id UUID NOT NULL REFERENCES users(id),
  
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  time_spent_seconds INT NOT NULL DEFAULT 0,
  last_position_seconds INT,             -- Video resume position
  attempts INT NOT NULL DEFAULT 0,       -- For quizzes
  best_score DECIMAL(5,2),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(enrollment_id, lesson_id)
);

CREATE INDEX idx_enrollments_student ON enrollments(student_id, status);
CREATE INDEX idx_enrollments_course ON enrollments(course_id, status);
CREATE INDEX idx_lesson_progress_enrollment ON lesson_progress(enrollment_id);
```

### Assignment System

```sql
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,
  instructions_html TEXT NOT NULL,
  
  assignment_type TEXT NOT NULL DEFAULT 'file_upload'
    CHECK (assignment_type IN ('file_upload', 'text_entry', 'url_submission', 'code', 'peer_review')),
  
  max_score DECIMAL(6,2) NOT NULL DEFAULT 100,
  weight DECIMAL(5,4) NOT NULL DEFAULT 1.0,  -- Weight in overall grade
  
  due_date TIMESTAMPTZ,
  late_submission_policy TEXT DEFAULT 'allowed'
    CHECK (late_submission_policy IN ('allowed', 'penalty', 'not_allowed')),
  late_penalty_per_day DECIMAL(5,2),     -- Points deducted per day late
  max_late_days INT,
  
  max_attempts INT DEFAULT 1,
  max_file_size_mb INT DEFAULT 25,
  allowed_file_types TEXT[],             -- ['.pdf', '.docx', '.zip']
  
  rubric JSONB,                          -- Grading rubric
  /*
    [
      { "criterion": "Completeness", "max_points": 30, "description": "All requirements addressed" },
      { "criterion": "Quality", "max_points": 40, "description": "Depth of analysis" },
      { "criterion": "Presentation", "max_points": 30, "description": "Organization and clarity" }
    ]
  */
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id),
  student_id UUID NOT NULL REFERENCES users(id),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id),
  
  submission_type TEXT NOT NULL,
  content_text TEXT,                     -- For text entries
  file_url TEXT,                         -- For file uploads
  file_name TEXT,
  url TEXT,                              -- For URL submissions
  
  attempt_number INT NOT NULL DEFAULT 1,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_late BOOLEAN NOT NULL DEFAULT false,
  days_late INT DEFAULT 0,
  
  -- Grading
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted', 'grading', 'graded', 'returned', 'resubmit_requested')),
  score DECIMAL(6,2),
  score_after_penalty DECIMAL(6,2),
  feedback_html TEXT,
  rubric_scores JSONB,                   -- Scores per rubric criterion
  graded_by UUID REFERENCES users(id),
  graded_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_submissions_assignment ON assignment_submissions(assignment_id, student_id);
CREATE INDEX idx_submissions_grading ON assignment_submissions(status)
  WHERE status IN ('submitted', 'grading');
```

### Quiz / Exam System

```sql
CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,
  instructions TEXT,
  
  quiz_type TEXT NOT NULL DEFAULT 'graded'
    CHECK (quiz_type IN ('practice', 'graded', 'survey', 'final_exam')),
  
  max_score DECIMAL(6,2) NOT NULL DEFAULT 100,
  weight DECIMAL(5,4) NOT NULL DEFAULT 1.0,
  passing_score DECIMAL(5,2),
  
  time_limit_minutes INT,                -- NULL = no time limit
  max_attempts INT DEFAULT 1,            -- -1 = unlimited
  attempt_scoring TEXT DEFAULT 'highest'
    CHECK (attempt_scoring IN ('highest', 'latest', 'average')),
  
  show_results TEXT DEFAULT 'after_submit'
    CHECK (show_results IN ('never', 'after_submit', 'after_deadline', 'after_grading')),
  show_correct_answers BOOLEAN DEFAULT true,
  shuffle_questions BOOLEAN DEFAULT false,
  shuffle_answers BOOLEAN DEFAULT false,
  
  questions_to_show INT,                 -- Show N random from pool (NULL = show all)
  
  available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL
    CHECK (question_type IN ('multiple_choice', 'multiple_select', 'true_false',
      'short_answer', 'essay', 'fill_blank', 'matching', 'ordering')),
  question_html TEXT NOT NULL,
  explanation_html TEXT,                 -- Shown after answering
  points DECIMAL(5,2) NOT NULL DEFAULT 1,
  position INT NOT NULL,
  
  -- Answer options (for MC, MS, TF, matching)
  options JSONB,
  /*
    Multiple choice:
    [
      { "id": "a", "text": "Option A", "is_correct": false },
      { "id": "b", "text": "Option B", "is_correct": true },
      { "id": "c", "text": "Option C", "is_correct": false }
    ]
    
    Matching:
    [
      { "left": "Term 1", "right": "Definition 1" },
      { "left": "Term 2", "right": "Definition 2" }
    ]
  */
  
  correct_answer TEXT,                   -- For short_answer, fill_blank
  case_sensitive BOOLEAN DEFAULT false,
  partial_credit BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id),
  student_id UUID NOT NULL REFERENCES users(id),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id),
  attempt_number INT NOT NULL DEFAULT 1,
  
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'graded', 'timed_out')),
  
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  time_spent_seconds INT,
  
  score DECIMAL(6,2),
  max_score DECIMAL(6,2),
  percentage DECIMAL(5,2),
  passed BOOLEAN,
  
  answers JSONB NOT NULL DEFAULT '{}',
  /*
    {
      "question_id_1": { "answer": "b", "correct": true, "points_earned": 1 },
      "question_id_2": { "answer": ["a", "c"], "correct": false, "points_earned": 0 }
    }
  */
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_attempts_student ON quiz_attempts(student_id, quiz_id);
```

### Gradebook

```typescript
interface GradeCalculation {
  enrollment_id: string;
  student_name: string;
  
  // Per-category grades
  categories: {
    name: string;           // 'Assignments', 'Quizzes', 'Final Exam', 'Participation'
    weight: number;         // 0.0 - 1.0 (all categories must sum to 1.0)
    items: {
      name: string;
      score: number | null;
      max_score: number;
      percentage: number | null;
    }[];
    category_average: number | null;
    weighted_contribution: number | null;
  }[];
  
  // Overall
  current_grade: number;    // 0-100
  grade_letter: string;     // A, B+, C, etc.
  passed: boolean;
}

// Grade scale (configurable per course)
const DEFAULT_GRADE_SCALE = [
  { letter: 'A',  min: 93,  max: 100 },
  { letter: 'A-', min: 90,  max: 92.99 },
  { letter: 'B+', min: 87,  max: 89.99 },
  { letter: 'B',  min: 83,  max: 86.99 },
  { letter: 'B-', min: 80,  max: 82.99 },
  { letter: 'C+', min: 77,  max: 79.99 },
  { letter: 'C',  min: 73,  max: 76.99 },
  { letter: 'C-', min: 70,  max: 72.99 },
  { letter: 'D+', min: 67,  max: 69.99 },
  { letter: 'D',  min: 60,  max: 66.99 },
  { letter: 'F',  min: 0,   max: 59.99 },
];

async function calculateGrade(enrollmentId: string): Promise<number> {
  const enrollment = await getEnrollmentWithCourse(enrollmentId);
  const gradeItems = await getGradeItems(enrollment.course_id);
  
  let totalWeightedScore = 0;
  let totalWeight = 0;
  
  for (const category of gradeItems) {
    const submissions = await getStudentScores(enrollmentId, category.item_ids);
    
    if (submissions.length === 0) continue;
    
    // Category average
    const categoryTotal = submissions.reduce((s, sub) => s + (sub.score ?? 0), 0);
    const categoryMax = submissions.reduce((s, sub) => s + sub.max_score, 0);
    const categoryPct = categoryMax > 0 ? (categoryTotal / categoryMax) * 100 : 0;
    
    totalWeightedScore += categoryPct * category.weight;
    totalWeight += category.weight;
  }
  
  // Normalize if not all categories have grades yet
  const currentGrade = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
  return Math.round(currentGrade * 100) / 100;
}
```

### Certificate System

```sql
CREATE TABLE certificate_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  course_id UUID REFERENCES courses(id),
  name TEXT NOT NULL,
  template_html TEXT NOT NULL,           -- HTML template with {{placeholders}}
  background_image_url TEXT,
  signature_image_url TEXT,
  signer_name TEXT,
  signer_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES certificate_templates(id),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id),
  student_id UUID NOT NULL REFERENCES users(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  
  certificate_number TEXT NOT NULL UNIQUE,  -- Unique verification code
  verification_url TEXT NOT NULL,           -- Public URL to verify
  
  student_name TEXT NOT NULL,            -- Snapshot at time of issue
  course_title TEXT NOT NULL,            -- Snapshot
  completion_date DATE NOT NULL,
  grade TEXT,
  ce_credits DECIMAL(5,2),
  ce_credit_type TEXT,
  
  pdf_url TEXT,                          -- Generated PDF
  
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Public verification endpoint (no auth required)
-- GET /verify/:certificate_number
-- Returns: student name, course, date, status (valid/revoked)
```

### Certificate Issuance

```typescript
async function issueCertificate(enrollmentId: string): Promise<Certificate> {
  const enrollment = await getEnrollmentWithDetails(enrollmentId);
  
  // Verify completion
  if (enrollment.status !== 'completed' || !enrollment.passed) {
    throw new Error('Student has not completed or passed the course');
  }
  
  // Check if already issued
  if (enrollment.certificate_issued) {
    throw new Error('Certificate already issued for this enrollment');
  }
  
  // Generate unique certificate number
  const certNumber = generateCertNumber(); // e.g., 'CERT-2024-A7B3C9'
  const verificationUrl = `${process.env.APP_URL}/verify/${certNumber}`;
  
  // Create certificate record
  const cert = await supabase.from('certificates').insert({
    template_id: enrollment.course.certificate_template_id,
    enrollment_id: enrollmentId,
    student_id: enrollment.student_id,
    course_id: enrollment.course_id,
    certificate_number: certNumber,
    verification_url: verificationUrl,
    student_name: `${enrollment.student.first_name} ${enrollment.student.last_name}`,
    course_title: enrollment.course.title,
    completion_date: enrollment.completed_at,
    grade: enrollment.grade_letter,
    ce_credits: enrollment.course.ce_credits,
    ce_credit_type: enrollment.course.ce_credit_type,
  }).select().single();
  
  // Generate PDF
  const pdfUrl = await generateCertificatePdf(cert.data);
  
  // Update enrollment
  await supabase.from('enrollments').update({
    certificate_issued: true,
    certificate_id: cert.data.id,
  }).eq('id', enrollmentId);
  
  // Send email with certificate
  await sendCertificateEmail(enrollment.student.email, cert.data, pdfUrl);
  
  return cert.data;
}

function generateCertNumber(): string {
  const year = new Date().getFullYear();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CERT-${year}-${random}`;
}
```

### Discussion Forums

```sql
CREATE TABLE discussion_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  lesson_id UUID REFERENCES lessons(id),  -- NULL = course-level discussion
  author_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body_html TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  reply_count INT NOT NULL DEFAULT 0,
  last_reply_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE discussion_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  parent_reply_id UUID REFERENCES discussion_replies(id),  -- For nested replies
  body_html TEXT NOT NULL,
  is_instructor_reply BOOLEAN NOT NULL DEFAULT false,
  is_accepted_answer BOOLEAN NOT NULL DEFAULT false,
  upvote_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Student Transcript

```typescript
interface Transcript {
  student_name: string;
  student_id: string;
  generated_at: string;
  
  courses: {
    course_title: string;
    enrolled_date: string;
    completed_date: string | null;
    status: string;
    grade: string | null;
    grade_letter: string | null;
    credits: number | null;
    certificate_number: string | null;
  }[];
  
  summary: {
    total_courses_completed: number;
    total_credits_earned: number;
    overall_gpa: number | null;
    total_time_spent_hours: number;
  };
}
```

### Cohort-Based Delivery

```sql
CREATE TABLE cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  name TEXT NOT NULL,                    -- 'Spring 2024 Cohort'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  max_students INT,
  enrollment_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled')),
  instructor_id UUID REFERENCES users(id),
  meeting_schedule JSONB,                -- For live sessions
  /*
    {
      "day": "Wednesday",
      "time": "14:00",
      "duration_minutes": 60,
      "platform": "zoom",
      "meeting_url": "https://zoom.us/..."
    }
  */
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Code Templates

No dedicated code templates — the inline patterns cover course management, enrollment, assignments, quizzes, grading, certificates, and discussions comprehensively.

## Checklist

- [ ] Course catalog with modules → lessons hierarchical structure
- [ ] Multiple lesson types supported (video, text, file, interactive, live session)
- [ ] Enrollment workflow with payment integration and approval options
- [ ] Progress tracking at lesson level with completion criteria per lesson type
- [ ] Assignment submission system with file upload, rubric grading, and feedback
- [ ] Quiz engine with multiple question types and auto-grading
- [ ] Timed assessments with warnings and auto-submission
- [ ] Multiple quiz attempts with configurable scoring (highest, latest, average)
- [ ] Weighted gradebook with configurable categories and grade scales
- [ ] Grade audit trail — every change logged with who, when, and reason
- [ ] Certificate generation with unique verification codes and public verification URL
- [ ] CE/CPE credit tracking for continuing education courses
- [ ] Self-paced and cohort-based delivery modes
- [ ] Discussion forums with threaded replies and instructor highlighting
- [ ] Student transcript generation
- [ ] FERPA compliance — student records accessible only to authorized parties
- [ ] Accessibility: video captions, screen reader support, assessment accommodations
- [ ] No deletion of enrollment or completion records

## Common Pitfalls

1. **Grade calculation timing** — Recalculating grades on every page load is expensive. Calculate on grade-change events (submission graded, quiz completed) and cache the result on the enrollment record.
2. **Late submission edge cases** — Time zones matter. A student in PST submitting at 11:59 PM is past midnight for the server in EST. Always compare against the student's local timezone or use explicit UTC deadlines.
3. **Quiz question pooling** — When "show N random questions" is enabled, different students see different questions. The system must store which questions each student received per attempt for grade fairness and dispute resolution.
4. **Video progress tracking** — Students skip ahead in videos. Tracking "completed" by reaching the end isn't enough if they jumped to 95% and watched 30 seconds. Track actual watch time and require a minimum percentage.
5. **Prerequisite loops** — Course A requires B, B requires C, C requires A. Validate prerequisite chains for cycles when instructors configure requirements.
6. **Certificate revocation** — If a course is later found to have compliance issues, or a student is found to have cheated, certificates must be revocable. The verification endpoint must reflect current status.
7. **Content drip scheduling** — In cohort courses, modules unlock on a schedule. But students in different time zones see different "start of day." Define unlock times explicitly (e.g., "Monday 12:00 AM UTC") rather than using ambiguous dates.
