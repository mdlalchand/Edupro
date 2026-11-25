import type {
  Coupon,
  Course,
  CourseBatch,
  CourseLesson,
  ExamQuestion,
  HeaderMenuItem,
  HomepageConfig,
  LessonType,
  QuestionBankItem,
  UserRole,
} from '../types';

export type PortalSection =
  | 'overview'
  | 'courses'
  | 'lessons'
  | 'assignments'
  | 'homepage_cms'
  | 'catalog_cms'
  | 'exams'
  | 'payments'
  | 'fees_ledger'
  | 'attendance_finance'
  | 'enrollments'
  | 'branches'
  | 'users'
  | 'orders'
  | 'certificates'
  | 'notices'
  | 'reports'
  | 'saas_automation'
  | 'ai_ecosystem'
  | 'guardian_monitor'
  | 'my_learning'
  | 'settings';

const ADMIN_SECTIONS: PortalSection[] = [
  'overview',
  'courses',
  'lessons',
  'assignments',
  'homepage_cms',
  'catalog_cms',
  'exams',
  'payments',
  'fees_ledger',
  'attendance_finance',
  'enrollments',
  'branches',
  'users',
  'orders',
  'certificates',
  'notices',
  'reports',
  'saas_automation',
  'ai_ecosystem',
  'settings',
];

const ROLE_PORTAL_MATRIX: Record<UserRole, PortalSection[]> = {
  super_admin: ADMIN_SECTIONS,
  admin: ADMIN_SECTIONS,
  branch_manager: [
    'overview',
    'courses',
    'payments',
    'fees_ledger',
    'attendance_finance',
    'enrollments',
    'branches',
    'users',
    'orders',
    'certificates',
    'notices',
    'reports',
  ],
  teacher: [
    'overview',
    'courses',
    'lessons',
    'assignments',
    'exams',
    'attendance_finance',
    'certificates',
    'notices',
    'reports',
    'ai_ecosystem',
  ],
  student: [
    'overview',
    'my_learning',
    'assignments',
    'fees_ledger',
    'certificates',
    'notices',
    'ai_ecosystem',
    'enrollments',
    'orders',
  ],
  guardian: [
    'overview',
    'guardian_monitor',
    'fees_ledger',
    'notices',
  ],
  accountant: [
    'overview',
    'payments',
    'fees_ledger',
    'attendance_finance',
    'enrollments',
    'orders',
    'reports',
    'notices',
  ],
  staff: [
    'overview',
    'enrollments',
    'orders',
    'attendance_finance',
    'notices',
    'fees_ledger',
  ],
};

export function isAdminRole(role: UserRole): boolean {
  return role === 'admin' || role === 'super_admin';
}

export function getAllowedPortalSections(role: UserRole): PortalSection[] {
  return ROLE_PORTAL_MATRIX[role] ?? ['overview'];
}

export function canRoleAccessPortalSection(role: UserRole, section: PortalSection): boolean {
  return getAllowedPortalSections(role).includes(section);
}

export interface PriceBreakdown {
  originalPrice: number;
  basePrice: number;
  baseDiscountPercent: number;
  couponDiscountAmount: number;
  finalPrice: number;
  appliedCouponCode: string | null;
}

export function calculateDiscountedPrice(
  price: number,
  originalPrice: number,
  coupon?: Coupon | null
): PriceBreakdown {
  const safeBase = Math.max(0, Math.round(price));
  const safeOriginal = Math.max(safeBase, Math.round(originalPrice));
  const baseDiscountPercent =
    safeOriginal > 0 ? Math.round(((safeOriginal - safeBase) / safeOriginal) * 100) : 0;

  let couponDiscountAmount = 0;
  let appliedCouponCode: string | null = null;

  if (coupon && coupon.active && coupon.discountPercent > 0) {
    const pct = Math.min(90, Math.max(1, coupon.discountPercent));
    couponDiscountAmount = Math.round((safeBase * pct) / 100);
    appliedCouponCode = coupon.code.toUpperCase();
  }

  return {
    originalPrice: safeOriginal,
    basePrice: safeBase,
    baseDiscountPercent,
    couponDiscountAmount,
    finalPrice: Math.max(0, safeBase - couponDiscountAmount),
    appliedCouponCode,
  };
}

export interface ExamGradingResult {
  score: number;
  totalMarks: number;
  correctCount: number;
  wrongCount: number;
  negativeDeduction: number;
  totalQuestions: number;
  percentage: number;
  grade: string;
  passed: boolean;
  requiresManualReview: boolean;
  questionResults: {
    questionId: string;
    type: 'mcq' | 'true_false' | 'written' | 'matching';
    selectedIndex: number | null;
    correctIndex: number;
    isCorrect: boolean;
    earnedMarks: number;
  }[];
}

export interface GradeExamOptions {
  negativeMarkPerWrong?: number;
  writtenAnswers?: Record<string, string>;
  matchingAnswers?: Record<string, Record<string, string>>;
  manualScores?: Record<string, number>;
}

export function gradeExamSubmission(
  questions: ExamQuestion[],
  answers: Record<string, number>,
  passPercentage = 40,
  options: GradeExamOptions = {}
): ExamGradingResult {
  let rawScore = 0;
  let totalMarks = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let negativeDeduction = 0;
  let requiresManualReview = false;
  const negMark = Math.max(0, Number(options.negativeMarkPerWrong) || 0);

  const questionResults = questions.map((q) => {
    const marks = Math.max(1, q.marks || 1);
    const qType = q.type ?? 'mcq';
    totalMarks += marks;

    if (qType === 'written') {
      const manual = options.manualScores?.[q.id];
      if (typeof manual === 'number' && Number.isFinite(manual)) {
        const clamped = Math.min(marks, Math.max(0, manual));
        rawScore += clamped;
        const ok = clamped >= marks * 0.5;
        if (ok) correctCount += 1;
        return {
          questionId: q.id,
          type: qType,
          selectedIndex: null,
          correctIndex: q.correctIndex,
          isCorrect: ok,
          earnedMarks: clamped,
        };
      }
      requiresManualReview = true;
      return {
        questionId: q.id,
        type: qType,
        selectedIndex: null,
        correctIndex: q.correctIndex,
        isCorrect: false,
        earnedMarks: 0,
      };
    }

    if (qType === 'matching' && Array.isArray(q.matchingPairs) && q.matchingPairs.length > 0) {
      const submittedPairs = options.matchingAnswers?.[q.id] ?? {};
      const matchedCount = q.matchingPairs.filter(
        (pair) => (submittedPairs[pair.left] ?? '').trim() === pair.right.trim()
      ).length;
      const ratio = matchedCount / q.matchingPairs.length;
      const earned = Math.round(marks * ratio * 100) / 100;
      rawScore += earned;
      const allCorrect = matchedCount === q.matchingPairs.length;
      if (allCorrect) correctCount += 1;
      else if (Object.keys(submittedPairs).length > 0) wrongCount += 1;
      return {
        questionId: q.id,
        type: qType,
        selectedIndex: null,
        correctIndex: q.correctIndex,
        isCorrect: allCorrect,
        earnedMarks: earned,
      };
    }

    const rawSelection = answers[q.id];
    const selectedIndex = typeof rawSelection === 'number' ? rawSelection : null;
    const isCorrect = selectedIndex !== null && selectedIndex === q.correctIndex;
    if (isCorrect) {
      rawScore += marks;
      correctCount += 1;
    } else if (selectedIndex !== null) {
      wrongCount += 1;
      if (negMark > 0) {
        negativeDeduction += negMark;
      }
    }
    return {
      questionId: q.id,
      type: qType,
      selectedIndex,
      correctIndex: q.correctIndex,
      isCorrect,
      earnedMarks: isCorrect ? marks : 0,
    };
  });

  const score = Math.max(0, Math.round((rawScore - negativeDeduction) * 100) / 100);
  const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
  const passed = percentage >= passPercentage;

  let grade = 'F';
  if (percentage >= 80) grade = 'A+';
  else if (percentage >= 70) grade = 'A';
  else if (percentage >= 60) grade = 'A-';
  else if (percentage >= 50) grade = 'B';
  else if (percentage >= 40) grade = 'C';
  else if (percentage >= 33) grade = 'D';

  return {
    score,
    totalMarks,
    correctCount,
    wrongCount,
    negativeDeduction: Math.round(negativeDeduction * 100) / 100,
    totalQuestions: questions.length,
    percentage,
    grade,
    passed,
    requiresManualReview,
    questionResults,
  };
}

export type CourseSortOption = 'featured' | 'price_asc' | 'price_desc' | 'popular';

export interface FilterCoursesOptions {
  includeDrafts?: boolean;
  sortBy?: CourseSortOption;
}

export function sanitizeSafeUrl(input: string, fallback = ''): string {
  const trimmed = input.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function filterCourses(
  courses: Course[],
  category: string,
  searchQuery = '',
  options: FilterCoursesOptions = {}
): Course[] {
  const { includeDrafts = false, sortBy = 'featured' } = options;
  const q = searchQuery.trim().toLowerCase();
  const catLower = category.trim().toLowerCase();

  const filtered = courses.filter((course) => {
    if (!includeDrafts && course.status !== 'active') return false;
    const matchesCategory =
      category === 'All' ||
      category === 'All Courses' ||
      (category === 'Combos'
        ? course.isCombo
        : course.category === category ||
          course.levelTag.toLowerCase() === catLower ||
          course.title.toLowerCase().includes(catLower));
    if (!matchesCategory) return false;
    if (!q) return true;
    return (
      course.title.toLowerCase().includes(q) ||
      course.subtitle.toLowerCase().includes(q) ||
      course.levelTag.toLowerCase().includes(q) ||
      course.category.toLowerCase().includes(q) ||
      (course.includedCourses ?? []).some((sub) => sub.toLowerCase().includes(q))
    );
  });

  if (sortBy === 'price_asc') {
    return [...filtered].sort((a, b) => a.price - b.price);
  }
  if (sortBy === 'price_desc') {
    return [...filtered].sort((a, b) => b.price - a.price);
  }
  if (sortBy === 'popular') {
    return [...filtered].sort((a, b) => b.enrolledCount - a.enrolledCount);
  }
  return filtered;
}

export function splitCoursesIntoSections(courses: Course[]): {
  combos: Course[];
  regular: Course[];
} {
  const combos: Course[] = [];
  const regular: Course[] = [];
  for (const c of courses) {
    if (c.isCombo) combos.push(c);
    else regular.push(c);
  }
  return { combos, regular };
}

export function calculateOrderTotal(
  items: { unitPrice: number; quantity: number }[],
  deliveryMode: 'home' | 'branch_pickup'
): { subtotal: number; deliveryFee: number; totalAmount: number } {
  const subtotal = items.reduce(
    (sum, item) => sum + Math.max(0, item.unitPrice) * Math.max(1, item.quantity),
    0
  );
  const deliveryFee = subtotal === 0 || deliveryMode === 'branch_pickup' ? 0 : 80;
  return {
    subtotal,
    deliveryFee,
    totalAmount: subtotal + deliveryFee,
  };
}

export function calculateStudentProgress(
  totalLessons: number,
  completedLessonIds: string[]
): number {
  if (totalLessons <= 0) return 0;
  const uniqueCompleted = new Set(completedLessonIds).size;
  return Math.min(100, Math.round((uniqueCompleted / totalLessons) * 100));
}

export function toSafeVideoEmbedUrl(input: string): string {
  const safe = sanitizeSafeUrl(input, '');
  if (!safe) return '';
  try {
    const parsed = new URL(safe);
    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : '';
    }
    if (host.endsWith('youtube.com')) {
      if (parsed.pathname.startsWith('/embed/')) {
        return safe;
      }
      const v = parsed.searchParams.get('v');
      if (v) {
        return `https://www.youtube.com/embed/${encodeURIComponent(v)}`;
      }
      if (parsed.pathname.startsWith('/live/')) {
        const id = parsed.pathname.replace('/live/', '').split('/')[0];
        return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : '';
      }
    }
    return safe;
  } catch {
    return safe;
  }
}

export function filterLessonsByTypeAndBatch(
  lessons: CourseLesson[],
  typeFilter: 'all' | LessonType = 'all',
  batchId = 'all',
  searchQuery = ''
): CourseLesson[] {
  const q = searchQuery.trim().toLowerCase();
  return [...lessons]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .filter((les) => {
      const lesType = les.lessonType ?? 'recorded';
      if (typeFilter !== 'all' && lesType !== typeFilter) return false;
      if (batchId !== 'all' && les.batchId && les.batchId !== batchId) return false;
      if (batchId !== 'all' && !les.batchId && batchId !== 'unassigned') return false;
      if (!q) return true;
      return (
        les.title.toLowerCase().includes(q) ||
        les.moduleName.toLowerCase().includes(q) ||
        (les.batchName ?? '').toLowerCase().includes(q)
      );
    });
}

export function computeBatchSeatUsage(batch: CourseBatch): {
  remainingSeats: number;
  fillPercent: number;
  isFull: boolean;
} {
  const limit = Math.max(1, batch.seatLimit || 1);
  const enrolled = Math.max(0, batch.enrolledSeats || 0);
  const remainingSeats = Math.max(0, limit - enrolled);
  const fillPercent = Math.min(100, Math.round((enrolled / limit) * 100));
  return {
    remainingSeats,
    fillPercent,
    isFull: enrolled >= limit,
  };
}

export interface PlatformStats {
  students: number;
  courses: number;
  teachers: number;
  videos: number;
}

export function computeHomepageStats(
  liveStats: PlatformStats,
  statsCard?: HomepageConfig['statsCard']
): PlatformStats {
  if (statsCard && statsCard.mode === 'custom') {
    return {
      students: Math.max(0, Math.round(statsCard.customValues.students || 0)),
      courses: Math.max(0, Math.round(statsCard.customValues.courses || 0)),
      teachers: Math.max(0, Math.round(statsCard.customValues.teachers || 0)),
      videos: Math.max(0, Math.round(statsCard.customValues.videos || 0)),
    };
  }
  return liveStats;
}

export function computeAverageRating(reviews: { rating: number }[]): string {
  if (!reviews.length) return '5.0';
  const sum = reviews.reduce((acc, r) => acc + Math.min(5, Math.max(1, r.rating || 5)), 0);
  return (sum / reviews.length).toFixed(1);
}

export function reorderListItem<T>(items: T[], index: number, direction: 'up' | 'down'): T[] {
  const targetIdx = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= items.length || targetIdx < 0 || targetIdx >= items.length) {
    return items;
  }
  const copy = [...items];
  const [moved] = copy.splice(index, 1);
  copy.splice(targetIdx, 0, moved);
  return copy;
}

export interface ParsedImageUpload {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  extension: 'png' | 'jpg' | 'webp' | 'gif';
  base64Data: string;
  estimatedBytes: number;
}

const MIME_TO_EXT: Record<string, ParsedImageUpload['extension']> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function parseImageUploadDataUrl(
  dataUrl: string,
  maxBytes = 5 * 1024 * 1024
): { ok: true; value: ParsedImageUpload } | { ok: false; error: string } {
  const trimmed = dataUrl.trim();
  const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      error: 'Invalid image payload. Please upload a PNG, JPG, WEBP, or GIF image.',
    };
  }
  const rawMime = match[1].toLowerCase();
  const extension = MIME_TO_EXT[rawMime];
  if (!extension) {
    return {
      ok: false,
      error: 'Unsupported image format. Allowed formats: PNG, JPG, WEBP, or GIF.',
    };
  }
  const mimeType: ParsedImageUpload['mimeType'] =
    rawMime === 'image/jpg' ? 'image/jpeg' : (rawMime as ParsedImageUpload['mimeType']);
  const base64Data = match[2];
  const padding = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0;
  const estimatedBytes = Math.floor((base64Data.length * 3) / 4) - padding;
  if (estimatedBytes <= 0 || estimatedBytes > maxBytes) {
    return {
      ok: false,
      error: `Image size must be within ${Math.max(1, Math.round(maxBytes / (1024 * 1024)))} MB.`,
    };
  }
  return {
    ok: true,
    value: {
      mimeType,
      extension,
      base64Data,
      estimatedBytes,
    },
  };
}

export function calculateOrderTotalWithCoupon(
  items: { unitPrice: number; quantity: number }[],
  deliveryMode: 'home' | 'branch_pickup',
  coupon?: Coupon | null
): {
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  totalAmount: number;
  appliedCouponCode: string | null;
} {
  const base = calculateOrderTotal(items, deliveryMode);
  let discountAmount = 0;
  let appliedCouponCode: string | null = null;
  if (
    coupon &&
    coupon.active &&
    coupon.discountPercent > 0 &&
    (!coupon.appliesTo || coupon.appliesTo === 'all' || coupon.appliesTo === 'products')
  ) {
    const pct = Math.min(90, Math.max(1, coupon.discountPercent));
    discountAmount = Math.round((base.subtotal * pct) / 100);
    appliedCouponCode = coupon.code.toUpperCase();
  }
  return {
    subtotal: base.subtotal,
    discountAmount,
    deliveryFee: base.deliveryFee,
    totalAmount: Math.max(0, base.subtotal - discountAmount + base.deliveryFee),
    appliedCouponCode,
  };
}

export function parseBulkQuestionBank(
  rawInput: string,
  defaultSubject = 'English Grammar',
  defaultChapter = 'General',
  defaultDifficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium'
): { items: QuestionBankItem[]; errors: string[] } {
  const trimmed = rawInput.trim();
  const items: QuestionBankItem[] = [];
  const errors: string[] = [];
  if (!trimmed) {
    return { items, errors: ['Input cannot be empty.'] };
  }

  const normalizeAnswerIndex = (rawAns: unknown): number => {
    const str = String(rawAns ?? '0').trim().toUpperCase();
    if (str === 'A' || str === '0' || str === '1') {
      if (str === '1' && Number(rawAns) === 1) return 1;
      return str === 'A' || str === '0' ? 0 : 1;
    }
    if (str === 'B') return 1;
    if (str === 'C' || str === '2') return 2;
    if (str === 'D' || str === '3') return 3;
    const num = Number(str);
    return Number.isFinite(num) && num >= 0 && num <= 3 ? Math.floor(num) : 0;
  };

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) {
        return { items, errors: ['JSON input must be an array of question objects.'] };
      }
      parsed.forEach((row, idx) => {
        const prompt = String(row.prompt ?? row.question ?? '').trim();
        const opts = Array.isArray(row.options)
          ? row.options.map((o) => String(o).trim()).filter(Boolean)
          : [];
        if (!prompt || opts.length < 2) {
          errors.push(`JSON item #${idx + 1}: missing prompt or at least 2 options.`);
          return;
        }
        items.push({
          id: `qb-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          subject: String(row.subject ?? defaultSubject).trim() || defaultSubject,
          chapter: String(row.chapter ?? defaultChapter).trim() || defaultChapter,
          difficulty:
            row.difficulty === 'Easy' || row.difficulty === 'Hard' ? row.difficulty : defaultDifficulty,
          type:
            row.type === 'true_false' || row.type === 'written' ? row.type : 'mcq',
          prompt,
          options: opts.slice(0, 4),
          correctIndex: normalizeAnswerIndex(row.correctIndex ?? row.correct),
          explanation: String(row.explanation ?? 'Verified by Question Bank import.').trim(),
          marks: Math.max(1, Number(row.marks) || 1),
          createdAt: new Date().toISOString(),
        });
      });
      return { items, errors };
    } catch {
      return { items, errors: ['Malformed JSON array in bulk question import.'] };
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  lines.forEach((line, idx) => {
    const parts = line.includes('|') ? line.split('|').map((p) => p.trim()) : line.split('\t').map((p) => p.trim());
    if (parts.length < 6) {
      errors.push(
        `Line ${idx + 1}: expected "Question | OptA | OptB | OptC | OptD | CorrectLetter(A-D) | [Explanation] | [Marks]"`
      );
      return;
    }
    const [prompt, optA, optB, optC, optD, correctRaw, explanationRaw, marksRaw] = parts;
    const options = [optA, optB, optC, optD].filter(Boolean);
    if (!prompt || options.length < 2) {
      errors.push(`Line ${idx + 1}: prompt and options cannot be empty.`);
      return;
    }
    const letter = correctRaw.toUpperCase();
    const correctIndex =
      letter === 'A'
        ? 0
        : letter === 'B'
          ? 1
          : letter === 'C'
            ? 2
            : letter === 'D'
              ? 3
              : normalizeAnswerIndex(correctRaw);

    items.push({
      id: `qb-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      subject: defaultSubject,
      chapter: defaultChapter,
      difficulty: defaultDifficulty,
      type: 'mcq',
      prompt,
      options,
      correctIndex: Math.min(options.length - 1, Math.max(0, correctIndex)),
      explanation: explanationRaw || 'Standard curriculum solution.',
      marks: Math.max(1, Number(marksRaw) || 1),
      createdAt: new Date().toISOString(),
    });
  });

  return { items, errors };
}

export function validateScormManifest(xmlContent: string): {
  ok: boolean;
  identifier: string;
  title: string;
  launchFile: string;
  error?: string;
} {
  const xml = xmlContent.trim();
  if (!xml || !/<manifest\b/i.test(xml)) {
    return {
      ok: false,
      identifier: '',
      title: '',
      launchFile: '',
      error: 'Missing <manifest> root element for SCORM 1.2 package.',
    };
  }
  const hasScormVersion =
    /1\.2/.test(xml) || /ADL SCORM/i.test(xml) || /adlcp/i.test(xml);
  if (!hasScormVersion) {
    return {
      ok: false,
      identifier: '',
      title: '',
      launchFile: '',
      error: 'Manifest does not declare SCORM 1.2 schema compatibility.',
    };
  }
  if (!/<organizations\b/i.test(xml) || !/<resources\b/i.test(xml)) {
    return {
      ok: false,
      identifier: '',
      title: '',
      launchFile: '',
      error: 'SCORM 1.2 manifest requires both <organizations> and <resources> nodes.',
    };
  }
  const idMatch = /<manifest[^>]*\bidentifier=["']([^"']+)["']/i.exec(xml);
  const titleMatch = /<title>([^<]+)<\/title>/i.exec(xml);
  const hrefMatch = /<resource[^>]*\bhref=["']([^"']+)["']/i.exec(xml);
  const launchFile = hrefMatch?.[1]?.trim() || 'index.html';

  if (launchFile.includes('..') || /^[a-z]+:/i.test(launchFile)) {
    return {
      ok: false,
      identifier: '',
      title: '',
      launchFile: '',
      error: 'Unsafe launch path inside SCORM 1.2 manifest.',
    };
  }

  return {
    ok: true,
    identifier: idMatch?.[1]?.trim() || `scorm-${Date.now()}`,
    title: titleMatch?.[1]?.trim() || 'Interactive SCORM 1.2 Module',
    launchFile,
  };
}

export function calculateXpAndBadges(input: {
  lessonsCompleted: number;
  examsPassed: number;
  scormCompleted: number;
  attendancePresent: number;
}): { xp: number; level: number; streakDays: number; badges: string[] } {
  const lessons = Math.max(0, input.lessonsCompleted);
  const exams = Math.max(0, input.examsPassed);
  const scorms = Math.max(0, input.scormCompleted);
  const attendance = Math.max(0, input.attendancePresent);

  const xp = lessons * 40 + exams * 120 + scorms * 150 + attendance * 25;
  const level = Math.max(1, Math.floor(xp / 250) + 1);
  const streakDays = Math.min(90, attendance + (scorms > 0 ? 1 : 0));

  const badges: string[] = [];
  if (lessons >= 1) badges.push('First Step Learner');
  if (lessons >= 5) badges.push('Consistent Scholar');
  if (exams >= 1) badges.push('Quiz Challenger');
  if (exams >= 3) badges.push('Merit Topper');
  if (scorms >= 1) badges.push('SCORM 1.2 Achiever');
  if (streakDays >= 5) badges.push('5-Day Streak');

  return { xp, level, streakDays, badges };
}

export function maskLeaderboardName(name: string, showOnLeaderboard = true): string {
  const clean = name.trim() || 'Learner';
  if (showOnLeaderboard) return clean;
  const parts = clean.split(/\s+/);
  return parts
    .map((p) => (p.length <= 2 ? `${p[0]}*` : `${p[0]}${'*'.repeat(Math.min(4, p.length - 2))}${p[p.length - 1]}`))
    .join(' ');
}

export function calculateNetPayroll(
  baseSalary: number,
  allowances: number,
  bonuses: number,
  deductions: number,
  advance: number
): number {
  return Math.max(
    0,
    Math.round((baseSalary || 0) + (allowances || 0) + (bonuses || 0) - (deductions || 0) - (advance || 0))
  );
}

export const DEFAULT_HEADER_MENU: HeaderMenuItem[] = [
  { id: 'menu-home', label: 'Home', path: '/', visible: true },
  { id: 'menu-courses', label: 'Courses', path: '/courses', visible: true },
  { id: 'menu-learn', label: 'Learn', path: '/learn', visible: true },
  { id: 'menu-instructors', label: 'Instructors', path: '/instructors', visible: true },
  { id: 'menu-exams', label: 'Exams', path: '/exams', visible: true },
  { id: 'menu-products', label: 'Products', path: '/products', visible: true },
  { id: 'menu-ebooks', label: 'E-Books', path: '/ebooks', visible: true },
  { id: 'menu-community', label: 'Community', path: '/community', visible: true },
  { id: 'menu-result', label: 'Result', path: '/board-result', visible: true },
];

export function normalizeHeaderMenu(
  items: unknown,
  fallback: HeaderMenuItem[] = DEFAULT_HEADER_MENU
): HeaderMenuItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return fallback.map((m) => ({ ...m }));
  }
  const normalized: HeaderMenuItem[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const raw = items[i] as Partial<HeaderMenuItem> | null;
    if (!raw || typeof raw !== 'object') continue;
    const label = String(raw.label ?? '').trim();
    const safePath = sanitizeSafeUrl(String(raw.path ?? '/'), '');
    if (!label || !safePath) continue;
    const badge = String(raw.badge ?? '').trim().slice(0, 12);
    normalized.push({
      id: String(raw.id ?? `menu-${i + 1}`),
      label: label.slice(0, 40),
      path: safePath,
      badge: badge || undefined,
      visible: raw.visible !== false,
      openInNewTab: Boolean(raw.openInNewTab),
    });
  }
  return normalized.length > 0 ? normalized : fallback.map((m) => ({ ...m }));
}

export function maskSecretValue(raw: string, fallbackMasked = 'Not Configured'): string {
  const clean = String(raw ?? '').trim();
  if (!clean) return fallbackMasked;
  if (clean.includes('••••')) return clean;
  if (clean.length <= 4) return '••••' + clean;
  const prefix = clean.length >= 8 ? clean.slice(0, 4) : '';
  return `${prefix}••••••••${clean.slice(-4)}`;
}

export function filterActivePaymentGateways<T extends { active?: boolean; sortOrder?: number }>(
  gateways: T[] | undefined | null
): T[] {
  if (!Array.isArray(gateways)) return [];
  return [...gateways]
    .filter((g) => g && g.active !== false)
    .sort((a, b) => (Number(a.sortOrder) || 99) - (Number(b.sortOrder) || 99));
}

/* ==================== ENTERPRISE PURE LOGIC & HELPERS ==================== */

import type {
  AttendanceRecord,
  Branch,
  CategoryItem,
  CommunityPost,
  CustomRole,
  DashboardPreset,
  DashboardWidgetDefinition,
  DashboardWidgetLayoutItem,
  Enrollment,
  Order,
  PaymentTransaction,
  StudentFeeInvoice,
} from '../types';

export const PERMISSION_GROUPS: { group: string; permissions: string[] }[] = [
  { group: 'Dashboard & Analytics', permissions: ['dashboard.view', 'dashboard.customize', 'reports.export'] },
  { group: 'Users & RBAC', permissions: ['users.manage', 'roles.manage', 'security.audit'] },
  { group: 'Academics & LMS', permissions: ['courses.manage', 'lessons.manage', 'assignments.manage', 'exams.manage'] },
  { group: 'Branches & Operations', permissions: ['branches.manage', 'attendance.manage', 'certificates.manage'] },
  { group: 'Finance & Payroll', permissions: ['fees.collect', 'finance.manage', 'payroll.manage', 'payments.verify'] },
  { group: 'SaaS, Plugins & AI', permissions: ['plugins.manage', 'saas.manage', 'automation.manage'] },
];

export function hasRolePermission(
  role: UserRole,
  permission: string,
  customRole?: CustomRole | null
): boolean {
  if (role === 'super_admin' || role === 'admin') return true;
  if (customRole && customRole.permissions.includes(permission)) return true;
  const roleDefaults: Record<UserRole, string[]> = {
    super_admin: ['*'],
    admin: ['*'],
    branch_manager: [
      'dashboard.view',
      'dashboard.customize',
      'reports.export',
      'attendance.manage',
      'fees.collect',
      'finance.manage',
      'payroll.manage',
      'payments.verify',
      'certificates.manage',
    ],
    teacher: [
      'dashboard.view',
      'dashboard.customize',
      'courses.manage',
      'lessons.manage',
      'assignments.manage',
      'exams.manage',
      'attendance.manage',
      'certificates.manage',
    ],
    accountant: [
      'dashboard.view',
      'reports.export',
      'fees.collect',
      'finance.manage',
      'payroll.manage',
      'payments.verify',
    ],
    staff: ['dashboard.view', 'attendance.manage', 'fees.collect'],
    student: ['dashboard.view'],
    guardian: ['dashboard.view'],
  };
  return (roleDefaults[role] ?? []).includes(permission);
}

export const CORE_WIDGET_REGISTRY: DashboardWidgetDefinition[] = [
  {
    id: 'w-kpi-metrics',
    title: 'Executive KPI Metrics',
    description: 'Live platform students, revenue, enrollments, and exams overview.',
    category: 'Core',
    defaultSize: 'lg',
    allowedRoles: ['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'guardian', 'accountant', 'staff'],
  },
  {
    id: 'w-quick-actions',
    title: 'Quick Actions Command Bar',
    description: 'One-click shortcuts to create courses, collect fees, grade assignments, or export reports.',
    category: 'Operations',
    defaultSize: 'md',
    allowedRoles: ['super_admin', 'admin', 'branch_manager', 'teacher', 'accountant', 'staff'],
  },
  {
    id: 'w-revenue-analytics',
    title: 'Revenue, Enrollment & Attendance Analytics',
    description: 'Visual breakdown of revenue channels, monthly enrollments, and attendance rates.',
    category: 'Analytics',
    defaultSize: 'lg',
    allowedRoles: ['super_admin', 'admin', 'branch_manager', 'accountant'],
  },
  {
    id: 'w-system-health',
    title: 'System Health & Security Monitor',
    description: 'Database integrity, active payment gateways, scheduled jobs, and backup status.',
    category: 'Core',
    defaultSize: 'md',
    allowedRoles: ['super_admin', 'admin'],
  },
  {
    id: 'w-teaching-queue',
    title: 'Teaching & Grading Queue',
    description: 'Pending assignment grading, speaking pronunciation reviews, and manual written exams.',
    category: 'Teaching',
    defaultSize: 'md',
    allowedRoles: ['super_admin', 'admin', 'teacher'],
  },
  {
    id: 'w-activity-logs',
    title: 'Recent Activity & Audit Feed',
    description: 'Real-time log of user actions, payments, and configuration updates.',
    category: 'Operations',
    defaultSize: 'md',
    allowedRoles: ['super_admin', 'admin', 'branch_manager'],
  },
  {
    id: 'w-finance-ledger',
    title: 'Fee Collection & Cash Position',
    description: 'Admission/batch fee dues, partial installments, and net income vs expenses.',
    category: 'Finance',
    defaultSize: 'md',
    allowedRoles: ['super_admin', 'admin', 'branch_manager', 'accountant'],
  },
  {
    id: 'w-commerce-pulse',
    title: 'E-Books, Store & Branch Status',
    description: 'Paid e-book sales, low-stock book alerts, active branches, and catalog overview.',
    category: 'Operations',
    defaultSize: 'md',
    allowedRoles: ['super_admin', 'admin', 'branch_manager', 'accountant'],
  },
];

export function buildWidgetRegistryWithPlugins(
  activePlugins: { id: string; name: string; category: string; active: boolean }[]
): DashboardWidgetDefinition[] {
  const pluginWidgets: DashboardWidgetDefinition[] = activePlugins
    .filter((p) => p.active)
    .map((p) => ({
      id: `plugin-widget-${p.id}`,
      title: `${p.name} Widget`,
      description: `Live telemetry and status widget registered by plugin ${p.name} (${p.category}).`,
      category: 'Plugin',
      pluginId: p.id,
      defaultSize: 'sm',
      allowedRoles: ['super_admin', 'admin', 'branch_manager', 'teacher'],
    }));
  return [...CORE_WIDGET_REGISTRY, ...pluginWidgets];
}

export function applyDashboardPreset(
  preset: DashboardPreset,
  role: UserRole,
  registry: DashboardWidgetDefinition[] = CORE_WIDGET_REGISTRY
): DashboardWidgetLayoutItem[] {
  const eligible = registry.filter((w) => w.allowedRoles.includes(role));
  const presetPriority: Record<DashboardPreset, string[]> = {
    executive: [
      'w-kpi-metrics',
      'w-revenue-analytics',
      'w-commerce-pulse',
      'w-system-health',
      'w-quick-actions',
      'w-activity-logs',
    ],
    operations: [
      'w-quick-actions',
      'w-commerce-pulse',
      'w-kpi-metrics',
      'w-activity-logs',
      'w-system-health',
      'w-finance-ledger',
    ],
    teaching: ['w-teaching-queue', 'w-kpi-metrics', 'w-quick-actions', 'w-activity-logs'],
    finance: ['w-finance-ledger', 'w-revenue-analytics', 'w-commerce-pulse', 'w-kpi-metrics', 'w-quick-actions'],
  };
  const priority = presetPriority[preset] ?? presetPriority.executive;
  const sorted = [...eligible].sort((a, b) => {
    const idxA = priority.indexOf(a.id);
    const idxB = priority.indexOf(b.id);
    const rankA = idxA === -1 ? 99 : idxA;
    const rankB = idxB === -1 ? 99 : idxB;
    return rankA - rankB;
  });

  return sorted.map((w, index) => ({
    widgetId: w.id,
    visible: preset === 'executive' ? true : priority.includes(w.id) || w.category === 'Plugin',
    size: w.defaultSize,
    order: index,
  }));
}

export function reorderDashboardWidgets(
  items: DashboardWidgetLayoutItem[],
  sourceId: string,
  targetId: string
): DashboardWidgetLayoutItem[] {
  if (sourceId === targetId) return items;
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const srcIdx = sorted.findIndex((i) => i.widgetId === sourceId);
  const tgtIdx = sorted.findIndex((i) => i.widgetId === targetId);
  if (srcIdx === -1 || tgtIdx === -1) return items;
  const [moved] = sorted.splice(srcIdx, 1);
  sorted.splice(tgtIdx, 0, moved);
  return sorted.map((item, idx) => ({ ...item, order: idx }));
}

export function evaluateAssignmentSubmissionStatus(
  dueDateIso: string,
  submittedAtIso: string,
  allowLateSubmission: boolean
): { allowed: boolean; status: 'submitted' | 'late'; error?: string } {
  const dueMs = Date.parse(dueDateIso);
  const subMs = Date.parse(submittedAtIso);
  if (!Number.isFinite(dueMs) || !Number.isFinite(subMs)) {
    return { allowed: true, status: 'submitted' };
  }
  const isLate = subMs > dueMs;
  if (isLate && !allowLateSubmission) {
    return {
      allowed: false,
      status: 'late',
      error: 'Submission deadline has passed and late submissions are closed for this assignment.',
    };
  }
  return { allowed: true, status: isLate ? 'late' : 'submitted' };
}

export function computeFeeInvoiceTotals(invoice: Pick<
  StudentFeeInvoice,
  'grossAmount' | 'discountAmount' | 'scholarshipAmount' | 'lateFee' | 'paidAmount' | 'dueDate'
>, nowIso = new Date().toISOString()): {
  netPayable: number;
  dueAmount: number;
  advanceAmount: number;
  computedStatus: StudentFeeInvoice['status'];
} {
  const netPayable = Math.max(
    0,
    Math.round(
      (invoice.grossAmount || 0) -
        (invoice.discountAmount || 0) -
        (invoice.scholarshipAmount || 0) +
        (invoice.lateFee || 0)
    )
  );
  const paid = Math.max(0, Math.round(invoice.paidAmount || 0));
  const dueAmount = Math.max(0, netPayable - paid);
  const advanceAmount = Math.max(0, paid - netPayable);

  let computedStatus: StudentFeeInvoice['status'] = 'due';
  if (dueAmount === 0) computedStatus = 'paid';
  else if (paid > 0) computedStatus = 'partial';
  else if (Date.parse(nowIso) > Date.parse(invoice.dueDate)) computedStatus = 'overdue';

  return { netPayable, dueAmount, advanceAmount, computedStatus };
}

export function computeFeeLedgerSummary(invoices: StudentFeeInvoice[]): {
  totalBilled: number;
  totalCollected: number;
  totalDue: number;
  totalAdvance: number;
  totalScholarship: number;
} {
  return invoices.reduce(
    (acc, inv) => {
      const calc = computeFeeInvoiceTotals(inv);
      acc.totalBilled += calc.netPayable;
      acc.totalCollected += Math.max(0, inv.paidAmount || 0);
      acc.totalDue += calc.dueAmount;
      acc.totalAdvance += calc.advanceAmount;
      acc.totalScholarship += Math.max(0, inv.scholarshipAmount || 0);
      return acc;
    },
    { totalBilled: 0, totalCollected: 0, totalDue: 0, totalAdvance: 0, totalScholarship: 0 }
  );
}

export function isLessonDripUnlocked(
  enrolledAtIso: string | undefined,
  dripDays = 0,
  nowIso = new Date().toISOString()
): { unlocked: boolean; unlockDateIso?: string; daysRemaining: number } {
  const safeDrip = Math.max(0, Math.floor(Number(dripDays) || 0));
  if (safeDrip === 0) {
    return { unlocked: true, daysRemaining: 0 };
  }
  const baseMs = enrolledAtIso ? Date.parse(enrolledAtIso) : Date.now();
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(baseMs) || !Number.isFinite(nowMs)) {
    return { unlocked: true, daysRemaining: 0 };
  }
  const unlockMs = baseMs + safeDrip * 24 * 60 * 60 * 1000;
  const diffMs = unlockMs - nowMs;
  if (diffMs <= 0) {
    return { unlocked: true, unlockDateIso: new Date(unlockMs).toISOString(), daysRemaining: 0 };
  }
  return {
    unlocked: false,
    unlockDateIso: new Date(unlockMs).toISOString(),
    daysRemaining: Math.ceil(diffMs / (24 * 60 * 60 * 1000)),
  };
}

export function validatePluginDependencies(
  plugins: { id: string; name: string; active: boolean; dependencies?: string[] }[],
  targetId: string,
  nextActive: boolean
): { ok: boolean; error?: string } {
  const target = plugins.find((p) => p.id === targetId);
  if (!target) return { ok: false, error: 'Plugin not found.' };
  if (nextActive) {
    const missing = (target.dependencies ?? []).filter((depId) => {
      const dep = plugins.find((p) => p.id === depId);
      return !dep || !dep.active;
    });
    if (missing.length > 0) {
      return {
        ok: false,
        error: `Cannot activate "${target.name}". Required active dependencies: ${missing.join(', ')}.`,
      };
    }
  } else {
    const dependents = plugins.filter(
      (p) => p.id !== targetId && p.active && (p.dependencies ?? []).includes(targetId)
    );
    if (dependents.length > 0) {
      return {
        ok: false,
        error: `Cannot deactivate "${target.name}" while dependent plugins are active: ${dependents.map((d) => d.name).join(', ')}.`,
      };
    }
  }
  return { ok: true };
}

export function computeAttendanceSummary(records: AttendanceRecord[]): {
  total: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  attendanceRate: number;
} {
  const total = records.length;
  const present = records.filter((r) => r.status === 'present').length;
  const late = records.filter((r) => r.status === 'late').length;
  const absent = records.filter((r) => r.status === 'absent').length;
  const leave = records.filter((r) => r.status === 'leave').length;
  const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
  return { total, present, late, absent, leave, attendanceRate };
}

export function generateCertificateNumber(year: number, sequence: number): string {
  return `AEC-CERT-${year}-${String(Math.max(1, sequence)).padStart(4, '0')}`;
}

export function calculateReferralReward(amountPaid: number, rewardPercent = 10): number {
  const safeAmount = Math.max(0, Number(amountPaid) || 0);
  const safePct = Math.min(50, Math.max(0, Number(rewardPercent) || 0));
  return Math.round((safeAmount * safePct) / 100);
}

export function buildCsvExport(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const escapeCell = (val: string | number | boolean | null | undefined): string => {
    const raw = val === null || val === undefined ? '' : String(val);
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    if (/[",\n\r]/.test(safe)) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  };
  return [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
}

export const DEFAULT_COURSE_CATEGORIES = [
  'HSC English',
  'SSC English',
  'IELTS & Spoken',
  'Grammar Pro',
  'Admission',
  'Combo Packs',
] as const;

export function filterActiveBranches(branches: Branch[] | undefined | null): Branch[] {
  if (!Array.isArray(branches)) return [];
  return branches.filter((b) => b && b.status === 'active');
}

export function isBranchActive(
  branches: Branch[] | undefined | null,
  branchId: string | null | undefined
): boolean {
  if (!branchId || !Array.isArray(branches)) return false;
  const found = branches.find((b) => b.id === branchId);
  return Boolean(found && found.status === 'active');
}

export function canClaimEbookFree(ebook: { isFree: boolean; price: number }): boolean {
  return Boolean(ebook.isFree) || Math.max(0, Number(ebook.price) || 0) <= 0;
}

export function mergeCourseCategories(
  categoryItems: Pick<CategoryItem, 'name' | 'type' | 'active'>[] | undefined | null,
  defaults: readonly string[] = DEFAULT_COURSE_CATEGORIES
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of defaults) {
    const clean = String(name ?? '').trim();
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      result.push(clean);
    }
  }
  if (Array.isArray(categoryItems)) {
    for (const item of categoryItems) {
      if (item.type !== 'course' || item.active === false) continue;
      const clean = String(item.name ?? '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        result.push(clean);
      }
    }
  }
  return result;
}

export function buildCourseDraftFromPost(
  post: Pick<CommunityPost, 'id' | 'title' | 'category' | 'content' | 'image'>,
  branches: Branch[] = [],
  overrides?: {
    title?: string;
    category?: string;
    price?: number;
    originalPrice?: number;
    levelTag?: string;
    duration?: string;
    status?: 'active' | 'draft';
  }
) {
  const cleanTitle = String(overrides?.title ?? post.title).trim() || 'New Course';
  const baseSlug = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  const activeBranches = filterActiveBranches(branches);
  const price = Math.max(0, Math.round(Number(overrides?.price ?? 2500)));
  const originalPrice = Math.max(price, Math.round(Number(overrides?.originalPrice ?? Math.round(price * 1.35))));
  const cleanContent = String(post.content ?? '').trim();
  const sentences = cleanContent
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
    .slice(0, 4);

  return {
    title: cleanTitle,
    slug: baseSlug || `course-${post.id}`,
    subtitle: cleanContent.slice(0, 120) || 'Structured course program converted from featured study post.',
    category: String(overrides?.category ?? post.category ?? 'HSC English').trim() || 'HSC English',
    levelTag: String(overrides?.levelTag ?? 'Featured Course').trim(),
    duration: String(overrides?.duration ?? '3 Months · 36 Live Classes').trim(),
    isCombo: false,
    price,
    originalPrice,
    examSystemIncluded: true,
    branchIds: activeBranches.map((b) => b.id),
    instructorIds: ['ins-1'],
    thumbnail: post.image || '/src/assets/images/hero_hsc_english_1795411661478.jpg',
    description: cleanContent || cleanTitle,
    highlights:
      sentences.length > 0
        ? sentences
        : ['Topic mastery based on curated guide', 'Live practice & model tests', 'Downloadable PDF lecture notes'],
    demoVideoTitle: `${cleanTitle} — Orientation`,
    demoYoutubeUrl: 'https://www.youtube.com/embed/M7lc1UVf-VE',
    status: overrides?.status === 'draft' ? ('draft' as const) : ('active' as const),
    sourcePostId: post.id,
  };
}

export interface MonthlyAnalyticsPoint {
  monthKey: string;
  label: string;
  revenue: number;
  enrollments: number;
  orders: number;
}

export function buildMonthlyRevenueSeries(
  transactions: Pick<PaymentTransaction, 'totalAmount' | 'status' | 'createdAt'>[],
  enrollments: Pick<Enrollment, 'amountPaid' | 'status' | 'enrolledAt'>[],
  orders: Pick<Order, 'totalAmount' | 'status' | 'createdAt'>[],
  monthsCount = 6
): MonthlyAnalyticsPoint[] {
  const buckets = new Map<string, { revenue: number; enrollments: number; orders: number }>();

  const ensureBucket = (ym: string) => {
    let b = buckets.get(ym);
    if (!b) {
      b = { revenue: 0, enrollments: 0, orders: 0 };
      buckets.set(ym, b);
    }
    return b;
  };

  for (const tx of transactions) {
    if (tx.status === 'refunded') continue;
    const ym = String(tx.createdAt ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    ensureBucket(ym).revenue += Math.max(0, Number(tx.totalAmount) || 0);
  }

  // Fallback if transactions empty: credit approved enrollments directly
  if (transactions.length === 0) {
    for (const enr of enrollments) {
      if (enr.status === 'rejected') continue;
      const ym = String(enr.enrolledAt ?? '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(ym)) continue;
      ensureBucket(ym).revenue += Math.max(0, Number(enr.amountPaid) || 0);
    }
  }

  for (const enr of enrollments) {
    if (enr.status === 'rejected') continue;
    const ym = String(enr.enrolledAt ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    ensureBucket(ym).enrollments += 1;
  }

  for (const ord of orders) {
    if (ord.status === 'cancelled') continue;
    const ym = String(ord.createdAt ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    ensureBucket(ym).orders += 1;
  }

  // Ensure current month exists, and pad with recent trailing months only up to monthsCount
  // so historical active months (e.g., seeded Q1 data) remain visible alongside live current-month activity.
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  ensureBucket(currentYm);

  for (let i = 1; i < monthsCount && buckets.size < monthsCount; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    ensureBucket(ym);
  }

  const sortedKeys = Array.from(buckets.keys()).sort().slice(-monthsCount);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return sortedKeys.map((ym) => {
    const [yr, mo] = ym.split('-');
    const monthIdx = Math.max(0, Math.min(11, Number(mo) - 1));
    const entry = buckets.get(ym)!;
    return {
      monthKey: ym,
      label: `${monthNames[monthIdx]} '${yr.slice(2)}`,
      revenue: entry.revenue,
      enrollments: entry.enrollments,
      orders: entry.orders,
    };
  });
}





