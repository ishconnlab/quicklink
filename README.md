# QuickLink

QuickLink is IshConnect's online learning platform for self-paced courses, scheduled live trainings, practical work, assessments, notifications, and verifiable certificates. It keeps the QuickLink name and current application design.

Accounts are either administrators or students. Administrators manage offerings, rosters, applications, learning content, assignments, and certificates. Students register, receive approved assignments, study, attend live classes, submit work, and earn certificates.

## Courses and trainings

- **Courses** and **Trainings** are separate offering types in one catalogue. Courses are self-paced and have no live-class schedule or attendance requirement; trainings are scheduled and may include live sessions. Students browse both from **Courses and trainings** and see their enrolled offerings on the dashboard.
- Admins create and manage offerings from the **Courses** and **Trainings** sidebar entries. The editor covers title, introduction, description, subject/trade, level, course or program, difficulty, duration, learning objectives, prerequisites, language, instructor details, capacity, enrollment windows, publication, thumbnail, completion rules, payments, and assessments. A validated PNG, JPEG, or WebP thumbnail (maximum 3 MB) is supported.
- Admins add course content from the course detail page through **Manage lessons**. Modules contain lessons with Markdown theory, practical work, code examples, optional images and videos, resource links, and optional knowledge checks. The full theory is entered in the lesson editor; code is pasted directly into **Code examples**, not uploaded as JSON.
- Code examples preserve their source, provide a complete **Copy code** action, render in a Mac-style code window, and use independent horizontal scrolling so long lines do not widen the lesson page. Duplicate lesson titles and duplicate code examples are rejected when the course is saved.
- Lesson access can be daily, sequential, or scheduled. Learners start with the first two lessons open; completing a lesson unlocks the next daily lesson at 6:00 AM in the course timezone. Locked lesson content is withheld by the server, and early completion or assessment requests are rejected.
- A course can include at most three quiz-based lessons. Each intermediate assessment contains 5 or 10 single-answer questions with four options, a passing percentage, and an attempt limit. Assessment tab changes, focus loss, fullscreen exits, copy attempts, and context-menu use are recorded as best-effort integrity events.
- Progress is stored per student and course in MongoDB. Students see their completion percentage, unlocked lessons, completed lessons, and remaining requirements.
- Admins can configure a final certification assessment of up to 100 single-answer questions with four options. Attempts (1-10), pass mark, time limit (0-240 minutes), and lockdown can be set. Students must complete every lesson and submit the configured project before starting it. Questions and the time limit are locked after the first attempt; attempts and integrity events are recorded.
- Admins can enable a project submission requirement for a course, with instructions, GitHub or other link options, and an optional required description. Students submit a link and description; admins review and mark it approved or request changes.

## Live classes

- Admins create, edit, schedule, archive, restore, and permanently delete trainings. Settings include program, level, timezone, duration, capacity, enrollment state, roster, payment rules, and assessment requirements.
- The admin dashboard summarizes students, trainings, enrollments, pending payments, live classes, certificates, project submissions, revenue, recent enrollments, upcoming trainings, recent activity, and new assignment/project submissions.
- Permanently deleting a training also removes its sessions, attendance, assignments and submissions, invitation records, training registrations, enrollments, and certificates. This action cannot be undone.
- Students see the trainings they are enrolled in. A published training can also be joined directly while enrollment is open, the enrollment window allows it, and capacity remains. Students can leave a training unless cancellation is disabled or a live session is running.
- An admin starts a live class and QuickLink creates a join link that can be copied and shared with enrolled students. The class page shows a **Not live** waiting status and refreshes automatically, so students receive the join button within about twelve seconds of the session starting.
- Admins can email individual or bulk invitations to enrolled student accounts. Each message is private to one recipient and contains a single-use, expiring link (seven days). Invitation delivery status is tracked; invitations fail clearly until SMTP is configured. Admins can also generate prefilled WhatsApp messages for manual delivery.
- The live room uses LiveKit Cloud through LiveKit's WebRTC client and server SDKs. Server-issued, short-lived tokens are restricted to authenticated class members and expired payment states are blocked. The QuickLink session uses an SFU; users stay on the QuickLink domain.
- The pre-join device check explains camera and microphone access, previews available devices after permission is granted, supports device selection, and allows joining with media off. The room supports audio/video, screen sharing, participant and connection state, real-time persistent chat, message pin/removal/report, and saved shared notes with revision conflict checks.
- Eight selectable layouts are provided: Auto, Grid, Speaker, Presentation Focus, Side-by-Side, Spotlight, Picture-in-Picture, and Compact Filmstrip. Layout choice is saved for the current session.
- Attendance starts when an authorized participant joins the authenticated room and closes on leave or disconnect. Reconnects add separate intervals to the same student record; if the server restarts, an open interval is closed at the next join or session end. Late means the first join is later than scheduled start plus the class late threshold. Early means time present is below the configured share of the session duration. Admins can correct status with a required reason and an audit entry.
- Admins end a session to finalize attendance, including absences. They can review class history, download a CSV report from a session, or export a PDF report filtered by date, student, session, or class.
- A join link requires the student to sign in and be enrolled in that class. Attendance is recorded when the authenticated member connects to the live room.

### Live class deployment notes

Socket.IO handles chat and authenticated attendance events on the API server. The host must support WebSocket upgrades. If the frontend and API use different origins, add the frontend origin to `CORS_ORIGIN`.

Live audio/video requires an active LiveKit Cloud project. In its project settings, copy the server URL, API key, and API secret into the backend deployment as `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`, then redeploy the API. For Render, add all three values to the QuickLink API service's **Environment** settings. Never put the API secret in Vite variables, the client `.env`, or source control. The device-check page reports when media is unavailable; chat and notes remain available, and **Close this tab** returns to the class if the browser blocks closing the tab. Administrators can grant an enrolled student screen-sharing permission from the People panel; the student must still choose to start sharing and can stop at any time. The account's plan, limits, and regional availability apply. Browsers require HTTPS (localhost is allowed for local development) and user permission for the microphone, camera, or screen. Screen sharing support varies by browser and mobile operating system; unsupported devices show a fallback message. QuickLink does not record media. Live attendance presence is in memory during a process lifetime and persisted as join intervals in MongoDB; one API instance is recommended until a shared Socket.IO adapter or presence store is configured.

For invitations configure `SMTP_URL`, `MAIL_FROM`, and the frontend `APP_URL` on the backend. Messages are individually addressed, never bulk-addressed. In tests without SMTP, invitation records report `failed` with a configuration error.

## Payments, enrollments, and registrations

- A training or course can enable manual mobile-money payment. Each offering stores its own amount, currency, payment code, account name, instructions, and free-access period. Self-paced courses use zero free days; trainings default to the platform payment settings.
- The free-access period is counted from the training start date, or from enrollment when no start date exists. After it ends, opening a paid course's lessons, joining a live session, and submitting the course project are blocked until an admin verifies the payment reference or waives the fee.
- Students submit the transaction reference and an optional note from the course page. Admins review enrollment payments in **Enrollments & payments**, where they can also search, filter, export, add or remove enrollments, and set payment status to pending, paid, waived, or rejected.
- Certificates can require a separate payment. Students submit the certificate payment reference after completing the requirements; admins verify or reject it from the certificate registry or course page. A paid certificate is not downloadable, shareable, or publicly verifiable until the payment is marked paid or waived.
- Admins create one registration form per active training from **Registrations**. A form supports a description, custom placeholders, up to 10 optional or required text fields, and an optional PNG/JPEG/WebP header image (maximum 3 MB). The public form is served by the API at `/api/registrations/public/:slug`.
- After submitting a form, a registrant can create a student account with the same email, verify ownership through a one-hour email link, set a password, and be enrolled automatically. Existing student accounts can sign in and link their registration. Registrants who have not linked accounts remain contact records and can be enrolled manually by an administrator.
- Admins can review registration entries, update statuses, enroll one or many registrants, send class emails with the class or live-session link, and generate prefilled WhatsApp messages. A registration alone does not grant class access; the registrant must verify their email and create or link a student account, which enrolls them in the class.
- Email invitations, account verification, and enrollment notices require `SMTP_URL`, `MAIL_FROM`, and `APP_URL`. Registration-form images use Cloudinary when its credentials are configured; otherwise they use local storage, which requires persistent disk.

## Assessments, practical work, and certificates

- Practical assignments publish objectives, materials, tasks, due dates, score limits, pass marks, submission requirements, and optional text or single-choice questions. Administrators can permanently delete practical assignments; deletion also removes student submissions and uploaded submission files.
- Admins can publish hands-on project tasks with a brief, objectives, tools, deliverables, and a due date. Students build the project and submit a GitHub or Google Drive link; admins review it, provide feedback, pass it, or request changes.
- Students can save drafts, submit text, links, or supported files (PDF, PNG/JPEG, ZIP, and UTF-8 text/source; up to five files at 10 MB each), and resubmit when enabled. Student code is stored as a file and never executed by the application server.
- Administrators review and grade submissions, leave feedback, request a revision, or mark work passed or failed. Grading history is retained, and students cannot grade their own work.
- Course completion can require lesson completion, a final certification assessment, a project submission, theory assessments, practical assignments, attendance, and a minimum score. When theory or practical checks are enabled, every published assignment in that category must pass. An unassigned category does not block certification.
- Attendance requires the configured minimum number of ended class sessions (two by default), regardless of how many sessions are held overall.
- A student can issue a course certificate only after all configured requirements pass. Admins can review enrolled students and issue certificates individually or in batches of up to 20 from a course page; the same completion checks apply.
- Admins can also issue a manual certificate for an external or historical completion without linking it to a student account or course. Manual certificates record the recipient name, certificate title, optional description, level, and issue date.
- The certificate registry supports search and filtering, PDF preview and download, editing printed name/title/description, revoking with a reason, reissuing with a new verification code, deleting, and reviewing certificate payments. Public verification shows valid, revoked, not-found, or payment-required status.
- Certificates use the IshConnect completion template, retain its printed signature without adding it a second time, and overlay the corporate seal beside the signature. Server-generated PDFs have unique IDs and a QR verification link at `/verify/:code`. Students can download and share issued certificates from their account; the public share link includes social preview metadata.
- Passing a document assessment also issues a verifiable QuickLink book certificate, which follows the same registry, revocation, and public verification rules.
- The certificate template, seal, Noto Sans fonts (licensed under SIL OFL), and their license are bundled under `server/assets/certificates` so PDF generation works when the backend is deployed with `server` as its root directory and supports accented names. Set `APP_URL` to the public frontend origin and `PUBLIC_API_URL` to the public backend origin for share previews; verification links use `APP_URL`.

## Accounts and access

- **Admin:** full access. Admins manage students, courses, trainings, live classes, rosters, enrollment capacity and payment status, course content, practical assignments, assessments, the certificate registry and issuance, registration forms, and the document library API. Admin accounts cannot be permanently deleted from **Students**, and the platform must keep at least one active administrator.
- **Student:** students may register at `/register` or be created by an admin. They can browse published courses and trainings, enroll subject to capacity and enrollment windows, read course lessons, submit practical work and projects, take assessments, track progress, join classes they are enrolled in, and download or share their certificates.
- Admins can search and paginate accounts, edit names, emails, WhatsApp details, country/province, password, role, and active state, and approve or reject pending student registrations. Deactivation is reversible and retains history.
- Permanently deleting a student account removes the account, enrollments, progress, assessment attempts and drafts, project and practical submissions and their files, certificates, notifications, invitations, registrations, chat messages, activity entries, and attendance personal records. Class and training records remain. A student cannot be deleted while they are in or hosting a live session.
- An administrator cannot deactivate or permanently delete their own account. The last active administrator cannot be demoted, disabled, or deleted.
- Existing installations with legacy `owner` and `teacher` roles are normalized: owner accounts become admins and teacher accounts become students.

## Document library (backend)

The server retains the QuickLink document library and reader API even though the current React navigation does not include a document reader screen. Integrations and smoke tests can still use `/api/learning`.

- Books and documents are discovered under `server/src/books` and organized as `L3/<subject>/`, `L4/<subject>/`, or `L5/<subject>/`.
- PDF, DOC, DOCX, TXT, Markdown, PPT, PPTX, XLS, and XLSX are supported. The server checks file signatures, Office package structures, UTF-8 text, and declared MIME types; the file extension alone is not accepted as proof of format.
- The API supports searching and filtering resources, safe format-aware previews, downloads, and progress using page, slide, sheet, section, or document positions.
- The preview API converts DOCX to sanitized HTML, returns TXT/Markdown as text, extracts PPTX slide text, and produces bounded XLSX worksheet previews. Legacy DOC, PPT, and XLS are offered as controlled downloads.
- Administrators can use the API to upload drafts, preview, edit metadata, publish/archive, restore, replace files of the same format, retry failed imports, upload PNG/JPEG/WebP covers (maximum 3 MB), and delete files. Catalog refreshes preserve admin metadata and availability.
- Progress is stored per student and document and appears in summaries. Known-length documents count as complete at 95% of their units; opening or downloading alone does not complete reading.
- The API can configure an optional 10-question, single-answer assessment per document. The pass mark and attempt limit come from platform assessment settings (80% and three attempts by default). Students must complete reading before starting, and passing issues a book certificate. Question changes are locked once attempts exist, and admins can review scores and integrity events.

Optional server settings:

```env
LEARNING_SUPPORTED_FORMATS=pdf,doc,docx,txt,md,ppt,pptx,xls,xlsx
LEARNING_MAX_FILE_BYTES=26214400
# Optional persistent storage location; defaults to server/src/books
LEARNING_BOOKS_DIR=
# Optional persistent storage locations (default directories are under server/)
BOOK_COVER_DIR=
COURSE_IMAGE_DIR=
REGISTRATION_IMAGE_DIR=
SUBMISSIONS_DIR=
```

The maximum upload size is capped at 100 MiB. For production uploads, set `LEARNING_BOOKS_DIR` to persistent storage and back it up with MongoDB. Keep the directory private to the API server.

## Technology

- **Client:** React 18, Vite, Tailwind CSS, Axios, React Router, Socket.IO Client, LiveKit Client SDK, Framer Motion, and Lucide icons
- **Server:** Express, MongoDB/Mongoose, JWT authentication, Zod validation, Socket.IO, LiveKit Server SDK, Nodemailer, pdf-lib, PDFKit, QRCode, Cloudinary, Multer, Mammoth, and JSZip
- **Live media:** LiveKit Cloud SFU with server-signed participant tokens
- **Documents and progress:** supported learning documents in `server/src/books` (or `LEARNING_BOOKS_DIR`) and account-scoped records in MongoDB

## Run locally

Requirements: Node.js 20.19 or newer and MongoDB.

1. Install dependencies from the repository root:

   ```bash
   npm run install:all
   ```

2. Create `server/.env` from `server/.env.example`. Set a local MongoDB URI, the initial admin account, LiveKit credentials, and SMTP settings if email delivery is needed. Start the API:

   ```bash
   npm run dev:server
   ```

3. In another terminal, create `client/.env` from `client/.env.example` if needed, then start the web app:

   ```bash
   npm run dev:client
   ```

4. Sign in with the admin account configured in `server/.env`. Create student accounts under **Students**, then create courses or trainings and manage their rosters. Students can register themselves at `/register`.

The Vite development server proxies `/api` and `/socket.io` to the configured backend. Set `VITE_PROXY_TARGET` if the API is not at the default QuickLink server. Set `VITE_API_URL` in the client environment for a separately hosted API. Set `APP_URL` on the backend so invitation, registration, and certificate links return to the application.

## API reference

Every route requires a valid bearer token unless marked public. Admin routes require an administrator account.

### Health, public catalogue, and authentication

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Process liveness probe; does not depend on MongoDB |
| `GET` | `/health/ready` | Public | Readiness probe; returns 503 until startup and MongoDB are ready |
| `GET` | `/api/health` | Public | API health check |
| `GET` | `/api/public/programmes` | Public | List published programmes for SEO and catalogue integrations |
| `GET` | `/api/public/programmes/:slug` | Public | Read one published programme by slug |
| `GET` | `/api/public/sitemap.xml` | Public | Generate the public sitemap |
| `POST` | `/api/auth/register` | Public, rate-limited | Register a student account and return a token |
| `POST` | `/api/auth/login` | Public, rate-limited | Sign in |
| `GET` | `/api/auth/me` | Signed-in | Read the current account |
| `PATCH` | `/api/auth/profile` | Signed-in | Update name, WhatsApp, country, or province |
| `POST` | `/api/auth/change-password` | Signed-in | Change the password and invalidate other sessions |
| `POST` | `/api/auth/logout` | Signed-in | Invalidate the current session |

### Accounts, notifications, and admin operations

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/users` | Admin | List accounts with pagination, search, and role filtering |
| `POST` | `/api/users` | Admin | Create a student account |
| `PATCH` | `/api/users/:id` | Admin | Update account details, role, registration status, active state, or password |
| `DELETE` | `/api/users/:id` | Admin | Permanently delete a student account and personal records |
| `GET` | `/api/users/notifications` | Admin | List admin notifications |
| `PATCH` | `/api/users/notifications/:id/read` | Admin | Mark a notification as read |
| `GET` | `/api/admin/dashboard` | Admin | Read dashboard statistics, recent activity, and upcoming trainings |
| `GET` | `/api/admin/activity` | Admin | List the activity log with filters and pagination |
| `GET` | `/api/admin/students` | Admin | List students with search and active-state filtering |
| `GET` | `/api/admin/students/:id` | Admin | Read a student's enrollments, submissions, and certificates |
| `GET` | `/api/admin/enrollments` | Admin | List enrollments with search, class, student, status, and payment filters |
| `POST` | `/api/admin/enrollments` | Admin | Enroll a student in a training |
| `DELETE` | `/api/admin/enrollments/:id` | Admin | Remove an enrollment |
| `PATCH` | `/api/admin/enrollments/:id/payment` | Admin | Set an enrollment payment to pending, paid, waived, or rejected |
| `GET` | `/api/admin/settings` | Admin | Read platform assessment, payment, and certificate settings |
| `PATCH` | `/api/admin/settings` | Admin | Update platform assessment, payment, or certificate settings |

### Learning library

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/learning/summary` | Signed-in | Read the account's document progress summary |
| `GET` | `/api/learning/books` | Signed-in | List documents grouped by level and subject |
| `GET` | `/api/learning/books?manage=true` | Admin | Include archived documents |
| `POST` | `/api/learning/books/upload` | Admin | Upload a validated draft document |
| `GET` | `/api/learning/books/:id/file` | Signed-in | Read or download an authorized document |
| `GET` | `/api/learning/books/:id/preview` | Signed-in | Get a safe format-aware preview |
| `GET` | `/api/learning/books/:id/cover` | Signed-in | Read a document cover |
| `PUT` | `/api/learning/books/:id/progress` | Signed-in | Save a format-aware position and completion state |
| `PATCH` | `/api/learning/books/:id` | Admin | Edit title, description, category, level, or availability |
| `POST` | `/api/learning/books/:id/cover` | Admin | Upload a cover image |
| `POST` | `/api/learning/books/:id/file` | Admin | Replace a document with the same format |
| `POST` | `/api/learning/books/:id/retry` | Admin | Revalidate and retry an import |
| `DELETE` | `/api/learning/books/:id` | Admin | Delete a document and its saved progress |
| `GET` | `/api/learning/books/:id/assessment` | Admin | Read the document assessment |
| `PUT` | `/api/learning/books/:id/assessment` | Admin | Save the 10-question document assessment |
| `GET` | `/api/learning/books/:id/assessment-attempts` | Admin | List student attempts and integrity events |
| `GET` | `/api/learning/books/:id/final-assessment` | Student | Read assessment availability and attempt state |
| `POST` | `/api/learning/books/:id/final-assessment` | Student | Submit the assessment and receive a result |
| `GET` | `/api/learning/books/:id/certificate` | Student | Issue or read the document certificate after passing |

### Trainings, live classes, and assignments

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/classes` | Signed-in | List visible trainings; admins can include archived records |
| `GET` | `/api/classes/people/students` | Admin | List active students for rosters |
| `POST` | `/api/classes` | Admin | Create a training and assign students |
| `PATCH` | `/api/classes/:id` | Admin | Update training details, lessons, payment, assessment, and roster |
| `DELETE` | `/api/classes/:id` | Admin | Archive a training while preserving history |
| `DELETE` | `/api/classes/:id/permanent` | Admin | Permanently delete a training and its related records |
| `GET` | `/api/classes/:id` | Member or admin | View training details, payment state, and live/recent session |
| `POST` | `/api/classes/:id/sessions` | Admin | Start a live session |
| `GET` | `/api/classes/join/:sessionCode` | Enrolled member or admin | Resolve a live join link |
| `GET` | `/api/classes/sessions/:sessionId` | Member or admin | Read live session details |
| `POST` | `/api/classes/sessions/:sessionId/livekit-token` | Member or admin | Create a short-lived LiveKit token after authorization and payment checks |
| `GET` | `/api/classes/sessions/:sessionId/notes` | Member or admin | Read saved session notes |
| `PUT` | `/api/classes/sessions/:sessionId/notes` | Admin | Save notes with revision conflict protection |
| `POST` | `/api/classes/sessions/:sessionId/end` | Admin | End the class, finalize attendance, and generate the report |
| `GET` | `/api/classes/sessions/:sessionId/report` | Member or admin | Read the completed attendance report |
| `PATCH` | `/api/classes/sessions/:sessionId/attendance/:studentId` | Admin | Correct attendance with an audit reason |
| `DELETE` | `/api/classes/sessions/:sessionId/attendance/:studentId` | Admin | Remove an attendance record |
| `GET` | `/api/classes/:id/sessions` | Member or admin | List class session history |
| `GET` | `/api/classes/:id/report.pdf` | Admin | Generate a PDF filtered by date, student, session, or class |
| `GET` | `/api/classes/:id/learning` | Member or admin | Read lessons, access state, and progress; locked content is redacted |
| `GET` | `/api/classes/:id/learning/analytics` | Admin | Read per-student lesson and integrity analytics |
| `PUT` | `/api/classes/:id/learning/lessons/:lessonId/complete` | Enrolled student | Complete an accessible lesson and unlock the next lesson |
| `POST` | `/api/classes/:id/learning/lessons/:lessonId/assessment` | Enrolled student | Submit a lesson knowledge check |
| `POST` | `/api/classes/:id/learning/lessons/:lessonId/events` | Enrolled student | Log an assessment integrity event |
| `GET` | `/api/classes/:id/invitations` | Admin | List invitation delivery statuses |
| `POST` | `/api/classes/:id/invitations` | Admin | Send private invitations to enrolled students |
| `POST` | `/api/classes/:id/invitations/:invitationId/resend` | Admin | Rotate the expiring token and resend |
| `DELETE` | `/api/classes/:id/invitations/:invitationId` | Admin | Revoke an invitation |
| `POST` | `/api/classes/invitations/:token/accept` | Signed-in invited student | Verify invitation identity and enrollment |
| `GET` | `/api/classes/:classId/assignments` | Member or admin | List class assignments and the student's own submissions |
| `POST` | `/api/classes/:classId/assignments` | Admin | Create a practical assignment or quiz |
| `GET` | `/api/assignments/:id/submissions` | Admin | List submissions for an assignment |
| `POST` | `/api/assignments/:id/submit` | Enrolled student | Submit or resubmit an assignment |
| `POST` | `/api/assignments/:id/draft` | Enrolled student | Save an assignment draft |
| `POST` | `/api/assignments/submissions/:submissionId/grade` | Admin | Grade a submission and record the decision |
| `GET` | `/api/assignments/submissions/:submissionId/files/:fileIndex` | Owner or admin | Download an authorized submission file |
| `DELETE` | `/api/assignments/:id` | Admin | Delete a practical assignment, its submissions, and files |

### Courses, completion, and assessments

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/courses` | Signed-in | List courses and trainings with filters and pagination |
| `GET` | `/api/courses/:id` | Signed-in | Read an offering, enrollment state, and payment state |
| `GET` | `/api/courses/:id/thumbnail` | Public | Read a course or training thumbnail |
| `POST` | `/api/courses/:id/thumbnail` | Admin | Upload a validated thumbnail |
| `POST` | `/api/courses/:id/modules/:moduleId/lessons/:lessonId/image` | Admin | Upload a lesson image |
| `POST` | `/api/courses/:id/enroll` | Student | Self-enroll in a published offering |
| `DELETE` | `/api/courses/:id/enroll` | Student | Leave an offering when cancellation is allowed |
| `POST` | `/api/courses/:id/payment-reference` | Student | Submit an enrollment payment reference |
| `GET` | `/api/courses/:id/completion` | Enrolled student or admin | Read completion requirements and outstanding items |
| `GET` | `/api/courses/:id/certification-assessment/settings` | Admin | Read final assessment settings |
| `PUT` | `/api/courses/:id/certification-assessment/settings` | Admin | Save final assessment questions, attempts, pass mark, time limit, and payment settings |
| `GET` | `/api/courses/:id/certification-assessment` | Enrolled student | Read assessment availability and attempt state |
| `POST` | `/api/courses/:id/certification-assessment/start` | Enrolled student | Start or resume a final assessment |
| `PUT` | `/api/courses/:id/certification-assessment/draft` | Enrolled student | Save assessment answers and progress |
| `POST` | `/api/courses/:id/certification-assessment` | Enrolled student | Submit the final assessment |
| `GET` | `/api/courses/:id/project-submission` | Enrolled student | Read project settings and the current submission |
| `POST` | `/api/courses/:id/project-submission` | Enrolled student | Submit or update a project link and description |
| `GET` | `/api/courses/:id/project-submissions` | Admin | List project submissions |
| `PATCH` | `/api/courses/:id/project-submissions/:submissionId` | Admin | Approve a project or request changes |
| `GET` | `/api/courses/:id/certificate-candidates` | Admin | List enrolled students and certificate eligibility |
| `POST` | `/api/courses/:id/certificates/issue` | Admin | Issue certificates to up to 20 eligible students |
| `POST` | `/api/courses/:id/certificate` | Enrolled student | Issue a certificate after requirements pass |
| `POST` | `/api/courses/:id/certificate/payment-reference` | Enrolled student | Submit a certificate payment reference |
| `GET` | `/api/courses/:id/certificates` | Admin | List course certificates |
| `PATCH` | `/api/courses/:id/certificates/:certificateId/payment` | Admin | Verify or reject a certificate payment |

### Certificates

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/certificates/verify/:code` | Public | Verify a certificate and read its safe public details |
| `GET` | `/api/certificates/share/:code` | Public | Read share preview metadata for a valid, paid certificate |
| `GET` | `/api/certificates/mine` | Signed-in student | List the student's certificates |
| `GET` | `/api/certificates/all` | Admin | Search and filter all certificates |
| `POST` | `/api/certificates/manual` | Admin | Issue a manual certificate for an external or historical completion |
| `GET` | `/api/certificates/:id.pdf` | Owner or admin | Generate and download a certificate PDF |
| `PATCH` | `/api/certificates/:id/name` | Admin | Update the printed student name |
| `PATCH` | `/api/certificates/:id/print-details` | Admin | Update the printed name, title, and description |
| `PATCH` | `/api/certificates/:id/description` | Admin | Update the certificate description |
| `PATCH` | `/api/certificates/:id/revoke` | Admin | Revoke a certificate with a reason |
| `POST` | `/api/certificates/:id/reissue` | Admin | Reissue with a new code while preserving history |
| `DELETE` | `/api/certificates/:id` | Admin | Permanently delete a certificate record |

### Training registrations

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/registrations/public/:slug/image` | Public | Read a registration form header image |
| `GET` | `/api/registrations/public/:slug` | Public | Load an active registration form |
| `POST` | `/api/registrations/public/:slug` | Public, rate-limited | Submit a registration |
| `POST` | `/api/registrations/public/:slug/create-account` | Public, rate-limited | Request student-account creation and email verification |
| `POST` | `/api/registrations/public/:slug/verify-account` | Public, rate-limited | Verify email ownership and begin account setup |
| `POST` | `/api/registrations/public/:slug/complete-account` | Public, rate-limited | Set the password, create the student account, and enroll |
| `POST` | `/api/registrations/public/:slug/claim-account` | Signed-in student | Link an existing student account and enroll |
| `GET` | `/api/registrations` | Admin | List forms and registration counts |
| `POST` | `/api/registrations` | Admin | Create a form for an active training |
| `PUT` | `/api/registrations/:formId` | Admin | Update a registration form |
| `DELETE` | `/api/registrations/:formId` | Admin | Delete a form and its entries |
| `PATCH` | `/api/registrations/:formId` | Admin | Activate or pause a form |
| `POST` | `/api/registrations/:formId/image` | Admin | Upload a header image |
| `GET` | `/api/registrations/:formId/entries` | Admin | List registrations |
| `POST` | `/api/registrations/:formId/entries/enroll` | Admin | Enroll selected registrants |
| `POST` | `/api/registrations/:formId/entries/invite` | Admin | Email class invitations to enrolled registrants |
| `PATCH` | `/api/registrations/:formId/entries/:registrationId/status` | Admin | Update a registration status |
| `DELETE` | `/api/registrations/:formId/entries/:registrationId` | Admin | Delete a registration entry |
| `POST` | `/api/registrations/:formId/entries/:registrationId/enroll` | Admin | Enroll one registrant |
| `POST` | `/api/registrations/:formId/entries/:registrationId/email` | Admin | Email class details and the class or live-session link |

## Verification commands

Run from the repository root:

```bash
npm --prefix server test
npm run build
npm --prefix server run smoke:learning
npm --prefix server run smoke:courses
npm --prefix server run smoke:library-lifecycle
npm --prefix server run smoke:classroom
```

The server test suite covers document formats, lesson access, course completion, assessments, certificates, registrations, and protected routes. The learning and course smoke commands use the running local API and configured MongoDB, and remove their temporary records. The library lifecycle command starts an isolated API against a unique temporary MongoDB database and document directory, then drops both. The classroom command exercises the API, Socket.IO, chat, notes, attendance, and reports. LiveKit token/media testing requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`; without them, the smoke reports media as skipped. Separate lint and TypeScript scripts are not configured in this repository.

## Deployment and storage

- Use MongoDB reachable by the API service. Mount persistent storage for `LEARNING_BOOKS_DIR`, `BOOK_COVER_DIR`, `SUBMISSIONS_DIR`, `COURSE_IMAGE_DIR`, and `REGISTRATION_IMAGE_DIR` when those features are used; database records refer to those files. Course and registration images use Cloudinary when configured, with local storage as the fallback. Back up local storage together with MongoDB.
- Configure a strong `JWT_SECRET`, `CORS_ORIGIN`, and HTTPS. Keep LiveKit, SMTP, and Cloudinary credentials on the server. The API host must allow WebSocket upgrades for Socket.IO.
- Configure `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` for live media. Set `SMTP_URL`, `MAIL_FROM`, and `APP_URL` to send invitations, registration verification, and enrollment notices. Without SMTP, invitation records show delivery failure.
- Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and `CLOUDINARY_FOLDER_PREFIX` for Cloudinary-backed course and registration images.
- Set `APP_URL` to the public frontend origin and `PUBLIC_API_URL` to the public backend origin for certificate share previews. Set client `VITE_API_URL` to the deployed API origin if no development proxy or same-origin deployment is used.
- The API exposes `/health` for process liveness and `/health/ready` for readiness, including MongoDB state. One API instance is recommended while Socket.IO presence is held in memory.

## Known limitations

- Payment verification is manual. QuickLink does not integrate an online payment gateway; administrators verify mobile-money references.
- Live media requires LiveKit Cloud credentials and browser device permissions. A real media connection has not been verified without those credentials, and screen-sharing support varies by browser and device.
- The current React client does not include the document library reader, public programme pages, or a public registration-form page; those capabilities remain available through the `/api/learning`, `/api/public`, and `/api/registrations/public` APIs.
- Legacy DOC/PPT/XLS documents are validated and downloadable but do not have an embedded preview. PPTX preview extracts slide text, not visual slide layouts. XLSX preview is a bounded text/table preview.
- Uploaded files and local images use server filesystem storage. Ephemeral deployment disks lose them after redeploy; configure persistent mounted volumes.
- Assessment fullscreen, copy, and shortcut monitoring are best-effort browser controls and cannot prevent screenshots taken outside the browser.
