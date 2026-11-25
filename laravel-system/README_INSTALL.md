# Aloms English Center — Laravel 11 Ready-to-Install Guide

## Server Requirements
- PHP 8.2 or higher
- Extensions: `pdo_mysql`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `json`, `bcmath`
- MySQL 8.0+ or MariaDB 10.6+
- Composer 2.x

## Installation Steps
1. Upload the contents of this folder to your server (point document root to `public/`).
2. Install PHP dependencies:
   ```bash
   composer install --no-dev --optimize-autoloader
   ```
3. Ensure `storage/` and `bootstrap/cache/` are writable (`chmod -R 775 storage bootstrap/cache`) and copy `.env.example` to `.env`.
4. Open `https://your-domain.com/install` in your browser!
   The built-in **Web Installer Wizard** will:
   - Verify PHP & extension compatibility
   - Test your MySQL database connection
   - Write `.env` & generate `APP_KEY`
   - Run all database migrations & seed demo courses/branches/exams
   - Create your Super Admin account and lock `/install` automatically.

## Unified Portal Roles
All 5 roles share one unified portal at `/portal`:
- `admin` — Full system, courses, branches, users, roles, exams, orders & settings
- `branch_manager` — Branch-scoped enrollments, fee approvals, orders & students
- `teacher` — Course video lessons & MCQ exam builder
- `student` — Enrolled courses, video classroom, live MCQ exams & orders
- `guardian` — Linked child course progress, exam results & fee status
