# PMS India - Project Management System

Next.js 14 (App Router) + MongoDB + Gemini. Share Tech font, #064E3B / #F8E7C9 theme, Lucide icons.

## Quick start
```bash
npm install
cp .env.example .env.local     # fill in values (AUTH_SECRET: openssl rand -base64 48)
npm run seed                   # creates the first Super Admin from SEED_ADMIN_* values
npm run dev                    # http://localhost:3000
```
Production: `npm run build && npm start`, or `docker compose up -d --build` (uses `.env.local`).
Set `COOKIE_SECURE=true` when served over HTTPS. Put a TLS reverse proxy (nginx/Caddy) in front.

## Roles
| Role | Can do |
|---|---|
| Super Admin / Admin | Everything: users (any role), clients, projects, assign project managers, reports, audit log, archive records. Only a super admin can modify a super admin. |
| Project Manager | Sees assigned projects; creates modules and tasks; adds Team Leads and Employees to the project; assigns tasks; reports. |
| Team Lead | Sees their projects; creates and assigns tasks to project members; logs time. |
| Employee | Sees tasks assigned to them; updates status, logs time, comments. |

Flow: Admin creates client -> creates project -> assigns a Manager -> Manager adds Team Leads/Employees, creates modules and tasks and assigns them.

## AI (Gemini)
Function-calling agent in `lib/ai.js`. It runs with the signed-in user's permissions, through the same service layer as the UI.
It can create/update clients, projects, teams, modules, tasks, comments, time logs and users, and generate PDF / Excel / CSV files and images.
**No delete tool exists**, and every delete service rejects AI calls. Humans "delete" by archiving (soft delete), so data is recoverable.
Model fallback order: `GEMINI_MODEL`, then `GEMINI_FALLBACK_MODELS`. Images use `GEMINI_IMAGE_MODEL`.

## Security notes
bcrypt (cost 12), JWT in httpOnly cookie (12h), user re-checked in DB per request, same-origin check on writes,
login throttling (in-memory; use Redis if you run several instances), CSV formula-injection guard, security headers.
Generated files are stored in MongoDB (`filedocs`) and only readable by their owner or admins.

## Layout
`lib/services.js` business rules + permissions | `lib/ai.js` agent | `lib/reports.js`, `lib/render.js` files |
`app/api/[...slug]/route.js` REST router | `app/(app)/*` pages.
