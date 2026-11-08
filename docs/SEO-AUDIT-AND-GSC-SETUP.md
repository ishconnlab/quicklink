# QuickLink SEO audit and launch checklist

**Site:** https://quicklink.ishconnect.rw/  
**Positioning:** QuickLink, IshConnect's online learning platform  
**Market:** Kigali, Rwanda; learners in Rwanda, Africa and internationally  
**Audit date:** 8 November 2026

## Audit findings

The application is a React single-page learning portal. Before this change, its root route redirected into the authenticated dashboard, the HTML shell had generic platform metadata, and the training catalogue endpoint required authentication. The student catalogue was intentionally restricted to each student's enrollments, so search engines could not read a public catalogue. There was no root robots file or sitemap. The learning product itself supports training enrolment, live sessions, study documents and saved progress, practical assignments, assessments, certificates and public certificate verification.

The site has public routes for the programme catalogue and published programme details, QuickLink and IshConnect information, learning instructions, contact and ten educational guides. The root path now redirects visitors to sign in, per product direction, and is noindex; it is excluded from the sitemap. Programme details are read from active, published `LearningClass` records. Draft and archived items are omitted. The public API returns a limited field allowlist: it does not return student rosters, internal payment codes, student progress, assessments' answer keys, private class sessions or personal records. A public registration link is included only when the programme has an active registration form.

Public content uses per-route titles, descriptions, canonical links, Open Graph and Twitter metadata. Organization and WebSite JSON-LD describe IshConnect and QuickLink; programme pages emit BreadcrumbList markup, and emit Course markup only when the record has a description, an assigned instructor and an enrolled learner; the catalogue emits an ItemList only when it contains at least three such courses. The guides emit Article markup. The organization is marked as `Organization`, not `EducationalOrganization`, because no evidence of that specific status was supplied.

`robots.txt` points to a dynamic XML sitemap. The sitemap includes the public information pages and active, published programme URLs only. The API adds `X-Robots-Tag: noindex, nofollow, nosnippet`. Private login, account, dashboard, class, course, payment, certificate-registry and registration URLs receive `noindex` metadata and deployment-level headers where supported. Student authentication and API authorization remain the access controls; robots rules are not used as a security boundary.

The public programme pages are client-rendered and fetch course details from the API. The home page has useful HTML content before JavaScript loads, but other SPA routes still rely on Google rendering JavaScript. A later server-rendered or prerendered public shell would improve crawl reliability and first response content. Invalid programme content gets an API 404 and a `noindex` page; the single-page host may still return the SPA shell with HTTP 200 for an invalid browser route, so monitor for soft-404 reports.

## Search intent and keyword map

Search-result research for Rwanda-oriented course terms showed list and comparison intent: results include online course catalogues and local training providers. Queries such as “Python training course Kigali” showed users looking for a specific subject, location and delivery format. These observations describe the returned results only; they are not keyword-volume or difficulty measurements. A search for the QuickLink domain did not return a QuickLink listing in the results checked, which is not proof that Google has never indexed it.

| Query group | Search intent | Target page | Use and limits |
|---|---|---|---|
| Online learning platform Rwanda; online courses Rwanda; online IT training Rwanda | Compare available providers/programmes | `/about` and `/programmes` | Explain the platform and link to the live catalogue. Avoid unsupported “free” claims. |
| Technology training Rwanda; practical programming courses; software development training | Find a locally relevant training provider | `/programmes` and published programme details | Programme titles and subjects come from published records. Add location terms to a course title only if its schedule or delivery genuinely supports that location. |
| Learn Python online; Python programming for beginners | Learn a subject / compare a course | `/resources/python-for-artificial-intelligence` and relevant published programme detail | The guide is informational. Do not imply a Python programme is open unless it appears in the public catalogue. |
| Machine learning training Rwanda; artificial intelligence courses; AI training for beginners | Compare subject training | Matching published programme page; otherwise `/resources/machine-learning-for-beginners` | The resource article does not claim that a matching intake is currently open. |
| Full stack development training; web development courses; programming for beginners | Compare training or learn a path | Matching published programme page; `/resources/full-stack-developer-path` | Use real course names, requirements, schedule and registration status. |
| Cybersecurity training Rwanda; cloud computing; DevOps training | Subject-specific training research | Matching published programme page; `/resources/cybersecurity-introduction` | Do not create programme landing pages for subjects that are not currently published. |
| IT skills development; online technology bootcamps | General learning/provider research | `/how-learning-works` and live programmes | Keep “bootcamp” usage tied to actual programme level/type, not generic promotional text. |
| Certificate verification QuickLink IshConnect | Validate a credential | `/verify` and `/verify/:code` | The lookup page and personal certificate records are noindex; share the specific public verification URL with its recipient. |

The terms “free online technology courses” and “free courses Rwanda” are intentionally not promoted as blanket claims. The course payment setting varies by programme. A page may mention price only from the verified programme record and must make the amount and currency clear.

Google's current Course list documentation requires real educational courses and at least three courses for that feature; the implementation waits for three published catalogue entries with instructor, roster and description data before emitting the list markup. Google recommends descriptive titles, crawlable links, useful content and sitemap submission. Google runs JavaScript rendering, but recommends server-side rendering or prerendering for reliability and speed. Sources: [Google Course list structured data](https://developers.google.com/search/docs/appearance/structured-data/course), [Search Essentials](https://developers.google.com/search/docs/essentials), [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), and [build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## Current page targets

| URL | Page title | Main heading / topic |
|---|---|---|
| `/` | Redirects to `/login` | Noindex sign-in route |
| `/programmes` | Technology Training Programmes in Rwanda \| QuickLink | Technology training programmes |
| `/programmes/:slug` | Actual programme name \| QuickLink by IshConnect | Actual published programme name |
| `/about` | About QuickLink \| IshConnect Online Learning Platform | About QuickLink |
| `/about-ishconnect` | IshConnect \| Organisation Behind QuickLink | About IshConnect |
| `/how-learning-works` | How Online Learning Works on QuickLink \| IshConnect | How learning works on QuickLink |
| `/contact` | Contact IshConnect about QuickLink Training | Contact IshConnect |
| `/resources` and `/resources/:slug` | Topic-specific titles and descriptions | Topic-specific article heading |

The About pages state that IshConnect operates QuickLink. Individual training pages explain only stored information: subject, level, description, dates, schedule, session length, configured learning checks, current enrolment and linked registration availability. Duration is labelled **live session length**, not total course duration, because the data field records a session length. Prerequisites or outcomes are not invented where the training record has no such fields.

## Educational guides published

The resource section contains original guides on:

1. Starting software development in Rwanda.
2. Python and artificial intelligence.
3. Machine learning foundations.
4. Supervised and unsupervised learning.
5. A full-stack developer learning path.
6. Practical programming projects.
7. Cybersecurity fundamentals and authorised practice.
8. Online technology training.
9. Building a first machine-learning model.
10. The role of practical learning.

They link back to the currently published programme catalogue rather than inventing a course or an open intake. IshConnect should review the guides for house style, current examples and subject-matter accuracy before treating them as a formal editorial publication. Their visible publisher/date is IshConnect and 8 November 2026; update `publishedOn` and Article JSON-LD only when the editorial publish date changes.

## Technical SEO and privacy controls

- `/` redirects to `/login`; the sign-in route is marked noindex. `client/index.html` contains only a brief sign-in loading message before the app renders.
- `SeoMeta` updates each public route's title, description, canonical URL, social cards and structured data.
- `robots.txt` advertises `https://quicklink.ishconnect.rw/sitemap.xml`.
- `/sitemap.xml` is routed to the API sitemap endpoint, which reads active, published training records at request time.
- Unknown/private frontend paths receive noindex behavior; Vercel configuration also adds `X-Robots-Tag` on private route patterns.
- The API applies `X-Robots-Tag: noindex` globally, including authenticated data endpoints.
- The student dashboard and API authorization remain responsible for protecting private material and account information.
- Public programme images use descriptive alternative text and lazy loading. The Open Graph artwork is a generated 1200 × 630 PNG using the QuickLink green-and-white identity.
- Internal public navigation uses real anchor links and a skip link. Public route headings have one main H1.
- Avoid adding third-party analytics until IshConnect supplies an approved property ID and privacy requirements.

## Performance report

The React routes are lazy-loaded so public pages do not eagerly import each dashboard feature. The current learning portal still carries its existing application code and global CSS, and the live course catalogue needs an API request. Public course thumbnails are lazy-loaded. The service worker cache version was incremented so deployed clients discard the previous shell.

**Measured Lighthouse scores:** not measured in this code-only environment. No 95+ score is claimed. A production Lighthouse run and field data from PageSpeed Insights/Search Console are still required. Google evaluates Core Web Vitals using real-user field data at the 75th percentile; the current “good” targets are LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1. See [web.dev Core Web Vitals](https://web.dev/articles/vitals?hl=en).

## Google Search Console setup

1. Ask the IshConnect domain owner to create a Search Console property. A **Domain** property for `ishconnect.rw` covers its subdomains and protocols; use `quicklink.ishconnect.rw` if the owner wants to verify only the QuickLink subdomain. Domain properties require DNS verification. The owner must add the exact TXT/CNAME value Google supplies; no verification token is committed to this repository.
2. Keep the verification DNS record in place after verification. Google notes that removing the token can remove ownership verification. See [verify site ownership](https://support.google.com/webmasters/answer/9008080) and [property types](https://support.google.com/webmasters/answer/34592).
3. In Search Console's Sitemaps report, submit `https://quicklink.ishconnect.rw/sitemap.xml`. A sitemap is a discovery hint, not a promise of indexing.
4. Inspect `/programmes`, `/about`, and several genuinely published programme URLs with URL Inspection. Confirm the rendered page, canonical, robots state and selected page text. The root redirects to noindex login. Do not request indexing for login, student records, private course materials or API URLs.
5. Monitor Page indexing, Sitemaps, Core Web Vitals and Search results reports. Use queries/pages/countries to identify impressions and CTR; use the query report to decide which programme descriptions or resource pages need better answers.
6. Request indexing only after the deployment is live and publicly accessible. Google controls crawling and ranking timelines; do not promise inclusion or a ranking.

Search Console requires verified ownership before it shows property data or allows URL inspection requests. The ownership and sitemap steps above follow Google's [Search Console setup guidance](https://support.google.com/webmasters/answer/10267942) and [recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).

## Deployment checklist

- [ ] Deploy the frontend changes and API changes together.
- [ ] Confirm `APP_URL=https://quicklink.ishconnect.rw` on the API service.
- [ ] Confirm the production API host in the Vercel sitemap rewrite matches the `VITE_API_URL`/client fallback. The current repository fallback is `https://quicklink-3eng.onrender.com`.
- [ ] Open `/`, `/programmes`, `/about`, `/resources`, `/robots.txt` and `/sitemap.xml` without signing in.
- [ ] Confirm the sitemap contains only active, published programmes, and excludes login, registration forms, student, class and certificate personal-record pages.
- [ ] Verify private route headers/meta show `noindex` while unauthenticated API requests still return authorization errors.
- [ ] Test a published programme with a registration form and one without one; confirm their calls to action differ correctly.
- [ ] Validate JSON-LD using Schema.org's validator and Google's Rich Results Test where the type is supported. The Course list can appear only when there are at least three valid published course entries; Google does not guarantee a rich result.
- [ ] Run the production build and server tests, then test mobile/desktop layouts and a Lighthouse production URL.
- [ ] Verify Search Console ownership using the DNS token generated for the owner, submit the sitemap and inspect representative URLs. Do not record or expose the owner's token here.
- [ ] Recheck public pages whenever programme descriptions, schedules, enrollment or registration forms change.

## Remaining follow-up

The deployed domain was not reachable through the available web page inspection tool during this implementation, and no Search Console account was connected. Therefore live HTTP status, active production course records, ownership, indexing, search performance and Lighthouse field scores remain unverified. The SPA host's catch-all fallback may return HTTP 200 for an unknown browser route; monitor Search Console for soft 404s and consider prerendered/server-rendered public pages if crawl reliability or first-render performance is inadequate.
