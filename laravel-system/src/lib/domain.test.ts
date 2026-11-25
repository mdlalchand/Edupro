import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDashboardPreset,
  buildCsvExport,
  buildWidgetRegistryWithPlugins,
  calculateDiscountedPrice,
  calculateNetPayroll,
  calculateOrderTotal,
  calculateOrderTotalWithCoupon,
  calculateReferralReward,
  calculateStudentProgress,
  calculateXpAndBadges,
  canRoleAccessPortalSection,
  computeAttendanceSummary,
  computeAverageRating,
  computeBatchSeatUsage,
  computeFeeInvoiceTotals,
  computeFeeLedgerSummary,
  computeHomepageStats,
  evaluateAssignmentSubmissionStatus,
  filterActivePaymentGateways,
  filterCourses,
  filterLessonsByTypeAndBatch,
  generateCertificateNumber,
  gradeExamSubmission,
  hasRolePermission,
  isLessonDripUnlocked,
  maskLeaderboardName,
  maskSecretValue,
  normalizeHeaderMenu,
  parseBulkQuestionBank,
  parseImageUploadDataUrl,
  reorderDashboardWidgets,
  reorderListItem,
  sanitizeSafeUrl,
  splitCoursesIntoSections,
  toSafeVideoEmbedUrl,
  validatePluginDependencies,
  validateScormManifest,
  filterActiveBranches,
  isBranchActive,
  canClaimEbookFree,
  mergeCourseCategories,
  buildCourseDraftFromPost,
  buildMonthlyRevenueSeries,
} from './domain';
import type { Branch, Course, CourseBatch, CourseLesson, ExamQuestion, HomepageConfig, StudentFeeInvoice } from '../types';

test('calculateDiscountedPrice computes base discount and valid active coupon', () => {
  const res = calculateDiscountedPrice(3000, 5000, {
    code: 'AEC20',
    discountPercent: 20,
    active: true,
    description: '20% off',
  });
  assert.equal(res.baseDiscountPercent, 40);
  assert.equal(res.couponDiscountAmount, 600);
  assert.equal(res.finalPrice, 2400);
  assert.equal(res.appliedCouponCode, 'AEC20');
});

test('calculateDiscountedPrice ignores inactive coupon', () => {
  const res = calculateDiscountedPrice(2000, 2500, {
    code: 'EXPIRED',
    discountPercent: 50,
    active: false,
    description: 'Expired',
  });
  assert.equal(res.couponDiscountAmount, 0);
  assert.equal(res.finalPrice, 2000);
  assert.equal(res.appliedCouponCode, null);
});

test('gradeExamSubmission scores answers accurately and assigns letter grades', () => {
  const questions: ExamQuestion[] = [
    {
      id: 'q1',
      prompt: 'Choose the correct tense',
      options: ['go', 'went', 'gone', 'going'],
      correctIndex: 1,
      explanation: 'Past tense',
      marks: 2,
    },
    {
      id: 'q2',
      prompt: 'Choose article',
      options: ['a', 'an', 'the', 'none'],
      correctIndex: 1,
      explanation: 'Vowel sound',
      marks: 2,
    },
  ];

  const passRes = gradeExamSubmission(questions, { q1: 1, q2: 1 }, 40);
  assert.equal(passRes.score, 4);
  assert.equal(passRes.totalMarks, 4);
  assert.equal(passRes.percentage, 100);
  assert.equal(passRes.grade, 'A+');
  assert.equal(passRes.passed, true);

  const partialRes = gradeExamSubmission(questions, { q1: 1, q2: 0 }, 60);
  assert.equal(partialRes.score, 2);
  assert.equal(partialRes.percentage, 50);
  assert.equal(partialRes.grade, 'B');
  assert.equal(partialRes.passed, false);
});

test('canRoleAccessPortalSection enforces strict multi-role RBAC boundaries', () => {
  assert.equal(canRoleAccessPortalSection('admin', 'settings'), true);
  assert.equal(canRoleAccessPortalSection('admin', 'users'), true);
  assert.equal(canRoleAccessPortalSection('branch_manager', 'enrollments'), true);
  assert.equal(canRoleAccessPortalSection('branch_manager', 'settings'), false);
  assert.equal(canRoleAccessPortalSection('teacher', 'exams'), true);
  assert.equal(canRoleAccessPortalSection('teacher', 'branches'), false);
  assert.equal(canRoleAccessPortalSection('student', 'my_learning'), true);
  assert.equal(canRoleAccessPortalSection('student', 'users'), false);
  assert.equal(canRoleAccessPortalSection('guardian', 'guardian_monitor'), true);
  assert.equal(canRoleAccessPortalSection('guardian', 'exams'), false);
});

test('filterCourses filters active courses by category, combo flag, levelTag, drafts, and sort', () => {
  const sample: Course[] = [
    {
      id: '1',
      slug: 'hsc-eng',
      title: 'HSC English Mastery',
      subtitle: 'Grammar & First Paper',
      category: 'HSC English',
      levelTag: 'HSC 27',
      isCombo: false,
      price: 1990,
      originalPrice: 3000,
      enrolledCount: 500,
      examSystemIncluded: true,
      branchIds: ['b1'],
      instructorIds: ['i1'],
      thumbnail: '',
      description: '',
      highlights: [],
      demoVideoTitle: '',
      demoYoutubeUrl: '',
      status: 'active',
    },
    {
      id: '2',
      slug: 'combo-all',
      title: 'SSC + Spoken Combo',
      subtitle: 'All-in-one bundle',
      category: 'Combo Packs',
      levelTag: 'SSC 27',
      isCombo: true,
      price: 2990,
      originalPrice: 4500,
      enrolledCount: 800,
      examSystemIncluded: true,
      branchIds: ['b1'],
      instructorIds: ['i1'],
      thumbnail: '',
      description: '',
      highlights: [],
      demoVideoTitle: '',
      demoYoutubeUrl: '',
      status: 'active',
    },
    {
      id: '3',
      slug: 'draft-course',
      title: 'Upcoming IELTS Batch',
      subtitle: 'Draft batch',
      category: 'IELTS & Spoken',
      levelTag: 'IELTS',
      isCombo: false,
      price: 990,
      originalPrice: 1500,
      enrolledCount: 10,
      examSystemIncluded: true,
      branchIds: ['b1'],
      instructorIds: ['i1'],
      thumbnail: '',
      description: '',
      highlights: [],
      demoVideoTitle: '',
      demoYoutubeUrl: '',
      status: 'draft',
    },
  ];

  assert.equal(filterCourses(sample, 'All Courses').length, 2);
  assert.equal(filterCourses(sample, 'All Courses', '', { includeDrafts: true }).length, 3);
  assert.equal(filterCourses(sample, 'HSC English').length, 1);
  assert.equal(filterCourses(sample, 'HSC 27').length, 1);
  assert.equal(filterCourses(sample, 'Combos').length, 1);
  assert.equal(filterCourses(sample, 'All Courses', 'spoken').length, 1);
  const asc = filterCourses(sample, 'All Courses', '', { sortBy: 'price_asc' });
  assert.equal(asc[0].id, '1');
  const pop = filterCourses(sample, 'All Courses', '', { sortBy: 'popular' });
  assert.equal(pop[0].id, '2');

  const split = splitCoursesIntoSections(sample.slice(0, 2));
  assert.equal(split.combos.length, 1);
  assert.equal(split.regular.length, 1);
});

test('sanitizeSafeUrl blocks dangerous schemes and permits http/https/relative paths', () => {
  assert.equal(sanitizeSafeUrl('javascript:alert(1)', '/fallback.jpg'), '/fallback.jpg');
  assert.equal(sanitizeSafeUrl('data:text/html,<script>', '/fallback.jpg'), '/fallback.jpg');
  assert.equal(sanitizeSafeUrl('/src/assets/images/hero.jpg', '/fallback.jpg'), '/src/assets/images/hero.jpg');
  assert.equal(sanitizeSafeUrl('https://youtube.com/watch?v=123', ''), 'https://youtube.com/watch?v=123');
});

test('calculateOrderTotal waives delivery fee on branch pickup', () => {
  const home = calculateOrderTotal([{ unitPrice: 799, quantity: 2 }], 'home');
  assert.equal(home.subtotal, 1598);
  assert.equal(home.deliveryFee, 80);
  assert.equal(home.totalAmount, 1678);

  const pickup = calculateOrderTotal([{ unitPrice: 799, quantity: 2 }], 'branch_pickup');
  assert.equal(pickup.deliveryFee, 0);
  assert.equal(pickup.totalAmount, 1598);
});

test('calculateStudentProgress caps at 100 and handles 0 lessons', () => {
  assert.equal(calculateStudentProgress(0, ['l1']), 0);
  assert.equal(calculateStudentProgress(4, ['l1', 'l1', 'l2']), 50);
  assert.equal(calculateStudentProgress(2, ['l1', 'l2', 'l3']), 100);
});

test('toSafeVideoEmbedUrl converts YouTube links and blocks unsafe schemes', () => {
  assert.equal(
    toSafeVideoEmbedUrl('https://www.youtube.com/watch?v=abc123XYZ'),
    'https://www.youtube.com/embed/abc123XYZ'
  );
  assert.equal(
    toSafeVideoEmbedUrl('https://youtu.be/xyz987'),
    'https://www.youtube.com/embed/xyz987'
  );
  assert.equal(toSafeVideoEmbedUrl('javascript:alert(1)'), '');
});

test('filterLessonsByTypeAndBatch filters recorded, live, and sheet items sorted by orderIndex', () => {
  const lessons: CourseLesson[] = [
    {
      id: 'l2',
      courseId: 'c1',
      batchId: 'b1',
      batchName: 'Batch A',
      lessonType: 'live',
      title: 'Live Doubt Solving',
      moduleName: 'Live',
      duration: '60:00',
      videoPreviewTitle: 'Live Doubt Solving',
      videoUrl: '',
      liveJoinUrl: 'https://meet.google.com/abc',
      liveStatus: 'live_now',
      sheetSummary: 'Live Q&A',
      isFreePreview: false,
      orderIndex: 2,
    },
    {
      id: 'l1',
      courseId: 'c1',
      batchId: 'b1',
      batchName: 'Batch A',
      lessonType: 'recorded',
      title: 'Right Form of Verbs',
      moduleName: 'Module 1',
      duration: '40:00',
      videoPreviewTitle: 'Right Form of Verbs',
      videoUrl: 'https://www.youtube.com/embed/abc',
      sheetSummary: 'Recorded video',
      isFreePreview: true,
      orderIndex: 1,
    },
  ];

  const all = filterLessonsByTypeAndBatch(lessons, 'all', 'b1');
  assert.equal(all.length, 2);
  assert.equal(all[0].id, 'l1');
  assert.equal(filterLessonsByTypeAndBatch(lessons, 'live').length, 1);
  assert.equal(filterLessonsByTypeAndBatch(lessons, 'recorded').length, 1);
});

test('computeBatchSeatUsage computes remaining seats and fill percentage accurately', () => {
  const batch: CourseBatch = {
    id: 'b1',
    courseId: 'c1',
    name: 'Mirpur Batch A',
    code: 'MPR-A',
    branchId: 'br-mirpur',
    instructorId: 'inst-1',
    schedule: 'Sun-Tue-Thu 4:00 PM',
    startDate: '2026-04-01',
    seatLimit: 50,
    enrolledSeats: 40,
    mode: 'Hybrid',
    status: 'open',
  };
  const usage = computeBatchSeatUsage(batch);
  assert.equal(usage.remainingSeats, 10);
  assert.equal(usage.fillPercent, 80);
  assert.equal(usage.isFull, false);
});

test('canRoleAccessPortalSection restricts homepage_cms strictly to admin', () => {
  assert.equal(canRoleAccessPortalSection('admin', 'homepage_cms'), true);
  assert.equal(canRoleAccessPortalSection('teacher', 'homepage_cms'), false);
  assert.equal(canRoleAccessPortalSection('branch_manager', 'homepage_cms'), false);
  assert.equal(canRoleAccessPortalSection('student', 'homepage_cms'), false);
  assert.equal(canRoleAccessPortalSection('guardian', 'homepage_cms'), false);
});

test('computeHomepageStats respects auto vs custom mode cleanly', () => {
  const live = { students: 2450, courses: 6, teachers: 4, videos: 1320 };
  const autoStats = computeHomepageStats(live, {
    mode: 'auto',
    badge: 'Trusted',
    title: 'Stats',
    subtitle: 'Sub',
    ctaText: 'Go',
    ctaLink: '/courses',
    customValues: { students: 500000, courses: 90, teachers: 45, videos: 8200 },
    labels: { students: 'Students', courses: 'Courses', teachers: 'Teachers', videos: 'Videos' },
  });
  assert.deepEqual(autoStats, live);

  const customCfg: HomepageConfig['statsCard'] = {
    mode: 'custom',
    badge: 'Trusted',
    title: 'Stats',
    subtitle: 'Sub',
    ctaText: 'Go',
    ctaLink: '/courses',
    customValues: { students: 500000, courses: 90, teachers: 45, videos: 8200 },
    labels: { students: 'Students', courses: 'Courses', teachers: 'Teachers', videos: 'Videos' },
  };
  const customStats = computeHomepageStats(live, customCfg);
  assert.deepEqual(customStats, { students: 500000, courses: 90, teachers: 45, videos: 8200 });
});

test('computeAverageRating and reorderListItem operate deterministically', () => {
  assert.equal(computeAverageRating([]), '5.0');
  assert.equal(computeAverageRating([{ rating: 5 }, { rating: 4 }]), '4.5');

  const reordered = reorderListItem(['a', 'b', 'c'], 1, 'up');
  assert.deepEqual(reordered, ['b', 'a', 'c']);
  assert.deepEqual(reorderListItem(['a', 'b', 'c'], 0, 'up'), ['a', 'b', 'c']);
});

test('parseImageUploadDataUrl validates MIME types, rejects SVG, and checks size limits', () => {
  const validPng = parseImageUploadDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
  assert.equal(validPng.ok, true);
  if (validPng.ok) {
    assert.equal(validPng.value.extension, 'png');
    assert.equal(validPng.value.mimeType, 'image/png');
    assert.ok(validPng.value.estimatedBytes > 0);
  }

  const svgRejected = parseImageUploadDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
  assert.equal(svgRejected.ok, false);

  const tooLarge = parseImageUploadDataUrl('data:image/jpeg;base64,AAAA', 2);
  assert.equal(tooLarge.ok, false);
});

test('parseBulkQuestionBank parses pipe-delimited and JSON questions cleanly', () => {
  const pipeRes = parseBulkQuestionBank(
    'He ___ to Dhaka yesterday. | go | went | gone | going | B | Past indefinite | 2\nShe is ___ honest girl. | a | an | the | none | B',
    'HSC English 2nd Paper',
    'Right Form of Verbs',
    'Hard'
  );
  assert.equal(pipeRes.errors.length, 0);
  assert.equal(pipeRes.items.length, 2);
  assert.equal(pipeRes.items[0].correctIndex, 1);
  assert.equal(pipeRes.items[0].marks, 2);
  assert.equal(pipeRes.items[0].subject, 'HSC English 2nd Paper');
  assert.equal(pipeRes.items[1].correctIndex, 1);
});

test('validateScormManifest validates SCORM 1.2 XML and blocks path traversal', () => {
  const validXml = `<manifest identifier="AEC-SCORM-1"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations><organization><title>Tense Interactive</title></organization></organizations><resources><resource href="index.html" /></resources></manifest>`;
  const res = validateScormManifest(validXml);
  assert.equal(res.ok, true);
  assert.equal(res.identifier, 'AEC-SCORM-1');
  assert.equal(res.launchFile, 'index.html');

  const badPath = `<manifest identifier="BAD"><metadata><schemaversion>1.2</schemaversion></metadata><organizations></organizations><resources><resource href="../../etc/passwd" /></resources></manifest>`;
  assert.equal(validateScormManifest(badPath).ok, false);
});

test('calculateXpAndBadges, maskLeaderboardName, coupon cart total, and payroll work deterministically', () => {
  const rewards = calculateXpAndBadges({
    lessonsCompleted: 5,
    examsPassed: 2,
    scormCompleted: 1,
    attendancePresent: 5,
  });
  assert.equal(rewards.xp, 5 * 40 + 2 * 120 + 150 + 5 * 25);
  assert.ok(rewards.badges.includes('SCORM 1.2 Achiever'));
  assert.ok(rewards.badges.includes('5-Day Streak'));

  assert.equal(maskLeaderboardName('Rafiul Islam', true), 'Rafiul Islam');
  assert.equal(maskLeaderboardName('Rafiul Islam', false), 'R****l I***m');

  const cart = calculateOrderTotalWithCoupon(
    [{ unitPrice: 1000, quantity: 1 }],
    'home',
    { code: 'AEC20', discountPercent: 20, active: true, appliesTo: 'all', description: '20% off' }
  );
  assert.equal(cart.discountAmount, 200);
  assert.equal(cart.totalAmount, 880);

  assert.equal(calculateNetPayroll(25000, 3000, 2000, 500, 1000), 28500);
});

test('normalizeHeaderMenu sanitizes unsafe paths and falls back when empty', () => {
  const cleaned = normalizeHeaderMenu([
    { id: 'm1', label: '  Scholarship FAQ  ', path: '/page/faq', badge: 'New', visible: true },
    { id: 'm2', label: 'Bad JS', path: 'javascript:alert(1)', visible: true },
    { id: 'm3', label: 'Hidden Link', path: '/courses', visible: false, openInNewTab: true },
  ]);
  assert.equal(cleaned.length, 2);
  assert.equal(cleaned[0].label, 'Scholarship FAQ');
  assert.equal(cleaned[0].badge, 'New');
  assert.equal(cleaned[1].visible, false);
  assert.equal(cleaned[1].openInNewTab, true);

  const fallback = normalizeHeaderMenu([]);
  assert.ok(fallback.length >= 8);
  assert.equal(fallback[0].path, '/');
});

test('maskSecretValue, filterActivePaymentGateways, and payments portal RBAC work accurately', () => {
  assert.equal(maskSecretValue(''), 'Not Configured');
  assert.equal(maskSecretValue('sk_live_9876543210'), 'sk_l••••••••3210');
  assert.equal(maskSecretValue('bkash_••••4321'), 'bkash_••••4321');

  const filtered = filterActivePaymentGateways([
    { id: 'pg-2', active: true, sortOrder: 2 },
    { id: 'pg-off', active: false, sortOrder: 1 },
    { id: 'pg-1', active: true, sortOrder: 1 },
  ]);
  assert.deepEqual(
    filtered.map((g) => g.id),
    ['pg-1', 'pg-2']
  );

  assert.equal(canRoleAccessPortalSection('admin', 'payments'), true);
  assert.equal(canRoleAccessPortalSection('branch_manager', 'payments'), true);
  assert.equal(canRoleAccessPortalSection('student', 'payments'), false);
  assert.equal(canRoleAccessPortalSection('teacher', 'payments'), false);
});

test('8-role RBAC matrix and custom role permissions enforce strict boundaries', () => {
  assert.equal(canRoleAccessPortalSection('super_admin', 'saas_automation'), true);
  assert.equal(canRoleAccessPortalSection('accountant', 'fees_ledger'), true);
  assert.equal(canRoleAccessPortalSection('accountant', 'courses'), false);
  assert.equal(canRoleAccessPortalSection('staff', 'attendance_finance'), true);
  assert.equal(canRoleAccessPortalSection('staff', 'saas_automation'), false);

  assert.equal(hasRolePermission('accountant', 'fees.collect'), true);
  assert.equal(hasRolePermission('staff', 'payroll.manage'), false);
  assert.equal(
    hasRolePermission('staff', 'payroll.manage', {
      id: 'cr-1',
      name: 'HR Coordinator',
      description: 'Payroll helper',
      permissionGroups: ['Finance & Payroll'],
      permissions: ['payroll.manage'],
      createdAt: '2026-01-01',
    }),
    true
  );
});

test('gradeExamSubmission supports negative marking, matching pairs, and manual written flags', () => {
  const questions: ExamQuestion[] = [
    {
      id: 'q1',
      type: 'mcq',
      prompt: 'Choose correct',
      options: ['A', 'B'],
      correctIndex: 0,
      explanation: 'A is right',
      marks: 2,
    },
    {
      id: 'q2',
      type: 'true_false',
      prompt: 'Sky is blue',
      options: ['True', 'False'],
      correctIndex: 0,
      explanation: 'True',
      marks: 2,
    },
    {
      id: 'q3',
      type: 'matching',
      prompt: 'Match synonyms',
      options: [],
      correctIndex: 0,
      matchingPairs: [
        { left: 'Fast', right: 'Quick' },
        { left: 'Big', right: 'Large' },
      ],
      explanation: 'Synonyms',
      marks: 4,
    },
    {
      id: 'q4',
      type: 'written',
      prompt: 'Write a paragraph',
      options: [],
      correctIndex: 0,
      explanation: 'Teacher graded',
      marks: 4,
    },
  ];

  // q1 correct (+2), q2 wrong (-0.5), q3 half matched (+2), q4 pending manual
  const res = gradeExamSubmission(
    questions,
    { q1: 0, q2: 1 },
    40,
    {
      negativeMarkPerWrong: 0.5,
      matchingAnswers: { q3: { Fast: 'Quick', Big: 'Tiny' } },
    }
  );
  assert.equal(res.score, 3.5);
  assert.equal(res.negativeDeduction, 0.5);
  assert.equal(res.requiresManualReview, true);

  // Manual grading completes evaluation
  const graded = gradeExamSubmission(
    questions,
    { q1: 0, q2: 1 },
    40,
    {
      negativeMarkPerWrong: 0.5,
      matchingAnswers: { q3: { Fast: 'Quick', Big: 'Large' } },
      manualScores: { q4: 4 },
    }
  );
  assert.equal(graded.requiresManualReview, false);
  assert.equal(graded.score, 9.5);
});

test('dashboard widget registry, presets, and drag reordering work deterministically', () => {
  const registry = buildWidgetRegistryWithPlugins([
    { id: 'plg-1', name: 'Zoom Live', category: 'Live Video', active: true },
    { id: 'plg-off', name: 'Off Plugin', category: 'AI', active: false },
  ]);
  assert.ok(registry.some((w) => w.id === 'plugin-widget-plg-1'));
  assert.ok(!registry.some((w) => w.id === 'plugin-widget-plg-off'));

  const financeLayout = applyDashboardPreset('finance', 'admin', registry);
  assert.equal(financeLayout[0].widgetId, 'w-finance-ledger');

  const reordered = reorderDashboardWidgets(financeLayout, financeLayout[2].widgetId, financeLayout[0].widgetId);
  assert.equal(reordered[0].widgetId, financeLayout[2].widgetId);
  assert.equal(reordered[0].order, 0);
});

test('assignments, fee ledger, drip content, plugin deps, certificates, referrals, and CSV export', () => {
  const onTime = evaluateAssignmentSubmissionStatus('2026-12-01T12:00:00Z', '2026-11-30T10:00:00Z', false);
  assert.equal(onTime.allowed, true);
  assert.equal(onTime.status, 'submitted');

  const lateBlocked = evaluateAssignmentSubmissionStatus('2026-11-01T12:00:00Z', '2026-11-02T10:00:00Z', false);
  assert.equal(lateBlocked.allowed, false);

  const lateAllowed = evaluateAssignmentSubmissionStatus('2026-11-01T12:00:00Z', '2026-11-02T10:00:00Z', true);
  assert.equal(lateAllowed.allowed, true);
  assert.equal(lateAllowed.status, 'late');

  const inv: StudentFeeInvoice = {
    id: 'inv-1',
    invoiceNo: 'FEE-101',
    studentId: 'u1',
    studentName: 'Student',
    branchId: 'br-1',
    feeType: 'course',
    title: 'HSC Fee',
    grossAmount: 5000,
    discountAmount: 500,
    scholarshipAmount: 500,
    lateFee: 100,
    paidAmount: 2000,
    dueDate: '2026-12-30',
    status: 'partial',
    installments: [],
    createdAt: '2026-11-01',
  };
  const invTotals = computeFeeInvoiceTotals(inv, '2026-11-15');
  assert.equal(invTotals.netPayable, 4100);
  assert.equal(invTotals.dueAmount, 2100);
  assert.equal(invTotals.computedStatus, 'partial');

  const ledger = computeFeeLedgerSummary([inv]);
  assert.equal(ledger.totalCollected, 2000);
  assert.equal(ledger.totalDue, 2100);

  const dripLocked = isLessonDripUnlocked('2026-11-20T00:00:00Z', 7, '2026-11-23T00:00:00Z');
  assert.equal(dripLocked.unlocked, false);
  assert.equal(dripLocked.daysRemaining, 4);
  assert.equal(isLessonDripUnlocked('2026-11-10T00:00:00Z', 7, '2026-11-23T00:00:00Z').unlocked, true);

  const depBlock = validatePluginDependencies(
    [
      { id: 'core-pay', name: 'Core Pay', active: true },
      { id: 'ssl', name: 'SSLCommerz', active: true, dependencies: ['core-pay'] },
    ],
    'core-pay',
    false
  );
  assert.equal(depBlock.ok, false);

  assert.equal(generateCertificateNumber(2026, 7), 'AEC-CERT-2026-0007');
  assert.equal(calculateReferralReward(3000, 10), 300);

  const att = computeAttendanceSummary([
    { id: '1', targetType: 'student', targetId: 'u1', targetName: 'A', branchId: null, date: '2026-11-01', status: 'present', recordedBy: 'T' },
    { id: '2', targetType: 'student', targetId: 'u1', targetName: 'A', branchId: null, date: '2026-11-02', status: 'absent', recordedBy: 'T' },
  ]);
  assert.equal(att.attendanceRate, 50);

  const csv = buildCsvExport(['Name', 'Amount'], [['=SUM(A1)', 1200]]);
  assert.equal(csv, "Name,Amount\n'=SUM(A1),1200");
});

test('filterActiveBranches & isBranchActive exclude deactivated branches from checkout/selection', () => {
  const branches: Branch[] = [
    {
      id: 'br-1',
      name: 'Mirpur',
      code: 'MPR',
      city: 'Dhaka',
      address: 'Road 1',
      phone: '01700',
      managerName: 'A',
      activeStudents: 100,
      status: 'active',
    },
    {
      id: 'br-2',
      name: 'Uttara',
      code: 'UTR',
      city: 'Dhaka',
      address: 'Road 2',
      phone: '01701',
      managerName: 'B',
      activeStudents: 50,
      status: 'inactive',
    },
  ];
  const active = filterActiveBranches(branches);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'br-1');
  assert.equal(isBranchActive(branches, 'br-1'), true);
  assert.equal(isBranchActive(branches, 'br-2'), false);
  assert.equal(isBranchActive(branches, 'non-existent'), false);
});

test('canClaimEbookFree prevents free claiming of paid ebooks', () => {
  assert.equal(canClaimEbookFree({ isFree: true, price: 0 }), true);
  assert.equal(canClaimEbookFree({ isFree: false, price: 0 }), true);
  assert.equal(canClaimEbookFree({ isFree: false, price: 150 }), false);
  assert.equal(canClaimEbookFree({ isFree: true, price: 150 }), true);
});

test('mergeCourseCategories preserves custom admin course categories & filters inactive ones', () => {
  const merged = mergeCourseCategories([
    { name: 'HSC English', type: 'course', active: true },
    { name: 'BCS Preparation', type: 'course', active: true },
    { name: 'Hidden Old Category', type: 'course', active: false },
    { name: 'Printed Books', type: 'product', active: true },
  ]);
  assert.ok(merged.includes('HSC English'));
  assert.ok(merged.includes('BCS Preparation'));
  assert.ok(!merged.includes('Hidden Old Category'));
  assert.ok(!merged.includes('Printed Books'));
  assert.equal(merged.filter((c) => c === 'HSC English').length, 1);
});

test('buildCourseDraftFromPost generates complete course draft linked to post with active branches', () => {
  const branches: Branch[] = [
    {
      id: 'br-a',
      name: 'Mirpur',
      code: 'MPR',
      city: 'Dhaka',
      address: 'A',
      phone: '1',
      managerName: 'M',
      activeStudents: 10,
      status: 'active',
    },
    {
      id: 'br-b',
      name: 'Closed',
      code: 'CLS',
      city: 'Sylhet',
      address: 'B',
      phone: '2',
      managerName: 'N',
      activeStudents: 0,
      status: 'inactive',
    },
  ];
  const draft = buildCourseDraftFromPost(
    {
      id: 'post-9',
      title: 'Mastering HSC Modifiers in 7 Days',
      category: 'Grammar Pro',
      content: 'Learn pre-modifiers and post-modifiers step by step. Practice board questions daily.',
      image: '/src/assets/images/hero_hsc_english_1795411661478.jpg',
    },
    branches,
    { price: 1800 }
  );
  assert.equal(draft.sourcePostId, 'post-9');
  assert.equal(draft.slug, 'mastering-hsc-modifiers-in-7-days');
  assert.equal(draft.price, 1800);
  assert.deepEqual(draft.branchIds, ['br-a']);
  assert.equal(draft.highlights.length, 2);
});

test('buildMonthlyRevenueSeries aggregates monthly revenue, enrollments, and orders', () => {
  const series = buildMonthlyRevenueSeries(
    [
      { totalAmount: 2500, status: 'completed', createdAt: '2026-02-10T10:00:00Z' },
      { totalAmount: 900, status: 'refunded', createdAt: '2026-02-12T10:00:00Z' },
      { totalAmount: 1500, status: 'completed', createdAt: '2026-03-05T10:00:00Z' },
    ],
    [
      { amountPaid: 2500, status: 'approved', enrolledAt: '2026-02-10T10:00:00Z' },
      { amountPaid: 1500, status: 'approved', enrolledAt: '2026-03-05T10:00:00Z' },
    ],
    [{ totalAmount: 800, status: 'delivered', createdAt: '2026-03-08T10:00:00Z' }],
    6
  );
  assert.equal(series.length, 6);
  const feb = series.find((p) => p.monthKey === '2026-02');
  const mar = series.find((p) => p.monthKey === '2026-03');
  if (feb) {
    assert.equal(feb.revenue, 2500);
    assert.equal(feb.enrollments, 1);
  }
  if (mar) {
    assert.equal(mar.revenue, 1500);
    assert.equal(mar.orders, 1);
  }
});





