# QuickLink

QuickLink is a learning platform for reading course books and attending teacher led online classes. It keeps the QuickLink name and current application design.

## Learning library and reader

- Books and documents are discovered under `server/src/books` and organized as `L3/<subject>/`, `L4/<subject>/`, or `L5/<subject>/`.
- PDF, DOC, DOCX, TXT, Markdown, PPT, PPTX, XLS, and XLSX are supported. The server checks file signatures, Office package structures, UTF-8 text, and declared MIME types; the file extension alone is not accepted as proof of format.
- Students can search and filter resources, read safe previews where supported, download documents, and save progress using page, slide, sheet, section, or document positions.
- PDF pages render one at a time to a canvas with PDF.js, without the browser viewer sidebar. DOCX is converted to sanitized HTML; TXT/Markdown are rendered as text; PPTX displays extracted slide text; XLSX displays bounded worksheet previews. Legacy DOC, PPT, and XLS are offered as controlled downloads.
- Admins can upload drafts, preview, edit metadata, publish/archive, restore, replace files of the same format, retry failed imports, and delete files. Catalog refreshes preserve admin metadata and availability.
- Admins can add PNG, JPEG, or WebP book-cover images (maximum 3 MB) from **Manage learning document**. The server checks file signatures and MIME type, stores covers separately, and displays them on book cards.
- Catalog validation errors are recorded on the affected document and do not stop the rest of the catalog or the learning summary from loading.
- The reader provides page/slide/section/sheet navigation, progress, download, course return, fullscreen, zoom in/out, a direct zoom selector with 140%, and reset. PDF zoom changes the rendered canvas page; converted document content scales directly.
- Progress is stored per student and document, restores when the document is reopened, and appears in summaries and course details. Known-length documents count as complete at 95% of their units; opening or downloading alone does not complete reading.

Optional server settings:

```env
LEARNING_SUPPORTED_FORMATS=pdf,doc,docx,txt,md,ppt,pptx,xls,xlsx
LEARNING_MAX_FILE_BYTES=26214400
# Optional persistent storage location; defaults to server/src/books
LEARNING_BOOKS_DIR=
# Optional persistent storage locations (default directories are under server/)
BOOK_COVER_DIR=
COURSE_IMAGE_DIR=
SUBMISSIONS_DIR=
```

The maximum upload size is capped at 100 MiB. For production uploads, set `LEARNING_BOOKS_DIR` to persistent storage and back it up with MongoDB. Keep the directory private to the API server.

## Classes and live teaching

- Admins create, edit, archive, restore, and schedule classes; set course/program, level, timezone, duration, capacity, enrollment state, multiple active teachers, and student rosters.
- Teachers see their assigned classes. Students see the classes they are enrolled in.
- An assigned teacher or admin starts a live class. QuickLink creates a join link that can be copied and shared with enrolled students.
- Teachers can email individual or bulk invitations to enrolled student accounts. Each message is private to one recipient and contains a single use, expiring link. Invitation delivery status is tracked; invitations fail clearly until SMTP is configured.
- The live room uses LiveKit Cloud through LiveKit's WebRTC client and server SDKs. Server issued short lived tokens are restricted to authenticated class members. The QuickLink session uses an SFU; users stay on the QuickLink domain.
- The pre-join device check explains camera and microphone access, previews available devices after the user grants permission, supports device selection, and allows joining with media off. The room supports audio/video, teacher screen sharing, participant and connection state, real-time persistent chat, message pin/removal/report, and saved shared notes with revision conflict checks.
- Eight selectable layouts are provided: Auto, Grid, Speaker, Presentation Focus, Side-by-Side, Spotlight, Picture-in-Picture, and Compact Filmstrip. Layout choice is saved for the current session.
- Attendance starts when an authorized participant joins the authenticated room and closes on leave/disconnect. Reconnects add separate intervals to the same student record; if the server restarts, an open interval is closed at the next join or session end. Late means first join is later than scheduled start plus the class late threshold. Early means time present is below the configured share of the session duration. Teachers can correct status with a required reason and an audit entry.
- Teachers end a session to finalize attendance, including absences. They can review class history, export a session or class/date/student-filtered PDF report, or download CSV from a session report.
- A join link requires the student to sign in and be enrolled in that class. Attendance is recorded when the authenticated member connects to the live room.

### Live class deployment notes

Socket.IO handles chat and authenticated attendance events on the API server. The host must support WebSocket upgrades. If the frontend and API use different origins, add the frontend origin to `CORS_ORIGIN`.

Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` on the backend. Never put the API secret in Vite variables. The current product configuration uses LiveKit Cloud; the account's plan, limits, and regional availability apply. Browsers require HTTPS (localhost is allowed for local development) and user permission for the microphone, camera, or screen. Screen sharing support varies by browser and mobile operating system; unsupported devices show a fallback message. QuickLink does not record media. Live attendance presence is in memory during a process lifetime and persisted as join intervals in MongoDB; one API instance is recommended until a shared Socket.IO adapter/presence store is configured.

For invitations configure `SMTP_URL`, `MAIL_FROM`, and the frontend `APP_URL` on the backend. Messages are individually addressed, never bulk-addressed. In tests without SMTP, invitation records report `failed` with a configuration error.

## Accounts and access

- **Admin:** the existing account owner role. From **People and accounts**, admins can create, search, edit, deactivate, and restore teacher and student accounts. Removing an account is a reversible deactivation that invalidates active sessions while preserving class and attendance history.
- **Teacher:** an account created by an admin. Teachers can teach their assigned classes, share live session links, and generate attendance reports.
- **Student:** students may register at `/register` or be created by an admin. They can browse published courses, enroll subject to capacity, read resources, submit practical work, track their progress, and join classes they are enrolled in.

Admins assign active teachers and enroll active students through **Courses and classes** when creating or editing a class. Role changes are rejected while the person is assigned to a class roster. Account management is owner-only; an administrator cannot deactivate or remove their own account.

## Courses, practical work, and certificates

- Published courses reuse the existing class records and teacher/student rosters. Student pages support course search, L3/L4/L5, subject and trade filters, enrollment state, pagination, learning materials, and progress.
- Admins manage course title, introduction, detailed description, subject/trade, level, learning materials, enrollment capacity, publication, completion rules, and an optional validated PNG/JPEG/WebP thumbnail (maximum 3 MB). Course images are stored in `COURSE_IMAGE_DIR`.
- Assigned teachers and admins can publish practical assignments with objectives, materials, tasks, due dates, score limits, pass marks, and submission requirements. Students can save drafts, submit text, links, or supported files (PDF, PNG/JPEG, ZIP, and UTF-8 text/source; up to five files at 10 MB each), and resubmit when enabled. Student code is stored as a file and never executed by the application server.
- Assigned teachers and admins can review and grade submissions, leave feedback, request a revision, or mark work passed/failed. Grading history is retained. Students cannot grade their own work.
- Course completion requirements can include reading, theory quizzes, practical assignments, attendance, and a minimum score. A student can issue a certificate only after all configured requirements pass. Admins can review enrolled students and issue certificates individually or in batches from a course page; the same completion checks apply. Certificates use the IshConnect completion template, retain its printed signature without adding it a second time, and overlay the corporate seal beside the signature. Server-generated PDFs have unique IDs and a QR verification link at `/verify/:code`. Students can download and share issued certificates from their account; the public share link includes social preview metadata, and admins can revoke certificates.
- The certificate template, seal, Noto Sans fonts (licensed under SIL OFL), and their license are bundled under `server/assets/certificates` so PDF generation works when the backend is deployed with `server` as its root directory and supports accented names. The template's signature is retained, with the seal and verification QR beside it. Set `APP_URL` to the public frontend origin and `PUBLIC_API_URL` to the public backend origin for share previews; verification links use `APP_URL`.

## Technology

- **Client:** React 18, Vite, Tailwind CSS, Axios, React Router, Socket.IO Client, and LiveKit Client SDK
- **Server:** Express, MongoDB/Mongoose, JWT authentication, Zod validation, Socket.IO, LiveKit Server SDK, Nodemailer, pdf-lib, and PDFKit
- **Live media:** LiveKit Cloud SFU with server-signed participant tokens
- **Books and progress:** supported learning documents in `server/src/books` (or `LEARNING_BOOKS_DIR`) and account-scoped records in MongoDB

## Run locally

Requirements: Node.js 20.19 or newer and MongoDB.

1. Install dependencies from the repository root:

   ```bash
   npm run install:all
   ```

2. Create `server/.env` from `server/.env.example`. Set a local MongoDB URI, the initial admin account, LiveKit credentials, and SMTP settings if invitation delivery is needed. Start the API:

   ```bash
   npm run dev:server
   ```

3. In another terminal, create `client/.env` from `client/.env.example` if needed, then start the web app:

   ```bash
   npm run dev:client
   ```

4. Sign in with the admin account configured in `server/.env`. Create teacher accounts under **People and accounts**, then create a class under **Classes**. Students can register themselves at `/register` or be created by an admin.

The Vite development server proxies `/api` and `/socket.io` to the configured backend. Set `VITE_PROXY_TARGET` if the API is not at the default QuickLink server. Set `VITE_API_URL` in the client environment for a separately hosted API. Set `APP_URL` to the deployed QuickLink frontend origin so invitation links return to the application.

## Account management API

These routes require a valid bearer token and an admin role.

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/users` | Admin | List teacher, student, and owner accounts |
| `POST` | `/api/users` | Admin | Create a teacher or student account |
| `PATCH` | `/api/users/:id` | Admin | Update name, email, password, role, or active status |
| `DELETE` | `/api/users/:id` | Admin | Deactivate an account and invalidate sessions; preserves class history |

## Learning API

Book catalog changes are restricted to admins; student progress is scoped to the authenticated student.

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/learning/books` | Signed-in user | List available books, grouped by level and subject |
| `GET` | `/api/learning/books?manage=true` | Admin | Include archived books |
| `GET` | `/api/learning/books/:id/file` | Signed-in user | Read or download an authorized document |
| `GET` | `/api/learning/books/:id/preview` | Signed-in user | Get a safe format-aware preview |
| `GET` | `/api/learning/summary` | Signed-in account | Read that account's progress summary |
| `PUT` | `/api/learning/books/:id/progress` | Student | Save a format-aware position and completion status |
| `PATCH` | `/api/learning/books/:id` | Admin | Edit book details or student availability |
| `POST` | `/api/learning/books/upload` | Admin | Upload a validated draft document |
| `POST` | `/api/learning/books/:id/file` | Admin | Replace a document with the same format |
| `POST` | `/api/learning/books/:id/retry` | Admin | Revalidate and retry an import |
| `DELETE` | `/api/learning/books/:id` | Admin | Delete a document and its saved progress |

## Classes API

Every route below requires authentication. Admin only routes are marked.

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/classes` | Signed-in user | List classes visible to the current user |
| `GET` | `/api/classes/people/teachers` | Admin | List active teachers for assignment |
| `GET` | `/api/classes/people/students` | Admin | List active students for enrollment |
| `POST` | `/api/classes` | Admin | Create a class and assign its teacher and students |
| `PATCH` | `/api/classes/:id` | Admin | Update class details and roster |
| `DELETE` | `/api/classes/:id` | Admin | Archive a class while preserving history |
| `GET` | `/api/classes/:id` | Class member or admin | View class details and live/recent session |
| `GET` | `/api/classes/:id/sessions` | Class member or admin | List class session history |
| `GET` | `/api/classes/:id/invitations` | Assigned teacher or admin | List invitation delivery statuses |
| `POST` | `/api/classes/:id/invitations` | Assigned teacher or admin | Send private invitations to enrolled student IDs |
| `POST` | `/api/classes/:id/invitations/:invitationId/resend` | Assigned teacher or admin | Rotate the expiring token and resend |
| `DELETE` | `/api/classes/:id/invitations/:invitationId` | Assigned teacher or admin | Revoke an invitation |
| `POST` | `/api/classes/invitations/:token/accept` | Signed-in invited student | Verify invitation identity and enrollment |
| `POST` | `/api/classes/:id/sessions` | Assigned teacher or admin | Start a live session |
| `GET` | `/api/classes/join/:sessionCode` | Enrolled member or admin | Resolve a live join link |
| `GET` | `/api/classes/sessions/:sessionId` | Class member or admin | Get live session details |
| `POST` | `/api/classes/sessions/:sessionId/livekit-token` | Enrolled member or admin | Create a short lived LiveKit token after authorization |
| `GET` | `/api/classes/sessions/:sessionId/notes` | Class member or admin | Read saved session notes |
| `PUT` | `/api/classes/sessions/:sessionId/notes` | Assigned teacher or admin | Save notes with revision conflict protection |
| `POST` | `/api/classes/sessions/:sessionId/end` | Assigned teacher or admin | End class and generate attendance report |
| `GET` | `/api/classes/sessions/:sessionId/report` | Assigned teacher or admin | Read the completed attendance report |
| `PATCH` | `/api/classes/sessions/:sessionId/attendance/:studentId` | Assigned teacher or admin | Correct attendance with an audit reason |
| `GET` | `/api/classes/:id/report.pdf` | Assigned teacher or admin | Generate a PDF filtered by date, student, session, or class |

Socket.IO handles authenticated room membership, chat, and attendance presence. Live media flows through LiveKit and is not recorded by QuickLink. `server/scripts/classroom-smoke.js` exercises the admin, teacher, student, class, join, chat, attendance, and report API flow against the configured local MongoDB database.

## Training registration forms

Admins can create one public registration form for each active class/training from **Registrations**. Forms support a description, custom placeholders, up to 10 optional or required text fields, and an optional PNG/JPEG/WebP header image (maximum 3 MB). The public URL can be shared directly. Registrations are stored as contact records only; they do not create accounts or enroll students. Admins can view the submitted contact details, start the training's live class, send a class link by configured email, or open a prefilled WhatsApp message.

Email invitations require `SMTP_URL`, `MAIL_FROM`, and `APP_URL`. WhatsApp invitations open WhatsApp for the admin to send manually. Live-class join links continue to require an existing enrolled student account; collecting a registration does not grant class access. Uploaded registration images use the server filesystem; configure persistent storage with `REGISTRATION_IMAGE_DIR`.

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/registrations/public/:slug` | Public | Load an active training registration form |
| `POST` | `/api/registrations/public/:slug` | Public, rate-limited | Submit a registration |
| `GET` | `/api/registrations` | Admin | List forms and registration counts |
| `POST` | `/api/registrations` | Admin | Create a form for an active class |
| `GET` | `/api/registrations/:formId/entries` | Admin | View the form's registrations |
| `POST` | `/api/registrations/:formId/entries/:registrationId/email` | Admin | Email the active live-class join link |

## Book catalog behavior

The directory structure supplies the initial level and subject:

```text
server/src/books/
  L3/<subject>/*.{pdf,doc,docx,txt,md,ppt,pptx,xls,xlsx}
  L4/<subject>/*.{pdf,doc,docx,txt,md,ppt,pptx,xls,xlsx}
  L5/<subject>/*.{pdf,doc,docx,txt,md,ppt,pptx,xls,xlsx}
```

On refresh, the server validates supported files and creates or updates catalog entries. Admin-edited metadata, availability, and archive status are retained. Store source files on persistent server storage so the API can serve them to readers.

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

The learning and course smoke commands use the running local API and configured MongoDB, and remove their temporary records. The library lifecycle command starts an isolated API against a unique temporary MongoDB database and document directory, then drops both. The classroom command exercises the API, Socket.IO, chat, notes, attendance, and reports. LiveKit token/media testing requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`; without them, the smoke reports media as skipped. Separate lint and TypeScript scripts are not configured in this repository.

## Deployment and storage

- Use MongoDB reachable by the API service. Mount persistent storage for `LEARNING_BOOKS_DIR`, `BOOK_COVER_DIR`, `COURSE_IMAGE_DIR`, and `SUBMISSIONS_DIR`; database records refer to those files. Back up the storage together with MongoDB.
- Configure a strong `JWT_SECRET`, `CORS_ORIGIN`, and HTTPS. Keep LiveKit and SMTP credentials on the server. The API host must allow WebSocket upgrades for Socket.IO.
- Configure `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` for live media. Set `SMTP_URL`, `MAIL_FROM`, and `APP_URL` to send class invitations. Without SMTP, invitation records show delivery failure.
- Set client `VITE_API_URL` to the deployed API origin if no development proxy or same-origin deployment is used.

## Known limitations

- Legacy DOC/PPT/XLS files are validated and downloadable but do not have an embedded preview. PPTX preview extracts slide text, not visual slide layouts. XLSX preview is a bounded text/table preview.
- Live media requires LiveKit Cloud credentials and browser device permissions. Those credentials were unavailable during this local verification, so a real LiveKit media connection was not verified.
- Uploaded files use server filesystem storage. Ephemeral deployment disks lose uploaded documents and images after redeploy; configure a persistent mounted volume.
