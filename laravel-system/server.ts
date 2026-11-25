import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  calculateDiscountedPrice,
  calculateOrderTotal,
  canClaimEbookFree,
  computeHomepageStats,
  filterActiveBranches,
  filterActivePaymentGateways,
  gradeExamSubmission,
  isAdminRole,
  isBranchActive,
  maskLeaderboardName,
  parseImageUploadDataUrl,
  sanitizeSafeUrl,
} from './src/lib/domain';
import { createAiRouter } from './src/server/aiRoutes';
import { createEnterpriseRouter } from './src/server/enterpriseRoutes';
import { createPlatformRouter } from './src/server/platformRoutes';
import {
  createDefaultHomepageConfig,
  getDb,
  hashPassword,
  recordAuditLog,
  sanitizeUser,
  saveDb,
  verifyPassword,
  type StoredUser,
} from './src/server/store';
import type {
  Branch,
  Course,
  CourseBatch,
  CourseLesson,
  Exam,
  ExamQuestion,
  HeroSlide,
  HomepageConfig,
  LessonType,
  LiveClassStatus,
  Review,
  UserRole,
} from './src/types';

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

interface TokenPayload {
  userId: string;
  role: UserRole;
  exp: number;
}

function signToken(user: StoredUser): string {
  const payload: TokenPayload = {
    userId: user.id,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.userId || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface AuthedRequest extends Request {
  authUser?: StoredUser;
}

function getBearerUser(req: Request): StoredUser | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) return null;
  const db = getDb();
  return db.users.find((u) => u.id === payload.userId) ?? null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const user = getBearerUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (user.status && user.status !== 'active') {
    res.status(403).json({ error: `Account is ${user.status}. Please contact administration.` });
    return;
  }
  req.authUser = user;
  next();
}

function requireRole(roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const allowed =
      roles.includes(req.authUser.role) ||
      (isAdminRole(req.authUser.role) && roles.includes('admin'));
    if (!allowed) {
      res.status(403).json({ error: 'Insufficient permissions for this role' });
      return;
    }
    next();
  };
}

function isValidRole(role: unknown): role is UserRole {
  return (
    role === 'super_admin' ||
    role === 'admin' ||
    role === 'branch_manager' ||
    role === 'teacher' ||
    role === 'student' ||
    role === 'guardian' ||
    role === 'accountant' ||
    role === 'staff'
  );
}

function hasValidImageMagicBytes(
  buf: Buffer,
  ext: 'png' | 'jpg' | 'webp' | 'gif'
): boolean {
  if (ext === 'png') {
    return (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    );
  }
  if (ext === 'jpg') {
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (ext === 'gif') {
    const header = buf.subarray(0, 4).toString('ascii');
    return buf.length >= 6 && (header === 'GIF8');
  }
  if (ext === 'webp') {
    return (
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

  // Basic security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Public bootstrap payload
  app.get('/api/public/bootstrap', (_req, res) => {
    const db = getDb();
    const totalStudents =
      db.branches.reduce((sum, b) => sum + b.activeStudents, 0) +
      db.courses.reduce((sum, c) => sum + c.enrolledCount, 0);

    const liveStats = {
      students: totalStudents,
      courses: db.courses.filter((c) => c.status === 'active').length,
      teachers: db.instructors.length,
      videos: db.lessons.length * 140 + 480,
    };

    const stats = computeHomepageStats(liveStats, db.settings.homepageConfig?.statsCard);
    const activeSlides = (db.settings.heroSlides ?? []).filter((s) => s.active !== false);
    const visibleReviews = db.reviews.filter(
      (r) => r.status !== 'hidden' && r.status !== 'pending'
    );
    const leaderboardSummary = Object.values(db.rewardsByUser)
      .map((profile) => ({
        userId: profile.userId,
        displayName: maskLeaderboardName(profile.studentName, profile.showOnLeaderboard !== false),
        isMasked: profile.showOnLeaderboard === false,
        xp: profile.xp,
        streakDays: profile.streakDays,
        badges: profile.badges,
      }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 10);

    res.json({
      settings: {
        ...db.settings,
        heroSlides: activeSlides.length ? activeSlides : db.settings.heroSlides.slice(0, 1),
      },
      branches: db.branches.filter((b) => b.status === 'active'),
      paymentGateways: filterActivePaymentGateways(db.paymentGateways).map(
        ({ apiKeyMasked: _k, webhookSecretMasked: _w, ...pub }) => pub
      ),
      courses: db.courses.filter((c) => c.status === 'active'),
      batches: db.batches.filter((b) => !b.branchId || isBranchActive(db.branches, b.branchId)),
      instructors: db.instructors,
      products: db.products.filter((p) => p.active !== false),
      ebooks: db.ebooks,
      reviews: visibleReviews,
      categories: db.categories.filter((c) => c.active),
      leaderboardSummary,
      stats,
    });
  });

  app.get('/api/public/courses/:slug', (req, res) => {
    const db = getDb();
    const course = db.courses.find((c) => c.slug === req.params.slug && c.status === 'active');
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    const instructors = db.instructors.filter((i) => course.instructorIds.includes(i.id));
    const activeBranchIds = new Set(filterActiveBranches(db.branches).map((b) => b.id));
    const batches = db.batches.filter(
      (b) => b.courseId === course.id && (!b.branchId || activeBranchIds.has(b.branchId))
    );
    const lessons = db.lessons
      .filter((l) => l.courseId === course.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((l) => ({
        ...l,
        videoUrl: l.isFreePreview ? l.videoUrl : '',
        liveJoinUrl: l.isFreePreview ? l.liveJoinUrl : '',
        lectureSheetUrl: l.isFreePreview ? l.lectureSheetUrl : '',
        sheetSummary: l.isFreePreview ? l.sheetSummary : 'Available after enrollment',
      }));
    const branches = filterActiveBranches(
      db.branches.filter((b) => course.branchIds.includes(b.id))
    );
    res.json({ course, instructors, batches, lessons, branches });
  });

  app.post('/api/public/coupons/validate', (req, res) => {
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    const courseId = String(req.body?.courseId ?? '').trim();
    const ebookId = String(req.body?.ebookId ?? '').trim();
    const db = getDb();

    let basePrice = 0;
    let origPrice = 0;
    if (ebookId) {
      const ebook = db.ebooks.find((e) => e.id === ebookId);
      if (!ebook) {
        res.status(404).json({ error: 'E-Book not found' });
        return;
      }
      basePrice = ebook.price;
      origPrice = Math.max(ebook.price, ebook.originalPrice || ebook.price);
    } else {
      const course = db.courses.find((c) => c.id === courseId);
      if (!course) {
        res.status(404).json({ error: 'Course not found' });
        return;
      }
      basePrice = course.price;
      origPrice = course.originalPrice;
    }

    const coupon = db.coupons.find((c) => c.code.toUpperCase() === code && c.active);
    if (!coupon) {
      res.status(400).json({ error: 'Invalid or expired coupon code' });
      return;
    }
    const pricing = calculateDiscountedPrice(basePrice, origPrice, coupon);
    res.json({ coupon, pricing });
  });

  app.get('/api/public/results/lookup', (req, res) => {
    const roll = String(req.query.roll ?? '').trim().toUpperCase();
    if (!roll) {
      res.status(400).json({ error: 'Please enter a valid Student Roll Number' });
      return;
    }
    const db = getDb();
    const record = db.results.find((r) => r.rollNumber.toUpperCase() === roll);
    const liveAttempts = db.examAttempts.filter((a) => a.rollNumber.toUpperCase() === roll);
    if (!record && liveAttempts.length === 0) {
      res.status(404).json({ error: `No result record found for Roll ${roll}` });
      return;
    }
    res.json({ record: record ?? null, liveAttempts });
  });

  app.post('/api/public/contact', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim();
    const phone = String(req.body?.phone ?? '').trim();
    const branchId = String(req.body?.branchId ?? 'br-mirpur').trim();
    const message = String(req.body?.message ?? '').trim();

    if (!name || !phone || !message) {
      res.status(400).json({ error: 'Name, phone, and message are required' });
      return;
    }
    const db = getDb();
    db.contactMessages.unshift({
      id: `msg-${Date.now()}`,
      name,
      email,
      phone,
      branchId,
      message,
      createdAt: new Date().toISOString(),
    });
    saveDb(db);
    res.status(201).json({ ok: true, message: 'Inquiry submitted successfully' });
  });

  // Auth routes
  app.post('/api/auth/register', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const phone = String(req.body?.phone ?? '').trim();
    const password = String(req.body?.password ?? '');
    const roleInput = String(req.body?.role ?? 'student');
    const branchId = String(req.body?.branchId ?? 'br-mirpur').trim();
    const studentRollToLink = String(req.body?.studentRollToLink ?? '').trim().toUpperCase();

    if (!name || !email || !phone || password.length < 6) {
      res.status(400).json({ error: 'Name, email, phone, and a 6+ character password are required' });
      return;
    }
    // Public self-registration only permits student or guardian
    const role: UserRole = roleInput === 'guardian' ? 'guardian' : 'student';

    const db = getDb();
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    let guardianLinkedStudentIds: string[] | undefined;
    if (role === 'guardian' && studentRollToLink) {
      const targetStudent = db.users.find(
        (u) => u.role === 'student' && (u.rollNumber ?? '').toUpperCase() === studentRollToLink
      );
      if (targetStudent) {
        guardianLinkedStudentIds = [targetStudent.id];
      }
    }

    const rollNumber =
      role === 'student' ? `AEC-2026-${100 + db.users.length + 1}` : undefined;

    const newUser: StoredUser = {
      id: `u-${Date.now()}`,
      name,
      email,
      phone,
      role,
      branchId,
      rollNumber,
      guardianLinkedStudentIds,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    saveDb(db);
    const token = signToken(newUser);
    res.status(201).json({ token, user: sanitizeUser(newUser) });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const db = getDb();
    const user = db.users.find((u) => u.email.toLowerCase() === email);
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '127.0.0.1');
    const ua = String(req.headers['user-agent'] ?? 'Browser').slice(0, 80);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      db.loginHistory.unshift({
        id: `lh-${Date.now()}`,
        userId: user?.id ?? 'unknown',
        userName: user?.name ?? email,
        email,
        role: user?.role ?? 'student',
        status: 'failed',
        ip,
        userAgent: ua,
        createdAt: new Date().toISOString(),
      });
      if (db.loginHistory.length > 100) db.loginHistory = db.loginHistory.slice(0, 100);
      saveDb(db);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    if (user.status && user.status !== 'active') {
      db.loginHistory.unshift({
        id: `lh-${Date.now()}`,
        userId: user.id,
        userName: user.name,
        email: user.email,
        role: user.role,
        status: 'blocked',
        ip,
        userAgent: ua,
        createdAt: new Date().toISOString(),
      });
      saveDb(db);
      res.status(403).json({ error: `Account is ${user.status}. Contact system administrator.` });
      return;
    }
    user.lastLoginAt = new Date().toISOString();
    db.loginHistory.unshift({
      id: `lh-${Date.now()}`,
      userId: user.id,
      userName: user.name,
      email: user.email,
      role: user.role,
      status: 'success',
      ip,
      userAgent: ua,
      createdAt: user.lastLoginAt,
    });
    if (db.loginHistory.length > 100) db.loginHistory = db.loginHistory.slice(0, 100);
    saveDb(db);
    const token = signToken(user);
    res.json({ token, user: sanitizeUser(user) });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: sanitizeUser(req.authUser!) });
  });

  // Student Learning, Enrollments, Exams, Orders, Ebooks
  app.get('/api/enrollments/my', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const enrollments = db.enrollments.filter((e) => e.userId === user.id);
    const claimedEbookIds = db.claimedEbooksByUser[user.id] ?? [];
    const orders = db.orders.filter((o) => o.userId === user.id);
    const examAttempts = db.examAttempts.filter((a) => a.userId === user.id);
    res.json({ enrollments, claimedEbookIds, orders, examAttempts });
  });

  app.post('/api/enrollments', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const db = getDb();
    const activeBranches = filterActiveBranches(db.branches);
    const requestedBranchId = req.body?.branchId ? String(req.body.branchId).trim() : '';
    const branchId = requestedBranchId || (user.branchId && isBranchActive(db.branches, user.branchId) ? user.branchId : activeBranches[0]?.id || '');
    const courseId = String(req.body?.courseId ?? '').trim();
    const paymentMethod = req.body?.paymentMethod as
      | 'bKash'
      | 'Nagad'
      | 'Card'
      | 'Branch Cash'
      | undefined;
    const couponCode = String(req.body?.couponCode ?? '').trim().toUpperCase();

    if (
      !courseId ||
      !paymentMethod ||
      !['bKash', 'Nagad', 'Card', 'Branch Cash'].includes(paymentMethod)
    ) {
      res.status(400).json({ error: 'Valid course and payment method are required' });
      return;
    }

    if (branchId && !isBranchActive(db.branches, branchId)) {
      res.status(400).json({ error: 'Selected branch is currently deactivated and cannot accept enrollments.' });
      return;
    }

    const course = db.courses.find((c) => c.id === courseId && c.status === 'active');
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const existing = db.enrollments.find(
      (e) => e.userId === user.id && e.courseId === course.id && e.status !== 'rejected'
    );
    if (existing) {
      res.status(409).json({ error: 'You are already enrolled or have a pending enrollment in this course' });
      return;
    }

    const coupon = couponCode
      ? db.coupons.find((c) => c.code.toUpperCase() === couponCode && c.active)
      : undefined;
    const pricing = calculateDiscountedPrice(course.price, course.originalPrice, coupon);

    const status = paymentMethod === 'Branch Cash' ? 'pending' : 'approved';
    const enrollment = {
      id: `enr-${Date.now()}`,
      userId: user.id,
      studentName: user.name,
      studentEmail: user.email,
      courseId: course.id,
      courseTitle: course.title,
      branchId,
      paymentMethod,
      amountPaid: pricing.finalPrice,
      couponUsed: pricing.appliedCouponCode ?? undefined,
      status: status as 'approved' | 'pending',
      completedLessonIds: [],
      enrolledAt: new Date().toISOString(),
    };

    db.enrollments.unshift(enrollment);
    if (status === 'approved') {
      course.enrolledCount += 1;
    }
    saveDb(db);
    res.status(201).json({ enrollment });
  });

  app.get('/api/learn/courses', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const approvedIds = new Set(
      db.enrollments
        .filter((e) => e.userId === user.id && e.status === 'approved')
        .map((e) => e.courseId)
    );
    // Admin, Super Admin & teacher get full access to inspect all courses
    const hasAll = isAdminRole(user.role) || user.role === 'teacher';
    const accessibleCourses = db.courses.filter((c) => hasAll || approvedIds.has(c.id));
    const lessonsByCourse: Record<string, CourseLesson[]> = {};
    for (const c of db.courses) {
      const courseLessons = db.lessons
        .filter((l) => l.courseId === c.id)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      if (hasAll || approvedIds.has(c.id)) {
        lessonsByCourse[c.id] = courseLessons;
      } else {
        lessonsByCourse[c.id] = courseLessons.filter((l) => l.isFreePreview);
      }
    }
    const enrollments = db.enrollments.filter((e) => e.userId === user.id);
    res.json({
      accessibleCourses,
      allCourses: db.courses,
      batches: db.batches,
      lessonsByCourse,
      enrollments,
    });
  });

  app.post('/api/learn/progress', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const courseId = String(req.body?.courseId ?? '').trim();
    const lessonId = String(req.body?.lessonId ?? '').trim();
    const db = getDb();
    const enrollment = db.enrollments.find(
      (e) => e.userId === user.id && e.courseId === courseId && e.status === 'approved'
    );
    if (!enrollment) {
      res.status(403).json({ error: 'Approved course enrollment required to track progress' });
      return;
    }
    if (!enrollment.completedLessonIds.includes(lessonId)) {
      enrollment.completedLessonIds.push(lessonId);
      saveDb(db);
    }
    res.json({ enrollment });
  });

  app.get('/api/exams', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const approvedCourseIds = new Set(
      db.enrollments
        .filter((e) => e.userId === user.id && e.status === 'approved')
        .map((e) => e.courseId)
    );
    const privileged = isAdminRole(user.role) || user.role === 'teacher';
    const exams = db.exams
      .filter(
        (ex) =>
          (ex.published !== false || privileged) &&
          (privileged ||
            ex.visibility === 'public' ||
            (ex.courseId && approvedCourseIds.has(ex.courseId)))
      )
      .map((ex) => ({
        ...ex,
        questions: ex.questions.map((q) => ({
          id: q.id,
          type: q.type ?? 'mcq',
          prompt: q.prompt,
          options: q.options,
          matchingPairs: q.matchingPairs,
          marks: q.marks,
          ...(privileged ? { correctIndex: q.correctIndex, explanation: q.explanation } : {}),
        })),
      }));
    const myAttempts = db.examAttempts.filter((a) => a.userId === user.id);
    res.json({ exams, myAttempts });
  });

  app.post('/api/exams/:id/submit', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const exam = db.exams.find((e) => e.id === req.params.id);
    if (!exam) {
      res.status(404).json({ error: 'Exam not found' });
      return;
    }

    const answers = (req.body?.answers ?? {}) as Record<string, number>;
    const writtenAnswers = (req.body?.writtenAnswers ?? {}) as Record<string, string>;
    const matchingAnswers = (req.body?.matchingAnswers ?? {}) as Record<string, Record<string, string>>;
    const graded = gradeExamSubmission(exam.questions, answers, exam.passPercentage, {
      negativeMarkPerWrong: exam.negativeMarkPerWrong,
      writtenAnswers,
      matchingAnswers,
    });

    const attempt = {
      id: `att-${Date.now()}`,
      examId: exam.id,
      examTitle: exam.title,
      userId: user.id,
      studentName: user.name,
      rollNumber: user.rollNumber ?? user.id.toUpperCase(),
      branchId: user.branchId,
      score: graded.score,
      totalMarks: graded.totalMarks,
      percentage: graded.percentage,
      grade: graded.grade,
      passed: graded.passed,
      answers,
      writtenAnswers,
      matchingAnswers,
      evaluationStatus: graded.requiresManualReview ? ('pending_manual' as const) : ('auto_graded' as const),
      submittedAt: new Date().toISOString(),
    };

    db.examAttempts.unshift(attempt);
    saveDb(db);

    res.status(201).json({
      attempt,
      graded,
      reviewQuestions: exam.questions.map((q) => ({
        id: q.id,
        type: q.type ?? 'mcq',
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        matchingPairs: q.matchingPairs,
        explanation: q.explanation,
        selectedIndex: typeof answers[q.id] === 'number' ? answers[q.id] : null,
      })),
    });
  });

  app.post('/api/orders', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const itemsInput = Array.isArray(req.body?.items) ? req.body.items : [];
    const deliveryAddress = String(req.body?.deliveryAddress ?? '').trim();
    const phone = String(req.body?.phone ?? user.phone).trim();
    const branchPickupId = req.body?.branchPickupId ? String(req.body.branchPickupId) : null;

    if (itemsInput.length === 0 || (!branchPickupId && !deliveryAddress)) {
      res.status(400).json({ error: 'Cart items and delivery address or branch pickup are required' });
      return;
    }

    const db = getDb();
    if (branchPickupId && !isBranchActive(db.branches, branchPickupId)) {
      res.status(400).json({ error: 'Selected pickup branch is currently deactivated and unavailable.' });
      return;
    }
    const resolvedItems: { productId: string; title: string; quantity: number; unitPrice: number }[] = [];
    for (const raw of itemsInput) {
      const prod = db.products.find((p) => p.id === raw.productId && p.active !== false);
      const qty = Math.max(1, Number(raw.quantity) || 1);
      if (!prod || prod.stock < qty) {
        res.status(400).json({ error: `Product unavailable or insufficient stock: ${raw.productId}` });
        return;
      }
      resolvedItems.push({
        productId: prod.id,
        title: prod.title,
        quantity: qty,
        unitPrice: prod.price,
      });
    }

    const totals = calculateOrderTotal(
      resolvedItems,
      branchPickupId ? 'branch_pickup' : 'home'
    );

    for (const item of resolvedItems) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod) prod.stock -= item.quantity;
    }

    const order = {
      id: `ord-${Date.now()}`,
      userId: user.id,
      customerName: user.name,
      phone,
      deliveryAddress: branchPickupId ? 'Branch Pickup' : deliveryAddress,
      branchPickupId,
      items: resolvedItems,
      deliveryFee: totals.deliveryFee,
      totalAmount: totals.totalAmount,
      status: 'processing' as const,
      createdAt: new Date().toISOString(),
    };
    db.orders.unshift(order);
    saveDb(db);
    res.status(201).json({ order });
  });

  app.post('/api/ebooks/claim', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const ebookId = String(req.body?.ebookId ?? '').trim();
    const db = getDb();
    const ebook = db.ebooks.find((e) => e.id === ebookId);
    if (!ebook) {
      res.status(404).json({ error: 'E-Book not found' });
      return;
    }
    if (!canClaimEbookFree(ebook)) {
      res.status(402).json({
        error: `This E-Book costs ৳${ebook.price}. Please complete payment checkout before unlocking.`,
      });
      return;
    }
    const existing = db.claimedEbooksByUser[user.id] ?? [];
    if (!existing.includes(ebook.id)) {
      existing.push(ebook.id);
      db.claimedEbooksByUser[user.id] = existing;
      saveDb(db);
    }
    res.json({ claimedEbookIds: existing, ebook });
  });

  // ============================================================================
  // UNIFIED SINGLE PORTAL & ADMIN PANEL ROUTES (/api/portal/*)
  // ============================================================================
  app.get('/api/portal/overview', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;

    if (isAdminRole(user.role)) {
      const revenue = db.enrollments
        .filter((e) => e.status === 'approved')
        .reduce((s, e) => s + e.amountPaid, 0);
      return res.json({
        role: user.role,
        metrics: {
          totalStudents: db.users.filter((u) => u.role === 'student').length,
          totalCourses: db.courses.length,
          totalBranches: db.branches.length,
          totalRevenue: revenue,
          pendingApprovals: db.enrollments.filter((e) => e.status === 'pending').length,
          totalExams: db.exams.length,
        },
        courses: db.courses,
        batches: db.batches,
        lessons: db.lessons,
        exams: db.exams,
        examAttempts: db.examAttempts,
        branches: db.branches,
        users: db.users.map(sanitizeUser),
        enrollments: db.enrollments,
        orders: db.orders,
        reviews: db.reviews,
        settings: db.settings,
        contactMessages: db.contactMessages,
        questionBank: db.questionBank,
        categories: db.categories,
        posts: db.posts,
        scormPackages: db.scormPackages,
        scormAttempts: db.scormAttempts,
        attendance: db.attendance,
        payrolls: db.payrolls,
        financialRecords: db.financialRecords,
        paymentGateways: db.paymentGateways,
        transactions: db.transactions,
        coupons: db.coupons,
        campaigns: db.campaigns,
        plugins: db.plugins,
        webhooks: db.webhooks,
        instructors: db.instructors,
        products: db.products,
        ebooks: db.ebooks,
        assignments: db.assignments,
        assignmentSubmissions: db.assignmentSubmissions,
        speakingSubmissions: db.speakingSubmissions,
        feeInvoices: db.feeInvoices,
        certificates: db.certificates,
        notices: db.notices,
        auditLogs: db.auditLogs.slice(0, 30),
        loginHistory: db.loginHistory.slice(0, 30),
        customRoles: db.customRoles,
        scheduledJobs: db.scheduledJobs,
        errorLogs: db.errorLogs.slice(0, 20),
      });
    }

    if (user.role === 'branch_manager' || user.role === 'accountant' || user.role === 'staff') {
      const myBranchId = user.branchId ?? 'br-mirpur';
      const branch = db.branches.find((b) => b.id === myBranchId) ?? db.branches[0];
      const branchEnrollments = db.enrollments.filter((e) => e.branchId === myBranchId);
      const branchUsers = db.users
        .filter((u) => u.branchId === myBranchId && u.role !== 'admin' && u.role !== 'super_admin')
        .map(sanitizeUser);
      const branchOrders = db.orders.filter((o) => o.branchPickupId === myBranchId || !o.branchPickupId);
      return res.json({
        role: user.role,
        branch,
        metrics: {
          branchStudents: branchUsers.filter((u) => u.role === 'student').length,
          branchRevenue: branchEnrollments
            .filter((e) => e.status === 'approved')
            .reduce((s, e) => s + e.amountPaid, 0),
          pendingApprovals: branchEnrollments.filter((e) => e.status === 'pending').length,
          branchOrders: branchOrders.length,
        },
        branches: branch ? [branch] : [],
        users: branchUsers,
        enrollments: branchEnrollments,
        orders: branchOrders,
        courses: db.courses,
        batches: db.batches.filter((b) => b.branchId === myBranchId),
        attendance: db.attendance.filter((a) => !a.branchId || a.branchId === myBranchId),
        payrolls: db.payrolls.filter((p) => !p.branchId || p.branchId === myBranchId),
        financialRecords: db.financialRecords.filter((f) => !f.branchId || f.branchId === myBranchId),
        feeInvoices: db.feeInvoices.filter((f) => !f.branchId || f.branchId === myBranchId),
        certificates: db.certificates,
        notices: db.notices.filter((n) => !n.branchId || n.branchId === myBranchId),
        paymentGateways: db.paymentGateways,
        transactions: db.transactions,
        campaigns: db.campaigns,
        auditLogs: db.auditLogs.slice(0, 15),
      });
    }

    if (user.role === 'teacher') {
      const recentAttempts = db.examAttempts.slice(0, 30);
      return res.json({
        role: user.role,
        metrics: {
          activeCourses: db.courses.length,
          totalBatches: db.batches.length,
          totalLessons: db.lessons.length,
          totalExams: db.exams.length,
          submissionsGraded: db.examAttempts.length,
        },
        courses: db.courses,
        batches: db.batches,
        lessons: db.lessons,
        exams: db.exams,
        branches: db.branches,
        users: db.users.filter((u) => u.role === 'student').map(sanitizeUser),
        examAttempts: recentAttempts,
        questionBank: db.questionBank,
        scormPackages: db.scormPackages,
        attendance: db.attendance,
        payrolls: db.payrolls.filter((p) => p.employeeId === user.id),
        assignments: db.assignments,
        assignmentSubmissions: db.assignmentSubmissions,
        speakingSubmissions: db.speakingSubmissions,
        certificates: db.certificates,
        notices: db.notices,
        posts: db.posts,
      });
    }

    if (user.role === 'guardian') {
      const linkedIds = user.guardianLinkedStudentIds ?? [];
      const children = db.users
        .filter((u) => linkedIds.includes(u.id) && (!user.branchId || !u.branchId || u.branchId === user.branchId))
        .map((child) => {
          const childEnrollments = db.enrollments.filter((e) => e.userId === child.id);
          const childAttempts = db.examAttempts.filter((a) => a.userId === child.id);
          const childAttendance = db.attendance.filter((a) => a.targetId === child.id);
          const childAssignments = db.assignmentSubmissions.filter((s) => s.studentId === child.id);
          const childLessonsCount: Record<string, number> = {};
          for (const enr of childEnrollments) {
            childLessonsCount[enr.courseId] = db.lessons.filter(
              (l) => l.courseId === enr.courseId
            ).length;
          }
          return {
            student: sanitizeUser(child),
            enrollments: childEnrollments,
            examAttempts: childAttempts,
            attendance: childAttendance,
            assignmentSubmissions: childAssignments,
            lessonsCountByCourse: childLessonsCount,
          };
        });
      return res.json({
        role: user.role,
        metrics: {
          linkedStudents: children.length,
          totalExamsTaken: children.reduce((s, c) => s + c.examAttempts.length, 0),
          activeCourses: children.reduce(
            (s, c) => s + c.enrollments.filter((e) => e.status === 'approved').length,
            0
          ),
        },
        children,
        teachers: db.users.filter((u) => u.role === 'teacher').map(sanitizeUser),
        feeInvoices: db.feeInvoices.filter((f) => linkedIds.includes(f.studentId)),
        notices: db.notices,
      });
    }

    // Student
    const myEnrollments = db.enrollments.filter((e) => e.userId === user.id);
    const myAttempts = db.examAttempts.filter((a) => a.userId === user.id);
    const myOrders = db.orders.filter((o) => o.userId === user.id);
    return res.json({
      role: user.role,
      metrics: {
        enrolledCourses: myEnrollments.filter((e) => e.status === 'approved').length,
        pendingCourses: myEnrollments.filter((e) => e.status === 'pending').length,
        examsTaken: myAttempts.length,
        ordersPlaced: myOrders.length,
      },
      enrollments: myEnrollments,
      examAttempts: myAttempts,
      orders: myOrders,
      courses: db.courses,
      batches: db.batches,
      lessons: db.lessons,
      scormPackages: db.scormPackages,
      scormAttempts: db.scormAttempts.filter((a) => a.userId === user.id),
      rewards: db.rewardsByUser[user.id] ?? null,
      transactions: db.transactions.filter((t) => t.userId === user.id),
      attendance: db.attendance.filter((a) => a.targetId === user.id),
      feeInvoices: db.feeInvoices.filter((f) => f.studentId === user.id),
      certificates: db.certificates.filter((c) => c.studentId === user.id),
      assignments: db.assignments,
      assignmentSubmissions: db.assignmentSubmissions.filter((s) => s.studentId === user.id),
      notices: db.notices,
    });
  });

  function parseCoursePayload(
    body: Record<string, unknown>,
    db: ReturnType<typeof getDb>,
    existing?: Course
  ) {
    const title = String(body?.title ?? existing?.title ?? '').trim().slice(0, 180);
    const subtitle = String(body?.subtitle ?? existing?.subtitle ?? '').trim().slice(0, 260);
    const rawCat = String(body?.category ?? existing?.category ?? 'HSC English').trim().slice(0, 60);
    const category = rawCat || 'HSC English';
    const levelTag = String(body?.levelTag ?? existing?.levelTag ?? 'HSC 27').trim().slice(0, 40) || 'HSC 27';
    const isCombo =
      typeof body?.isCombo === 'boolean'
        ? body.isCombo
        : category === 'Combo Packs'
          ? true
          : existing?.isCombo ?? false;
    const price = Math.max(0, Math.round(Number(body?.price ?? existing?.price ?? 0) || 0));
    const rawOrig = Number(body?.originalPrice ?? existing?.originalPrice ?? price);
    const originalPrice = Math.max(price, Math.round(Number.isFinite(rawOrig) ? rawOrig : price));
    const description =
      String(body?.description ?? existing?.description ?? subtitle).trim().slice(0, 4000) || subtitle;
    const examSystemIncluded =
      typeof body?.examSystemIncluded === 'boolean'
        ? body.examSystemIncluded
        : existing?.examSystemIncluded ?? true;
    const status: 'active' | 'draft' =
      body?.status === 'draft' ? 'draft' : body?.status === 'active' ? 'active' : existing?.status ?? 'active';

    const defaultThumb = '/src/assets/images/hero_hsc_english_1795411661478.jpg';
    const thumbnail = sanitizeSafeUrl(
      String(body?.thumbnail ?? existing?.thumbnail ?? defaultThumb),
      existing?.thumbnail || defaultThumb
    );
    const demoVideoTitle =
      String(body?.demoVideoTitle ?? existing?.demoVideoTitle ?? `${title} — Orientation Class`)
        .trim()
        .slice(0, 180) || `${title} — Orientation Class`;
    const demoYoutubeUrl = sanitizeSafeUrl(
      String(body?.demoYoutubeUrl ?? existing?.demoYoutubeUrl ?? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );

    const validBranchIds = new Set(db.branches.map((b) => b.id));
    const branchIds = Array.isArray(body?.branchIds)
      ? body.branchIds.map(String).filter((id) => validBranchIds.has(id))
      : existing?.branchIds ?? db.branches.map((b) => b.id);

    const validInstIds = new Set(db.instructors.map((i) => i.id));
    const instructorIds = Array.isArray(body?.instructorIds)
      ? body.instructorIds.map(String).filter((id) => validInstIds.has(id))
      : existing?.instructorIds ?? ['inst-1', 'inst-2'];

    const highlights = Array.isArray(body?.highlights)
      ? body.highlights.map((h) => String(h).trim()).filter(Boolean).slice(0, 12)
      : existing?.highlights ?? [
          'Structured Bilingual Lectures',
          'Printed PDF Practice Sheets',
          'Automated Weekly MCQ Evaluation',
        ];

    const includedCourses = isCombo
      ? Array.isArray(body?.includedCourses)
        ? body.includedCourses.map((c) => String(c).trim()).filter(Boolean).slice(0, 10)
        : existing?.includedCourses ?? []
      : undefined;

    const duration =
      String(body?.duration ?? existing?.duration ?? '6 Months').trim().slice(0, 60) || '6 Months';

    return {
      title,
      subtitle,
      category,
      levelTag,
      duration,
      isCombo,
      includedCourses,
      price,
      originalPrice,
      examSystemIncluded,
      branchIds: branchIds.length > 0 ? branchIds : db.branches.map((b) => b.id),
      instructorIds: instructorIds.length > 0 ? instructorIds : ['inst-1'],
      thumbnail,
      description,
      highlights:
        highlights.length > 0
          ? highlights
          : ['Structured Bilingual Lectures', 'Printable PDF Practice Sheets'],
      demoVideoTitle,
      demoYoutubeUrl,
      status,
    };
  }

  // Admin & Teacher: List all courses (including drafts), batches, and lessons
  app.get('/api/portal/courses', requireAuth, requireRole(['admin', 'teacher']), (_req, res) => {
    const db = getDb();
    res.json({ courses: db.courses, batches: db.batches, lessons: db.lessons });
  });

  // Admin: Create Course or Combo
  app.post('/api/portal/courses', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const parsed = parseCoursePayload((req.body ?? {}) as Record<string, unknown>, db);

    if (!parsed.title || !parsed.subtitle) {
      res.status(400).json({ error: 'Course title and subtitle are required' });
      return;
    }

    const baseSlug =
      parsed.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'course';
    const slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

    const course: Course = {
      id: `crs-${Date.now()}`,
      slug,
      ...parsed,
      enrolledCount: Math.max(0, Math.round(Number(req.body?.enrolledCount) || 0)),
    };

    db.courses.unshift(course);
    saveDb(db);
    res.status(201).json({ course });
  });

  // Admin: Modify an existing Course or Combo
  app.put('/api/portal/courses/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.courses.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    const existing = db.courses[idx];
    const parsed = parseCoursePayload((req.body ?? {}) as Record<string, unknown>, db, existing);
    if (!parsed.title || !parsed.subtitle) {
      res.status(400).json({ error: 'Course title and subtitle are required' });
      return;
    }

    const updated: Course = {
      ...existing,
      ...parsed,
    };
    db.courses[idx] = updated;
    // Keep enrollment courseTitle snapshots aligned if title changed
    for (const enr of db.enrollments) {
      if (enr.courseId === updated.id) {
        enr.courseTitle = updated.title;
      }
    }
    saveDb(db);
    res.json({ course: updated });
  });

  // Admin: Toggle Active / Draft status
  app.patch(
    '/api/portal/courses/:id/status',
    requireAuth,
    requireRole(['admin']),
    (req: AuthedRequest, res) => {
      const db = getDb();
      const course = db.courses.find((c) => c.id === req.params.id);
      if (!course) {
        res.status(404).json({ error: 'Course not found' });
        return;
      }
      const nextStatus = req.body?.status;
      if (nextStatus !== 'active' && nextStatus !== 'draft') {
        res.status(400).json({ error: 'Status must be active or draft' });
        return;
      }
      course.status = nextStatus;
      saveDb(db);
      res.json({ course });
    }
  );

  // Admin: Duplicate Course (clones as Draft along with its lessons)
  app.post(
    '/api/portal/courses/:id/duplicate',
    requireAuth,
    requireRole(['admin']),
    (req: AuthedRequest, res) => {
      const db = getDb();
      const source = db.courses.find((c) => c.id === req.params.id);
      if (!source) {
        res.status(404).json({ error: 'Course not found' });
        return;
      }
      const suffix = Date.now().toString().slice(-4);
      const clone: Course = {
        ...source,
        id: `crs-${Date.now()}`,
        slug: `${source.slug}-copy-${suffix}`,
        title: `${source.title} (Copy)`,
        enrolledCount: 0,
        status: 'draft',
      };
      db.courses.unshift(clone);

      const sourceLessons = db.lessons.filter((l) => l.courseId === source.id);
      sourceLessons.forEach((l, i) => {
        db.lessons.push({
          ...l,
          id: `les-${Date.now()}-${i}`,
          courseId: clone.id,
        });
      });

      saveDb(db);
      res.status(201).json({ course: clone });
    }
  );

  app.delete('/api/portal/courses/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.courses.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    const [removed] = db.courses.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}`,
      entityType: 'course',
      originalId: removed.id,
      label: removed.title,
      deletedBy: req.authUser?.name ?? 'Admin',
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    recordAuditLog(db, req.authUser!, 'COURSE_DELETE', removed.title, 'Moved to Recycle Bin');
    saveDb(db);
    res.json({ ok: true, deletedId: removed.id });
  });

  // ============================================================================
  // BATCHES CRUD (Admin, Teacher & Branch Manager)
  // ============================================================================
  const ALLOWED_BATCH_MODES: CourseBatch['mode'][] = ['Online Live', 'Offline Branch', 'Hybrid'];
  const ALLOWED_BATCH_STATUSES: CourseBatch['status'][] = ['open', 'running', 'closed'];

  function parseBatchPayload(
    body: Record<string, unknown>,
    db: ReturnType<typeof getDb>,
    existing?: CourseBatch
  ) {
    const courseId = String(body?.courseId ?? existing?.courseId ?? '').trim();
    const name = String(body?.name ?? existing?.name ?? '').trim().slice(0, 140);
    const code = String(body?.code ?? existing?.code ?? '')
      .trim()
      .toUpperCase()
      .slice(0, 32);
    const activeBranches = filterActiveBranches(db.branches);
    const branchId = String(body?.branchId ?? existing?.branchId ?? activeBranches[0]?.id ?? '').trim();
    const instructorId = String(
      body?.instructorId ?? existing?.instructorId ?? db.instructors[0]?.id ?? 'inst-1'
    ).trim();
    const schedule = String(body?.schedule ?? existing?.schedule ?? 'Sun · Tue · Thu (4:00 PM)')
      .trim()
      .slice(0, 140);
    const startDate = String(body?.startDate ?? existing?.startDate ?? '2026-05-01').trim().slice(0, 40);
    const seatLimit = Math.max(1, Math.min(5000, Math.round(Number(body?.seatLimit ?? existing?.seatLimit ?? 60) || 60)));
    const rawEnrolled = Number(body?.enrolledSeats ?? existing?.enrolledSeats ?? 0);
    const enrolledSeats = Math.max(0, Math.min(seatLimit, Math.round(Number.isFinite(rawEnrolled) ? rawEnrolled : 0)));
    const rawMode = String(body?.mode ?? existing?.mode ?? 'Hybrid');
    const mode: CourseBatch['mode'] = ALLOWED_BATCH_MODES.includes(rawMode as CourseBatch['mode'])
      ? (rawMode as CourseBatch['mode'])
      : 'Hybrid';
    const rawStatus = String(body?.status ?? existing?.status ?? 'open');
    const status: CourseBatch['status'] = ALLOWED_BATCH_STATUSES.includes(rawStatus as CourseBatch['status'])
      ? (rawStatus as CourseBatch['status'])
      : 'open';

    return {
      courseId,
      name,
      code,
      branchId,
      instructorId,
      schedule,
      startDate,
      seatLimit,
      enrolledSeats,
      mode,
      status,
    };
  }

  app.post(
    '/api/portal/batches',
    requireAuth,
    requireRole(['admin', 'teacher', 'branch_manager']),
    (req: AuthedRequest, res) => {
      const db = getDb();
      const actor = req.authUser!;
      const parsed = parseBatchPayload((req.body ?? {}) as Record<string, unknown>, db);
      if (!parsed.courseId || !parsed.name || !parsed.code) {
        res.status(400).json({ error: 'Course, batch name, and batch code are required' });
        return;
      }
      if (!db.courses.some((c) => c.id === parsed.courseId)) {
        res.status(404).json({ error: 'Target course not found' });
        return;
      }
      if (parsed.branchId && !isBranchActive(db.branches, parsed.branchId)) {
        res.status(400).json({ error: 'Selected branch is deactivated. Choose an active branch.' });
        return;
      }
      if (actor.role === 'branch_manager' && actor.branchId && parsed.branchId !== actor.branchId) {
        res.status(403).json({ error: 'Branch managers can only create batches for their own branch' });
        return;
      }
      const batch: CourseBatch = {
        id: `bat-${Date.now()}`,
        ...parsed,
      };
      db.batches.unshift(batch);
      saveDb(db);
      res.status(201).json({ batch });
    }
  );

  app.put(
    '/api/portal/batches/:id',
    requireAuth,
    requireRole(['admin', 'teacher', 'branch_manager']),
    (req: AuthedRequest, res) => {
      const db = getDb();
      const actor = req.authUser!;
      const idx = db.batches.findIndex((b) => b.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }
      const existing = db.batches[idx];
      if (actor.role === 'branch_manager' && actor.branchId && existing.branchId !== actor.branchId) {
        res.status(403).json({ error: 'Branch managers can only edit batches in their own branch' });
        return;
      }
      const parsed = parseBatchPayload((req.body ?? {}) as Record<string, unknown>, db, existing);
      if (!parsed.name || !parsed.code) {
        res.status(400).json({ error: 'Batch name and code are required' });
        return;
      }
      const updated: CourseBatch = { ...existing, ...parsed };
      db.batches[idx] = updated;
      for (const l of db.lessons) {
        if (l.batchId === updated.id) {
          l.batchName = updated.name;
        }
      }
      saveDb(db);
      res.json({ batch: updated });
    }
  );

  app.patch(
    '/api/portal/batches/:id/status',
    requireAuth,
    requireRole(['admin', 'teacher', 'branch_manager']),
    (req: AuthedRequest, res) => {
      const db = getDb();
      const actor = req.authUser!;
      const batch = db.batches.find((b) => b.id === req.params.id);
      if (!batch) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }
      if (actor.role === 'branch_manager' && actor.branchId && batch.branchId !== actor.branchId) {
        res.status(403).json({ error: 'Branch managers can only manage batches in their own branch' });
        return;
      }
      const nextStatus = req.body?.status;
      if (!ALLOWED_BATCH_STATUSES.includes(nextStatus)) {
        res.status(400).json({ error: 'Status must be open, running, or closed' });
        return;
      }
      batch.status = nextStatus;
      saveDb(db);
      res.json({ batch });
    }
  );

  app.delete(
    '/api/portal/batches/:id',
    requireAuth,
    requireRole(['admin', 'teacher', 'branch_manager']),
    (req: AuthedRequest, res) => {
      const db = getDb();
      const actor = req.authUser!;
      const idx = db.batches.findIndex((b) => b.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }
      const [removed] = db.batches.splice(idx, 1);
      if (actor.role === 'branch_manager' && actor.branchId && removed.branchId !== actor.branchId) {
        db.batches.splice(idx, 0, removed);
        res.status(403).json({ error: 'Branch managers can only delete batches in their own branch' });
        return;
      }
      for (const l of db.lessons) {
        if (l.batchId === removed.id) {
          l.batchId = null;
          l.batchName = undefined;
        }
      }
      db.recycleBin.unshift({
        id: `bin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        entityType: 'batch',
        originalId: removed.id,
        label: `${removed.name} (${removed.code})`,
        deletedBy: actor.name,
        deletedAt: new Date().toISOString(),
        snapshot: removed,
      });
      recordAuditLog(db, actor, 'BATCH_DELETE', removed.name, 'Moved to Recycle Bin');
      saveDb(db);
      res.json({ ok: true, deletedId: removed.id });
    }
  );

  // ============================================================================
  // LECTURES, LIVE CLASSES & RECORDED VIDEOS CRUD (Admin & Teacher)
  // ============================================================================
  const ALLOWED_LESSON_TYPES: LessonType[] = ['recorded', 'live', 'lecture_sheet', 'audio'];
  const ALLOWED_LIVE_STATUSES: LiveClassStatus[] = ['scheduled', 'live_now', 'ended'];

  function parseLessonPayload(
    body: Record<string, unknown>,
    db: ReturnType<typeof getDb>,
    existing?: CourseLesson
  ) {
    const courseId = String(body?.courseId ?? existing?.courseId ?? '').trim();
    const rawBatchId = body?.batchId !== undefined ? body.batchId : existing?.batchId;
    const batchId = rawBatchId ? String(rawBatchId).trim() : null;
    const linkedBatch = batchId ? db.batches.find((b) => b.id === batchId) : undefined;
    const batchName = linkedBatch
      ? linkedBatch.name
      : typeof body?.batchName === 'string' && body.batchName.trim()
        ? body.batchName.trim()
        : existing?.batchName;

    const rawType = String(body?.lessonType ?? existing?.lessonType ?? 'recorded');
    const lessonType: LessonType = ALLOWED_LESSON_TYPES.includes(rawType as LessonType)
      ? (rawType as LessonType)
      : 'recorded';

    const title = String(body?.title ?? existing?.title ?? '').trim().slice(0, 180);
    const moduleName = String(body?.moduleName ?? existing?.moduleName ?? 'Module 1: Core Grammar')
      .trim()
      .slice(0, 140);
    const duration = String(body?.duration ?? existing?.duration ?? '35:00').trim().slice(0, 40);
    const sheetSummary =
      String(body?.sheetSummary ?? existing?.sheetSummary ?? '').trim().slice(0, 2000) ||
      'Lecture notes and practice exercises included.';
    const isFreePreview =
      typeof body?.isFreePreview === 'boolean'
        ? body.isFreePreview
        : existing?.isFreePreview ?? false;

    const videoUrl =
      typeof body?.videoUrl === 'string'
        ? sanitizeSafeUrl(body.videoUrl, '')
        : existing?.videoUrl ?? '';
    const audioUrl =
      typeof body?.audioUrl === 'string'
        ? sanitizeSafeUrl(body.audioUrl, '')
        : existing?.audioUrl ?? '';
    const lectureSheetUrl =
      typeof body?.lectureSheetUrl === 'string'
        ? sanitizeSafeUrl(body.lectureSheetUrl, '')
        : existing?.lectureSheetUrl ?? '';
    const liveJoinUrl =
      typeof body?.liveJoinUrl === 'string'
        ? sanitizeSafeUrl(body.liveJoinUrl, '')
        : existing?.liveJoinUrl ?? '';
    const dripDays = Math.max(0, Math.min(365, Math.floor(Number(body?.dripDays ?? existing?.dripDays ?? 0) || 0)));
    const isPhonetics =
      typeof body?.isPhonetics === 'boolean' ? body.isPhonetics : existing?.isPhonetics ?? false;

    const rawLiveStatus = String(body?.liveStatus ?? existing?.liveStatus ?? 'scheduled');
    const liveStatus: LiveClassStatus | undefined =
      lessonType === 'live'
        ? ALLOWED_LIVE_STATUSES.includes(rawLiveStatus as LiveClassStatus)
          ? (rawLiveStatus as LiveClassStatus)
          : 'scheduled'
        : undefined;
    const scheduledAt =
      lessonType === 'live'
        ? String(body?.scheduledAt ?? existing?.scheduledAt ?? '').trim().slice(0, 60)
        : undefined;

    return {
      courseId,
      batchId: linkedBatch ? linkedBatch.id : batchId,
      batchName,
      lessonType,
      title,
      moduleName,
      duration,
      videoPreviewTitle: title,
      videoUrl: lessonType === 'recorded' && !videoUrl ? 'https://www.youtube.com/embed/dQw4w9WgXcQ' : videoUrl,
      audioUrl,
      lectureSheetUrl,
      liveJoinUrl,
      liveStatus,
      scheduledAt,
      dripDays,
      isPhonetics,
      sheetSummary,
      isFreePreview,
    };
  }

  // Admin & Teacher: Add Lecture / Live Class / Recorded Video
  app.post(
    '/api/portal/lessons',
    requireAuth,
    requireRole(['admin', 'teacher']),
    (req: AuthedRequest, res) => {
      const db = getDb();
      const parsed = parseLessonPayload((req.body ?? {}) as Record<string, unknown>, db);

      if (!parsed.courseId || !parsed.title) {
        res.status(400).json({ error: 'Course and lecture title are required' });
        return;
      }

      const existingCount = db.lessons.filter((l) => l.courseId === parsed.courseId).length;
      const lesson: CourseLesson = {
        id: `les-${Date.now()}`,
        ...parsed,
        orderIndex: existingCount + 1,
      };
      db.lessons.push(lesson);
      saveDb(db);
      res.status(201).json({ lesson });
    }
  );

  // Admin & Teacher: Edit Lecture / Live Class / Recorded Video
  app.put(
    '/api/portal/lessons/:id',
    requireAuth,
    requireRole(['admin', 'teacher']),
    (req: AuthedRequest, res) => {
      const db = getDb();
      const idx = db.lessons.findIndex((l) => l.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Lesson not found' });
        return;
      }
      const existing = db.lessons[idx];
      const parsed = parseLessonPayload((req.body ?? {}) as Record<string, unknown>, db, existing);
      if (!parsed.title) {
        res.status(400).json({ error: 'Lecture title is required' });
        return;
      }
      const updated: CourseLesson = {
        ...existing,
        ...parsed,
      };
      db.lessons[idx] = updated;
      saveDb(db);
      res.json({ lesson: updated });
    }
  );

  // Admin & Teacher: Quick Live Status Switch ('scheduled' | 'live_now' | 'ended')
  app.patch(
    '/api/portal/lessons/:id/live-status',
    requireAuth,
    requireRole(['admin', 'teacher']),
    (req, res) => {
      const db = getDb();
      const lesson = db.lessons.find((l) => l.id === req.params.id);
      if (!lesson) {
        res.status(404).json({ error: 'Lesson not found' });
        return;
      }
      const nextStatus = req.body?.liveStatus;
      if (!ALLOWED_LIVE_STATUSES.includes(nextStatus)) {
        res.status(400).json({ error: 'Live status must be scheduled, live_now, or ended' });
        return;
      }
      lesson.lessonType = 'live';
      lesson.liveStatus = nextStatus;
      if (typeof req.body?.videoUrl === 'string' && req.body.videoUrl.trim()) {
        lesson.videoUrl = sanitizeSafeUrl(req.body.videoUrl, lesson.videoUrl);
      }
      saveDb(db);
      res.json({ lesson });
    }
  );

  // Admin & Teacher: Reorder lesson up or down within course
  app.post(
    '/api/portal/lessons/:id/reorder',
    requireAuth,
    requireRole(['admin', 'teacher']),
    (req, res) => {
      const db = getDb();
      const target = db.lessons.find((l) => l.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Lesson not found' });
        return;
      }
      const dir = req.body?.direction === 'up' ? -1 : 1;
      const courseLessons = db.lessons
        .filter((l) => l.courseId === target.courseId)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      const pos = courseLessons.findIndex((l) => l.id === target.id);
      const swapPos = pos + dir;
      if (pos >= 0 && swapPos >= 0 && swapPos < courseLessons.length) {
        const temp = courseLessons[pos];
        courseLessons[pos] = courseLessons[swapPos];
        courseLessons[swapPos] = temp;
      }
      courseLessons.forEach((l, i) => {
        l.orderIndex = i + 1;
      });
      saveDb(db);
      res.json({ lessons: courseLessons });
    }
  );

  // Admin & Teacher: Duplicate lesson inside course
  app.post(
    '/api/portal/lessons/:id/duplicate',
    requireAuth,
    requireRole(['admin', 'teacher']),
    (req, res) => {
      const db = getDb();
      const source = db.lessons.find((l) => l.id === req.params.id);
      if (!source) {
        res.status(404).json({ error: 'Lesson not found' });
        return;
      }
      const existingCount = db.lessons.filter((l) => l.courseId === source.courseId).length;
      const clone: CourseLesson = {
        ...source,
        id: `les-${Date.now()}`,
        title: `${source.title} (Copy)`,
        videoPreviewTitle: `${source.title} (Copy)`,
        orderIndex: existingCount + 1,
      };
      db.lessons.push(clone);
      saveDb(db);
      res.status(201).json({ lesson: clone });
    }
  );

  // Admin & Teacher: Delete Lesson
  app.delete(
    '/api/portal/lessons/:id',
    requireAuth,
    requireRole(['admin', 'teacher']),
    (req: AuthedRequest, res) => {
      const db = getDb();
      const idx = db.lessons.findIndex((l) => l.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Lesson not found' });
        return;
      }
      const [removed] = db.lessons.splice(idx, 1);
      db.lessons
        .filter((l) => l.courseId === removed.courseId)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .forEach((l, i) => {
          l.orderIndex = i + 1;
        });
      db.recycleBin.unshift({
        id: `bin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        entityType: 'lesson',
        originalId: removed.id,
        label: removed.title,
        deletedBy: req.authUser?.name ?? 'Admin',
        deletedAt: new Date().toISOString(),
        snapshot: removed,
      });
      if (req.authUser) {
        recordAuditLog(db, req.authUser, 'LESSON_DELETE', removed.title, 'Moved to Recycle Bin');
      }
      saveDb(db);
      res.json({ ok: true, deletedId: removed.id });
    }
  );

  // Admin & Teacher: Create MCQ Exam
  app.post(
    '/api/portal/exams',
    requireAuth,
    requireRole(['admin', 'teacher']),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const title = String(req.body?.title ?? '').trim();
      const category = String(req.body?.category ?? 'HSC English').trim();
      const courseId = req.body?.courseId ? String(req.body.courseId) : null;
      const durationMinutes = Math.max(5, Number(req.body?.durationMinutes) || 15);
      const visibility = req.body?.visibility === 'course' ? 'course' : 'public';
      const questionsInput = Array.isArray(req.body?.questions) ? req.body.questions : [];

      if (!title || questionsInput.length === 0) {
        res.status(400).json({ error: 'Exam title and at least one MCQ question are required' });
        return;
      }

      const questions: ExamQuestion[] = questionsInput.map((q: Record<string, unknown>, idx: number) => ({
        id: `q-${Date.now()}-${idx}`,
        prompt: String(q.prompt ?? '').trim(),
        options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : ['A', 'B', 'C', 'D'],
        correctIndex: Math.min(3, Math.max(0, Number(q.correctIndex) || 0)),
        explanation: String(q.explanation ?? 'Verified by Aloms English Center faculty.').trim(),
        marks: Math.max(1, Number(q.marks) || 2),
      }));

      const db = getDb();
      const exam: Exam = {
        id: `exm-${Date.now()}`,
        title,
        courseId,
        category,
        durationMinutes,
        passPercentage: 50,
        visibility,
        teacherId: user.id,
        questions,
        createdAt: new Date().toISOString(),
      };
      db.exams.unshift(exam);
      saveDb(db);
      res.status(201).json({ exam });
    }
  );

  // Admin: Create Branch
  app.post('/api/portal/branches', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const name = String(req.body?.name ?? '').trim();
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    const city = String(req.body?.city ?? '').trim();
    const address = String(req.body?.address ?? '').trim();
    const phone = String(req.body?.phone ?? '').trim();
    const managerName = String(req.body?.managerName ?? '').trim();
    const status = req.body?.status === 'inactive' ? 'inactive' : 'active';

    if (!name || !code || !city || !address) {
      res.status(400).json({ error: 'Branch name, code, city, and address are required' });
      return;
    }

    const db = getDb();
    if (db.branches.some((b) => b.code.toUpperCase() === code)) {
      res.status(409).json({ error: `Branch code "${code}" already exists.` });
      return;
    }
    const branch: Branch = {
      id: `br-${Date.now()}`,
      name,
      code,
      city,
      address,
      phone: phone || '09617331133',
      managerName: managerName || 'Branch Coordinator',
      activeStudents: Math.max(0, Number(req.body?.activeStudents) || 0),
      status,
    };
    db.branches.push(branch);
    recordAuditLog(db, req.authUser!, 'BRANCH_CREATE', branch.name, `${branch.code} (${branch.city})`);
    saveDb(db);
    res.status(201).json({ branch });
  });

  // Admin: Update / Edit Branch
  app.put('/api/portal/branches/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const branch = db.branches.find((b) => b.id === req.params.id);
    if (!branch) {
      res.status(404).json({ error: 'Branch not found' });
      return;
    }
    const name = String(req.body?.name ?? branch.name).trim();
    const code = String(req.body?.code ?? branch.code).trim().toUpperCase();
    const city = String(req.body?.city ?? branch.city).trim();
    const address = String(req.body?.address ?? branch.address).trim();
    const phone = String(req.body?.phone ?? branch.phone).trim();
    const managerName = String(req.body?.managerName ?? branch.managerName).trim();
    if (!name || !code || !city || !address) {
      res.status(400).json({ error: 'Branch name, code, city, and address are required' });
      return;
    }
    if (db.branches.some((b) => b.id !== branch.id && b.code.toUpperCase() === code)) {
      res.status(409).json({ error: `Branch code "${code}" already exists.` });
      return;
    }
    branch.name = name;
    branch.code = code;
    branch.city = city;
    branch.address = address;
    branch.phone = phone || branch.phone;
    branch.managerName = managerName || branch.managerName;
    if (req.body?.activeStudents !== undefined) {
      branch.activeStudents = Math.max(0, Number(req.body.activeStudents) || 0);
    }
    if (req.body?.status === 'active' || req.body?.status === 'inactive') {
      branch.status = req.body.status;
    }
    recordAuditLog(db, req.authUser!, 'BRANCH_UPDATE', branch.name, `${branch.code} (${branch.status})`);
    saveDb(db);
    res.json({ branch, branches: db.branches });
  });

  // Admin: Toggle Branch Active / Inactive Status
  app.patch('/api/portal/branches/:id/status', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const branch = db.branches.find((b) => b.id === req.params.id);
    if (!branch) {
      res.status(404).json({ error: 'Branch not found' });
      return;
    }
    const requested = req.body?.status;
    branch.status =
      requested === 'active' || requested === 'inactive'
        ? requested
        : branch.status === 'active'
          ? 'inactive'
          : 'active';
    recordAuditLog(db, req.authUser!, 'BRANCH_STATUS', branch.name, `Set to ${branch.status}`);
    saveDb(db);
    res.json({ branch, branches: db.branches });
  });

  // Admin: Soft-Delete Branch to Recycle Bin
  app.delete('/api/portal/branches/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.branches.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Branch not found' });
      return;
    }
    const [removed] = db.branches.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      entityType: 'branch',
      originalId: removed.id,
      label: `${removed.name} (${removed.code})`,
      deletedBy: req.authUser!.name,
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    recordAuditLog(db, req.authUser!, 'BRANCH_DELETE', removed.name, 'Moved to Recycle Bin');
    saveDb(db);
    res.json({ deletedId: removed.id, branches: db.branches });
  });

  // Admin & Branch Manager: Approve/Reject Enrollment
  app.patch(
    '/api/portal/enrollments/:id',
    requireAuth,
    requireRole(['admin', 'branch_manager']),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const status = req.body?.status as 'approved' | 'pending' | 'rejected';
      if (!['approved', 'pending', 'rejected'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }

      const db = getDb();
      const enrollment = db.enrollments.find((e) => e.id === req.params.id);
      if (!enrollment) {
        res.status(404).json({ error: 'Enrollment not found' });
        return;
      }

      if (user.role === 'branch_manager' && user.branchId && enrollment.branchId !== user.branchId) {
        res.status(403).json({ error: 'Branch managers can only manage enrollments for their own branch' });
        return;
      }

      const prevStatus = enrollment.status;
      enrollment.status = status;
      if (prevStatus !== 'approved' && status === 'approved') {
        const course = db.courses.find((c) => c.id === enrollment.courseId);
        if (course) course.enrolledCount += 1;
      }
      saveDb(db);
      res.json({ enrollment });
    }
  );

  // Admin & Branch Manager: Update Order Status
  app.patch(
    '/api/portal/orders/:id',
    requireAuth,
    requireRole(['admin', 'branch_manager']),
    (req, res) => {
      const status = req.body?.status as 'processing' | 'shipped' | 'delivered' | 'cancelled';
      if (!['processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
        res.status(400).json({ error: 'Invalid order status' });
        return;
      }
      const db = getDb();
      const order = db.orders.find((o) => o.id === req.params.id);
      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      order.status = status;
      saveDb(db);
      res.json({ order });
    }
  );

  // Admin: Create User with any role or update user role/branch/guardian link
  app.post('/api/portal/users', requireAuth, requireRole(['admin']), (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const phone = String(req.body?.phone ?? '').trim();
    const password = String(req.body?.password ?? 'Aloms@2026');
    const role = req.body?.role;
    const branchId = req.body?.branchId ? String(req.body.branchId) : null;
    const linkedStudentId = req.body?.linkedStudentId ? String(req.body.linkedStudentId) : null;

    if (!name || !email || !isValidRole(role)) {
      res.status(400).json({ error: 'Name, email, and valid role are required' });
      return;
    }

    const db = getDb();
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'Email already exists' });
      return;
    }

    const newUser: StoredUser = {
      id: `u-${Date.now()}`,
      name,
      email,
      phone: phone || '01700000000',
      role,
      branchId,
      rollNumber: role === 'student' ? `AEC-2026-${100 + db.users.length + 1}` : undefined,
      guardianLinkedStudentIds: role === 'guardian' && linkedStudentId ? [linkedStudentId] : undefined,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);
    saveDb(db);
    res.status(201).json({ user: sanitizeUser(newUser) });
  });

  app.patch('/api/portal/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
    const db = getDb();
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (req.body?.role && isValidRole(req.body.role)) {
      target.role = req.body.role;
    }
    if (req.body?.branchId !== undefined) {
      target.branchId = req.body.branchId ? String(req.body.branchId) : null;
    }
    if (Array.isArray(req.body?.guardianLinkedStudentIds)) {
      target.guardianLinkedStudentIds = req.body.guardianLinkedStudentIds.map(String);
    }
    saveDb(db);
    res.json({ user: sanitizeUser(target) });
  });

  app.patch('/api/portal/settings', requireAuth, requireRole(['admin']), (req, res) => {
    const db = getDb();
    const allowedKeys = ['brandName', 'tagline', 'phone', 'email', 'whatsappNumber', 'address', 'licenseNo', 'aboutMission'] as const;
    for (const key of allowedKeys) {
      if (typeof req.body?.[key] === 'string' && req.body[key].trim()) {
        db.settings[key] = req.body[key].trim();
      }
    }
    saveDb(db);
    res.json({ settings: db.settings });
  });

  // Admin: Homepage CMS — Hero Slides update
  app.put('/api/portal/homepage/slides', requireAuth, requireRole(['admin']), (req, res) => {
    const db = getDb();
    const incoming = req.body?.heroSlides;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      res.status(400).json({ error: 'At least one hero slide is required.' });
      return;
    }

    const normalized: HeroSlide[] = incoming.map((raw: Record<string, unknown>, idx: number) => {
      const title = String(raw.title ?? '').trim() || `Slide ${idx + 1}`;
      const badge = String(raw.badge ?? '').trim() || 'AEC 27';
      const subtitle = String(raw.subtitle ?? '').trim();
      const ctaText = String(raw.ctaText ?? '').trim() || 'Explore Course';
      const courseSlug = String(raw.courseSlug ?? '').trim() || 'ssc-english-final-revision';
      const image = sanitizeSafeUrl(
        String(raw.image ?? ''),
        '/src/assets/images/hero_hsc_english_1795411661478.jpg'
      );
      const gradient =
        String(raw.gradient ?? '').trim() || 'from-cyan-900/85 via-sky-950/75 to-slate-950/90';

      return {
        id: String(raw.id ?? `slide-${Date.now()}-${idx}`),
        badge,
        title,
        subtitle,
        ctaText,
        courseSlug,
        image,
        gradient,
        active: raw.active !== false,
      };
    });

    db.settings.heroSlides = normalized;
    saveDb(db);
    res.json({ settings: db.settings });
  });

  // Admin: Homepage CMS — Featured Highlights, Stats & Section Headers
  app.put('/api/portal/homepage/config', requireAuth, requireRole(['admin']), (req, res) => {
    const db = getDb();
    const fallback = createDefaultHomepageConfig();
    const current = db.settings.homepageConfig ?? fallback;
    const body = (req.body?.homepageConfig ?? {}) as Partial<HomepageConfig>;

    const nextConfig: HomepageConfig = {
      featuredCard: {
        badge: String(body.featuredCard?.badge ?? current.featuredCard.badge).trim() || fallback.featuredCard.badge,
        title: String(body.featuredCard?.title ?? current.featuredCard.title).trim() || fallback.featuredCard.title,
        subtitle: String(body.featuredCard?.subtitle ?? current.featuredCard.subtitle).trim(),
        ctaText: String(body.featuredCard?.ctaText ?? current.featuredCard.ctaText).trim() || 'See All Courses',
        ctaLink: sanitizeSafeUrl(String(body.featuredCard?.ctaLink ?? current.featuredCard.ctaLink), '/courses'),
        highlights: Array.isArray(body.featuredCard?.highlights)
          ? body.featuredCard.highlights.map((h, i) => ({
              id: String(h.id || `fhl-${Date.now()}-${i}`),
              title: String(h.title || '').trim() || 'Featured Track',
              desc: String(h.desc || '').trim(),
              categoryLink: sanitizeSafeUrl(String(h.categoryLink || '/courses'), '/courses'),
              iconKey: h.iconKey || 'book',
              accentColor: h.accentColor || 'emerald',
            }))
          : current.featuredCard.highlights,
      },
      statsCard: {
        mode: body.statsCard?.mode === 'custom' ? 'custom' : 'auto',
        badge: String(body.statsCard?.badge ?? current.statsCard.badge).trim() || fallback.statsCard.badge,
        title: String(body.statsCard?.title ?? current.statsCard.title).trim() || fallback.statsCard.title,
        subtitle: String(body.statsCard?.subtitle ?? current.statsCard.subtitle).trim(),
        ctaText: String(body.statsCard?.ctaText ?? current.statsCard.ctaText).trim() || 'See All Courses',
        ctaLink: sanitizeSafeUrl(String(body.statsCard?.ctaLink ?? current.statsCard.ctaLink), '/courses'),
        customValues: {
          students: Math.max(0, Number(body.statsCard?.customValues?.students ?? current.statsCard.customValues.students) || 0),
          courses: Math.max(0, Number(body.statsCard?.customValues?.courses ?? current.statsCard.customValues.courses) || 0),
          teachers: Math.max(0, Number(body.statsCard?.customValues?.teachers ?? current.statsCard.customValues.teachers) || 0),
          videos: Math.max(0, Number(body.statsCard?.customValues?.videos ?? current.statsCard.customValues.videos) || 0),
        },
        labels: {
          students: String(body.statsCard?.labels?.students ?? current.statsCard.labels.students).trim() || 'Students',
          courses: String(body.statsCard?.labels?.courses ?? current.statsCard.labels.courses).trim() || 'Courses',
          teachers: String(body.statsCard?.labels?.teachers ?? current.statsCard.labels.teachers).trim() || 'Teachers',
          videos: String(body.statsCard?.labels?.videos ?? current.statsCard.labels.videos).trim() || 'Videos',
        },
      },
      learningPathsSection: {
        heading:
          String(body.learningPathsSection?.heading ?? current.learningPathsSection.heading).trim() ||
          fallback.learningPathsSection.heading,
        subheading: String(
          body.learningPathsSection?.subheading ?? current.learningPathsSection.subheading
        ).trim(),
        items: Array.isArray(body.learningPathsSection?.items)
          ? body.learningPathsSection.items.map((item, i) => ({
              id: String(item.id || `lp-${Date.now()}-${i}`),
              title: String(item.title || '').trim() || 'Program Track',
              desc: String(item.desc || '').trim(),
              category: String(item.category || 'All Courses').trim() || 'All Courses',
              iconKey: item.iconKey || 'book',
              accentKey: item.accentKey || 'sky',
              image: item.image ? sanitizeSafeUrl(String(item.image), '') : undefined,
            }))
          : current.learningPathsSection.items,
      },
      reviewsSection: {
        kicker:
          String(body.reviewsSection?.kicker ?? current.reviewsSection.kicker).trim() ||
          fallback.reviewsSection.kicker,
        heading:
          String(body.reviewsSection?.heading ?? current.reviewsSection.heading).trim() ||
          fallback.reviewsSection.heading,
        subheading: String(
          body.reviewsSection?.subheading ?? current.reviewsSection.subheading
        ).trim(),
      },
    };

    db.settings.homepageConfig = nextConfig;
    saveDb(db);
    res.json({ settings: db.settings });
  });

  // Admin: Homepage Testimonials / Reviews CRUD (with moderation, featured, avatar & recycle-bin)
  app.post('/api/portal/reviews', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const { name, roleLabel, text, rating, row, status, featured, courseTag, avatar, verified } = req.body ?? {};
    if (!String(name ?? '').trim() || !String(text ?? '').trim()) {
      res.status(400).json({ error: 'Reviewer name and testimonial text are required.' });
      return;
    }

    const review: Review = {
      id: `rev-${Date.now()}`,
      name: String(name).trim(),
      roleLabel: String(roleLabel ?? 'Verified Student').trim(),
      text: String(text).trim(),
      rating: Math.min(5, Math.max(1, Number(rating) || 5)),
      row: Number(row) === 2 ? 2 : 1,
      status: ['approved', 'pending', 'hidden'].includes(status) ? status : 'approved',
      featured: Boolean(featured),
      courseTag: courseTag ? String(courseTag).trim() : undefined,
      avatar: avatar ? sanitizeSafeUrl(String(avatar), '') : undefined,
      verified: verified !== false,
      createdAt: new Date().toISOString(),
    };

    db.reviews.unshift(review);
    recordAuditLog(db, req.authUser!, 'REVIEW_CREATE', review.name, `status=${review.status}`);
    saveDb(db);
    res.status(201).json({ review, reviews: db.reviews });
  });

  app.put('/api/portal/reviews/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const review = db.reviews.find((r) => r.id === req.params.id);
    if (!review) {
      res.status(404).json({ error: 'Review not found.' });
      return;
    }

    const { name, roleLabel, text, rating, row, status, featured, courseTag, avatar, verified } = req.body ?? {};
    if (!String(name ?? '').trim() || !String(text ?? '').trim()) {
      res.status(400).json({ error: 'Reviewer name and testimonial text are required.' });
      return;
    }

    review.name = String(name).trim();
    review.roleLabel = String(roleLabel ?? review.roleLabel).trim();
    review.text = String(text).trim();
    review.rating = Math.min(5, Math.max(1, Number(rating) || 5));
    review.row = Number(row) === 2 ? 2 : 1;
    if (['approved', 'pending', 'hidden'].includes(status)) review.status = status;
    if (typeof featured === 'boolean') review.featured = featured;
    if (courseTag !== undefined) review.courseTag = String(courseTag).trim() || undefined;
    if (avatar !== undefined) review.avatar = avatar ? sanitizeSafeUrl(String(avatar), '') : undefined;
    if (typeof verified === 'boolean') review.verified = verified;

    saveDb(db);
    res.json({ review, reviews: db.reviews });
  });

  app.delete('/api/portal/reviews/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.reviews.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Review not found.' });
      return;
    }
    const [removed] = db.reviews.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}`,
      entityType: 'review',
      originalId: removed.id,
      label: `${removed.name} (${removed.roleLabel})`,
      deletedBy: req.authUser?.name ?? 'Admin',
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    saveDb(db);
    res.json({ deletedId: removed.id, reviews: db.reviews });
  });

  // Admin & Faculty: Custom Banner Image Upload & Media Library
  app.get('/api/portal/uploads', requireAuth, requireRole(['admin', 'teacher', 'branch_manager']), (_req, res) => {
    if (!fs.existsSync(uploadsDir)) {
      res.json({ files: [] });
      return;
    }
    const entries = fs
      .readdirSync(uploadsDir)
      .filter((name) => /^cms-\d+-[a-f0-9]{8}\.(png|jpg|webp|gif)$/.test(name))
      .map((name) => {
        const stat = fs.statSync(path.join(uploadsDir, name));
        return {
          name,
          url: `/uploads/${name}`,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    res.json({ files: entries });
  });

  app.post('/api/portal/upload-image', requireAuth, requireRole(['admin', 'teacher', 'branch_manager']), (req, res) => {
    const rawDataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
    const parsed = parseImageUploadDataUrl(rawDataUrl, 5 * 1024 * 1024);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const buffer = Buffer.from(parsed.value.base64Data, 'base64');
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'Uploaded image exceeds 5 MB size limit.' });
      return;
    }
    if (!hasValidImageMagicBytes(buffer, parsed.value.extension)) {
      res.status(400).json({
        error: 'Image file signature does not match a valid PNG, JPG, WEBP, or GIF file.',
      });
      return;
    }

    fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `cms-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${parsed.value.extension}`;
    const targetPath = path.join(uploadsDir, filename);
    fs.writeFileSync(targetPath, buffer);

    res.status(201).json({
      url: `/uploads/${filename}`,
      name: filename,
      sizeBytes: buffer.length,
    });
  });

  app.delete('/api/portal/uploads/:filename', requireAuth, requireRole(['admin']), (req, res) => {
    const filename = String(req.params.filename ?? '');
    if (!/^cms-\d+-[a-f0-9]{8}\.(png|jpg|webp|gif)$/.test(filename)) {
      res.status(400).json({ error: 'Invalid upload filename.' });
      return;
    }
    const targetPath = path.join(uploadsDir, filename);
    if (!fs.existsSync(targetPath)) {
      res.status(404).json({ error: 'Uploaded file not found.' });
      return;
    }
    fs.unlinkSync(targetPath);
    res.json({ deletedName: filename });
  });

  // Safe static download route for Laravel Ready-to-Install ZIP
  app.get('/downloads/aloms-english-center-laravel.zip', (_req, res) => {
    const zipPath = path.resolve(
      process.cwd(),
      'public',
      'downloads',
      'aloms-english-center-laravel.zip'
    );
    if (!fs.existsSync(zipPath)) {
      res.status(404).json({ error: 'Laravel installer archive is being prepared' });
      return;
    }
    res.download(zipPath, 'aloms-english-center-laravel.zip');
  });

  // Mount AI Agents, Platform Operations & Enterprise Routers
  app.use('/api/ai', createAiRouter(getBearerUser));
  app.use(createPlatformRouter(requireAuth, requireRole));
  app.use(createEnterpriseRouter(requireAuth, requireRole));

  // Vite middleware in dev, dist static in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Aloms English Center running on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
