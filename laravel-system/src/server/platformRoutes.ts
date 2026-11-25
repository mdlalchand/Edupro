import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  buildCourseDraftFromPost,
  calculateDiscountedPrice,
  calculateNetPayroll,
  calculateOrderTotalWithCoupon,
  calculateXpAndBadges,
  filterActiveBranches,
  filterActivePaymentGateways,
  isBranchActive,
  maskLeaderboardName,
  maskSecretValue,
  normalizeHeaderMenu,
  parseBulkQuestionBank,
  reorderListItem,
  sanitizeSafeUrl,
  validatePluginDependencies,
  validateScormManifest,
} from '../lib/domain';
import type {
  ApiPlugin,
  AttendanceRecord,
  CategoryItem,
  CommunityPost,
  Coupon,
  Ebook,
  Enrollment,
  Exam,
  Instructor,
  Order,
  PaymentGatewayConfig,
  PaymentGatewayType,
  PaymentTransaction,
  PayrollRecord,
  Product,
  Review,
  ScormPackage,
  UserRole,
} from '../types';
import {
  createVerifiedBackupSnapshot,
  getDb,
  recordAuditLog,
  resetDbToDefaults,
  saveDb,
  verifyBackupSnapshotIntegrity,
  type StoredUser,
} from './store';

interface AuthedRequest extends Request {
  authUser?: StoredUser;
}

export function createPlatformRouter(
  requireAuth: (req: AuthedRequest, res: Response, next: NextFunction) => void,
  requireRole: (roles: UserRole[]) => (req: AuthedRequest, res: Response, next: NextFunction) => void
) {
  const router = express.Router();

  // ---------------- PUBLIC & AUTHENTICATED SHARED ----------------

  router.post('/api/public/coupons/validate-cart', (req, res) => {
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const deliveryMode = req.body?.deliveryMode === 'branch_pickup' ? 'branch_pickup' : 'home';
    const db = getDb();

    const coupon = db.coupons.find(
      (c) =>
        c.code.toUpperCase() === code &&
        c.active &&
        (!c.appliesTo || c.appliesTo === 'all' || c.appliesTo === 'products')
    );
    if (!coupon) {
      res.status(400).json({ error: 'Invalid, inactive, or ineligible product coupon code.' });
      return;
    }

    const pricedItems = items.map((it: { productId: string; quantity: number }) => {
      const p = db.products.find((prod) => prod.id === it.productId);
      return {
        unitPrice: p ? p.price : 0,
        quantity: Math.max(1, Number(it.quantity) || 1),
      };
    });

    const totals = calculateOrderTotalWithCoupon(pricedItems, deliveryMode, coupon);
    res.json({ coupon, totals });
  });

  router.get('/api/public/community', (_req, res) => {
    const db = getDb();
    const publishedPosts = db.posts.filter((p) => p.status === 'published');
    const categories = db.categories.filter((c) => c.active);
    const customPages = (db.settings.customPages ?? []).filter((pg) => pg.published);

    const leaderboard = Object.values(db.rewardsByUser)
      .map((profile) => ({
        userId: profile.userId,
        displayName: maskLeaderboardName(profile.studentName, profile.showOnLeaderboard !== false),
        isMasked: profile.showOnLeaderboard === false,
        branchName: db.branches.find((b) => b.id === profile.branchId)?.name ?? 'Online Campus',
        xp: profile.xp,
        level: Math.max(1, Math.floor(profile.xp / 250) + 1),
        streakDays: profile.streakDays,
        badges: profile.badges,
      }))
      .sort((a, b) => b.xp - a.xp);

    res.json({
      posts: publishedPosts,
      categories,
      customPages,
      leaderboard,
    });
  });

  router.post('/api/community/posts/:id/like', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const post = db.posts.find((p) => p.id === req.params.id);
    if (!post) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    const uid = req.authUser!.id;
    if (post.likedByUserIds.includes(uid)) {
      post.likedByUserIds = post.likedByUserIds.filter((id) => id !== uid);
      post.likes = Math.max(0, post.likes - 1);
    } else {
      post.likedByUserIds.push(uid);
      post.likes += 1;
    }
    saveDb(db);
    res.json({ post });
  });

  router.post('/api/community/posts/:id/comments', requireAuth, (req: AuthedRequest, res) => {
    const text = String(req.body?.text ?? '').trim();
    if (!text) {
      res.status(400).json({ error: 'Comment text is required.' });
      return;
    }
    const db = getDb();
    const post = db.posts.find((p) => p.id === req.params.id);
    if (!post) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    post.comments.push({
      id: `cmt-${Date.now()}`,
      authorName: req.authUser!.name,
      authorRole: req.authUser!.role,
      text,
      createdAt: new Date().toISOString(),
    });
    saveDb(db);
    res.status(201).json({ post });
  });

  // ---------------- 4-STEP UNIVERSAL PAYMENT CHECKOUT ----------------

  router.post('/api/payments/checkout', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const {
      referenceType,
      courseId,
      ebookId,
      branchId,
      items,
      deliveryMode,
      deliveryAddress,
      phone,
      branchPickupId,
      couponCode,
      gateway,
      walletOrLast4,
      trxId,
    } = req.body ?? {};

    const configuredGateways = db.paymentGateways ?? [];
    const matchedGw = configuredGateways.find((g) => g.code === gateway || g.name === gateway);
    if (matchedGw && !matchedGw.active) {
      res.status(400).json({ error: `Payment gateway "${matchedGw.name}" is currently deactivated by Admin.` });
      return;
    }

    const allowedGateways: PaymentGatewayType[] = [
      'bKash',
      'Nagad',
      'Rocket',
      'SSLCommerz Card',
      'Manual Bank Transfer',
      'Branch Cash',
    ];
    const activeFallback = filterActivePaymentGateways(configuredGateways)[0]?.code ?? 'bKash';
    const safeGateway = (
      matchedGw ? matchedGw.code : allowedGateways.includes(gateway) ? gateway : activeFallback
    ) as PaymentGatewayType;
    const cleanTrx = String(trxId ?? '').trim().toUpperCase();
    const isCash = safeGateway === 'Branch Cash' || matchedGw?.providerType === 'cash_desk';
    const isManual = safeGateway === 'Manual Bank Transfer' || matchedGw?.providerType === 'bank_transfer';

    if (!isCash) {
      if (!cleanTrx || cleanTrx.length < 5) {
        res.status(400).json({ error: 'Valid Transaction / Slip Reference ID (min 5 chars) is required.' });
        return;
      }
      if (db.transactions.some((t) => t.trxId && t.trxId.toUpperCase() === cleanTrx)) {
        res.status(409).json({
          error: `Fraud protection: Transaction ID "${cleanTrx}" has already been submitted.`,
        });
        return;
      }
    }

    const invoiceNo = `INV-AEC-${Date.now().toString().slice(-6)}`;
    const couponUpper = String(couponCode ?? '').trim().toUpperCase();
    const coupon = couponUpper
      ? db.coupons.find((c) => c.code.toUpperCase() === couponUpper && c.active)
      : undefined;

    if (referenceType === 'course') {
      const course = db.courses.find((c) => c.id === courseId && c.status === 'active');
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      const activeBranches = filterActiveBranches(db.branches);
      const requestedBranchId = branchId ? String(branchId).trim() : '';
      if (requestedBranchId && !isBranchActive(db.branches, requestedBranchId)) {
        res.status(400).json({ error: 'Selected campus branch is currently deactivated and unavailable for checkout.' });
        return;
      }
      const resolvedBranchId =
        requestedBranchId ||
        (user.branchId && isBranchActive(db.branches, user.branchId) ? user.branchId : activeBranches[0]?.id || '');

      const pricing = calculateDiscountedPrice(course.price, course.originalPrice, coupon);
      const status: Enrollment['status'] = isCash || isManual ? 'pending' : 'approved';

      let enrollment = db.enrollments.find(
        (e) => e.userId === user.id && e.courseId === course.id
      );
      if (enrollment) {
        enrollment.status = status;
        enrollment.paymentMethod = safeGateway;
        enrollment.trxId = cleanTrx || 'CASH-DESK';
        enrollment.invoiceNo = invoiceNo;
        enrollment.amountPaid = pricing.finalPrice;
        enrollment.couponUsed = pricing.appliedCouponCode ?? undefined;
        if (resolvedBranchId) enrollment.branchId = resolvedBranchId;
      } else {
        enrollment = {
          id: `enr-${Date.now()}`,
          userId: user.id,
          studentName: user.name,
          studentEmail: user.email,
          courseId: course.id,
          courseTitle: course.title,
          branchId: resolvedBranchId,
          paymentMethod: safeGateway,
          trxId: cleanTrx || 'CASH-DESK',
          invoiceNo,
          amountPaid: pricing.finalPrice,
          couponUsed: pricing.appliedCouponCode ?? undefined,
          status,
          completedLessonIds: [],
          enrolledAt: new Date().toISOString(),
        };
        db.enrollments.unshift(enrollment);
        if (status === 'approved') course.enrolledCount += 1;
      }

      const txn: PaymentTransaction = {
        id: `txn-${Date.now()}`,
        invoiceNo,
        referenceType: 'course',
        referenceId: enrollment.id,
        userId: user.id,
        payerName: user.name,
        gateway: safeGateway,
        walletOrLast4: String(walletOrLast4 || phone || user.phone).slice(-14),
        trxId: cleanTrx || `CASH-${Date.now().toString().slice(-5)}`,
        subtotal: pricing.basePrice,
        discountAmount: pricing.couponDiscountAmount,
        couponCode: pricing.appliedCouponCode ?? undefined,
        deliveryFee: 0,
        totalAmount: pricing.finalPrice,
        status: status === 'approved' ? 'completed' : 'pending_verification',
        createdAt: new Date().toISOString(),
      };
      db.transactions.unshift(txn);
      db.financialRecords.unshift({
        id: `fin-${Date.now()}`,
        type: 'income',
        category: 'Course Tuition Fee',
        title: `${course.title} (${safeGateway}) — ${user.name}`,
        amount: pricing.finalPrice,
        branchId: enrollment.branchId || null,
        date: new Date().toISOString().slice(0, 10),
        recordedBy: user.name,
      });

      recordAuditLog(db, user, 'PAYMENT_CHECKOUT', course.title, `${safeGateway} · ৳${pricing.finalPrice} · ${invoiceNo}`);
      saveDb(db);
      res.status(201).json({ transaction: txn, enrollment });
      return;
    }

    if (referenceType === 'ebook') {
      const targetId = String(ebookId ?? courseId ?? '').trim();
      const ebook = db.ebooks.find((e) => e.id === targetId);
      if (!ebook) {
        res.status(404).json({ error: 'E-Book not found.' });
        return;
      }
      if (branchId && !isBranchActive(db.branches, String(branchId))) {
        res.status(400).json({ error: 'Selected campus branch is currently deactivated.' });
        return;
      }
      const pricing = calculateDiscountedPrice(
        ebook.price,
        Math.max(ebook.price, ebook.originalPrice || ebook.price),
        coupon
      );
      const isPending = isCash || isManual;
      const existing = db.claimedEbooksByUser[user.id] ?? [];
      if (!isPending && !existing.includes(ebook.id)) {
        existing.push(ebook.id);
        db.claimedEbooksByUser[user.id] = existing;
        ebook.salesCount = (ebook.salesCount ?? 0) + 1;
      }

      const txn: PaymentTransaction = {
        id: `txn-${Date.now()}`,
        invoiceNo,
        referenceType: 'ebook',
        referenceId: ebook.id,
        userId: user.id,
        payerName: user.name,
        gateway: safeGateway,
        walletOrLast4: String(walletOrLast4 || phone || user.phone).slice(-14),
        trxId: cleanTrx || `CASH-${Date.now().toString().slice(-5)}`,
        subtotal: pricing.basePrice,
        discountAmount: pricing.couponDiscountAmount,
        couponCode: pricing.appliedCouponCode ?? undefined,
        deliveryFee: 0,
        totalAmount: pricing.finalPrice,
        status: isPending ? 'pending_verification' : 'completed',
        createdAt: new Date().toISOString(),
      };
      db.transactions.unshift(txn);
      db.financialRecords.unshift({
        id: `fin-${Date.now()}`,
        type: 'income',
        category: 'Digital E-Book Sales',
        title: `${ebook.title} (${safeGateway}) — ${user.name}`,
        amount: pricing.finalPrice,
        branchId: branchId ? String(branchId) : user.branchId,
        date: new Date().toISOString().slice(0, 10),
        recordedBy: user.name,
      });

      recordAuditLog(db, user, 'EBOOK_PURCHASE', ebook.title, `${safeGateway} · ৳${pricing.finalPrice} · ${invoiceNo}`);
      saveDb(db);
      res.status(201).json({ transaction: txn, ebook, claimedEbookIds: existing });
      return;
    }

    // Order checkout (Products with Coupon + 4-Step Gateway)
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Cart is empty.' });
      return;
    }
    const orderItems: Order['items'] = [];
    for (const rawItem of items) {
      const prod = db.products.find((p) => p.id === rawItem.productId && p.active !== false);
      if (!prod) continue;
      const qty = Math.max(1, Math.min(20, Number(rawItem.quantity) || 1));
      if (prod.stock < qty) {
        res.status(400).json({ error: `Insufficient stock for ${prod.title}.` });
        return;
      }
      orderItems.push({ productId: prod.id, title: prod.title, quantity: qty, unitPrice: prod.price });
    }
    if (!orderItems.length) {
      res.status(400).json({ error: 'No valid active products found in cart.' });
      return;
    }

    const mode = deliveryMode === 'branch_pickup' ? 'branch_pickup' : 'home';
    const activeBranches = filterActiveBranches(db.branches);
    const cleanPickupBranchId =
      mode === 'branch_pickup' ? String(branchPickupId || activeBranches[0]?.id || '').trim() : null;
    if (mode === 'branch_pickup') {
      if (!cleanPickupBranchId || !isBranchActive(db.branches, cleanPickupBranchId)) {
        res.status(400).json({ error: 'Selected pickup branch is currently deactivated or unavailable.' });
        return;
      }
    }
    if (mode === 'home' && !String(deliveryAddress ?? '').trim()) {
      res.status(400).json({ error: 'Delivery address is required for home delivery.' });
      return;
    }

    const totals = calculateOrderTotalWithCoupon(orderItems, mode, coupon);
    for (const oi of orderItems) {
      const prod = db.products.find((p) => p.id === oi.productId);
      if (prod) prod.stock = Math.max(0, prod.stock - oi.quantity);
    }

    const order: Order = {
      id: `ord-${Date.now()}`,
      userId: user.id,
      customerName: user.name,
      phone: String(phone || user.phone).trim(),
      deliveryAddress:
        mode === 'branch_pickup' ? 'Branch Pickup Counter' : String(deliveryAddress).trim(),
      branchPickupId: cleanPickupBranchId,
      items: orderItems,
      deliveryFee: totals.deliveryFee,
      discountAmount: totals.discountAmount,
      couponUsed: totals.appliedCouponCode ?? undefined,
      paymentMethod: safeGateway,
      trxId: cleanTrx || 'CASH-DESK',
      invoiceNo,
      totalAmount: totals.totalAmount,
      status: 'processing',
      createdAt: new Date().toISOString(),
    };
    db.orders.unshift(order);

    const txn: PaymentTransaction = {
      id: `txn-${Date.now()}`,
      invoiceNo,
      referenceType: 'order',
      referenceId: order.id,
      userId: user.id,
      payerName: user.name,
      gateway: safeGateway,
      walletOrLast4: String(walletOrLast4 || phone || user.phone).slice(-14),
      trxId: cleanTrx || `CASH-${Date.now().toString().slice(-5)}`,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      couponCode: totals.appliedCouponCode ?? undefined,
      deliveryFee: totals.deliveryFee,
      totalAmount: totals.totalAmount,
      status: isCash || isManual ? 'pending_verification' : 'completed',
      createdAt: new Date().toISOString(),
    };
    db.transactions.unshift(txn);
    db.financialRecords.unshift({
      id: `fin-${Date.now()}`,
      type: 'income',
      category: 'Book & Merchandise Sales',
      title: `Order ${order.id} (${safeGateway}) — ${user.name}`,
      amount: totals.totalAmount,
      branchId: order.branchPickupId ?? user.branchId,
      date: new Date().toISOString().slice(0, 10),
      recordedBy: user.name,
    });

    recordAuditLog(db, user, 'PRODUCT_CHECKOUT', order.id, `${safeGateway} · ৳${totals.totalAmount} · ${invoiceNo}`);
    saveDb(db);
    res.status(201).json({ transaction: txn, order });
  });

  // ---------------- SCORM 1.2 RUNTIME & LEARNING REWARDS ----------------

  router.get('/api/scorm/packages', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const myAttempts = db.scormAttempts.filter((a) => a.userId === req.authUser!.id);
    res.json({ packages: db.scormPackages, attempts: myAttempts });
  });

  router.post('/api/portal/scorm', requireAuth, requireRole(['admin', 'teacher']), (req: AuthedRequest, res) => {
    const { courseId, title, manifestXml, htmlContent, maxScore, xpReward } = req.body ?? {};
    const validation = validateScormManifest(String(manifestXml ?? ''));
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const db = getDb();
    const pkg: ScormPackage = {
      id: `scorm-${Date.now()}`,
      courseId: String(courseId || db.courses[0]?.id || 'crs-1'),
      title: String(title || validation.title).trim(),
      version: '1.2',
      identifier: validation.identifier,
      launchFile: validation.launchFile,
      manifestXml: String(manifestXml),
      htmlContent: String(htmlContent || 'Custom SCORM 1.2 Interactive Activity'),
      maxScore: Math.max(10, Number(maxScore) || 100),
      xpReward: Math.max(25, Number(xpReward) || 150),
      createdAt: new Date().toISOString(),
    };
    db.scormPackages.unshift(pkg);
    recordAuditLog(db, req.authUser!, 'SCORM_CREATE', pkg.title, `Manifest ${pkg.identifier}`);
    saveDb(db);
    res.status(201).json({ package: pkg });
  });

  router.post('/api/scorm/commit', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const { packageId, lessonStatus, scoreRaw, sessionTime, suspendData } = req.body ?? {};
    const pkg = db.scormPackages.find((p) => p.id === packageId);
    if (!pkg) {
      res.status(404).json({ error: 'SCORM 1.2 package not found.' });
      return;
    }

    let attempt = db.scormAttempts.find((a) => a.packageId === pkg.id && a.userId === user.id);
    const validStatuses = ['not attempted', 'incomplete', 'completed', 'passed', 'failed'];
    const safeStatus = validStatuses.includes(lessonStatus) ? lessonStatus : 'incomplete';

    if (attempt) {
      attempt.lessonStatus = safeStatus;
      attempt.scoreRaw = Math.min(100, Math.max(0, Number(scoreRaw) || 0));
      attempt.sessionTime = String(sessionTime || '00:02:00');
      attempt.suspendData = String(suspendData || '');
      attempt.updatedAt = new Date().toISOString();
    } else {
      attempt = {
        id: `sca-${Date.now()}`,
        packageId: pkg.id,
        userId: user.id,
        lessonStatus: safeStatus,
        scoreRaw: Math.min(100, Math.max(0, Number(scoreRaw) || 0)),
        sessionTime: String(sessionTime || '00:02:00'),
        suspendData: String(suspendData || ''),
        updatedAt: new Date().toISOString(),
      };
      db.scormAttempts.unshift(attempt);
    }

    // Recompute Learner Rewards Profile deterministically
    const profile = db.rewardsByUser[user.id] ?? {
      userId: user.id,
      studentName: user.name,
      branchId: user.branchId,
      xp: 0,
      streakDays: 1,
      badges: [],
      showOnLeaderboard: true,
      completedScormIds: [],
      updatedAt: new Date().toISOString(),
    };
    if ((safeStatus === 'completed' || safeStatus === 'passed') && !profile.completedScormIds.includes(pkg.id)) {
      profile.completedScormIds.push(pkg.id);
    }
    const lessonsCompleted = db.enrollments
      .filter((e) => e.userId === user.id)
      .reduce((sum, e) => sum + e.completedLessonIds.length, 0);
    const examsPassed = db.examAttempts.filter((a) => a.userId === user.id && a.passed).length;
    const attendancePresent = db.attendance.filter(
      (a) => a.targetId === user.id && a.status === 'present'
    ).length;

    const computed = calculateXpAndBadges({
      lessonsCompleted,
      examsPassed,
      scormCompleted: profile.completedScormIds.length,
      attendancePresent,
    });
    profile.xp = computed.xp;
    profile.streakDays = computed.streakDays;
    profile.badges = computed.badges;
    profile.updatedAt = new Date().toISOString();
    db.rewardsByUser[user.id] = profile;

    saveDb(db);
    res.json({ attempt, rewards: profile });
  });

  router.get('/api/rewards/me', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const existing = db.rewardsByUser[user.id];
    const lessonsCompleted = db.enrollments
      .filter((e) => e.userId === user.id)
      .reduce((sum, e) => sum + e.completedLessonIds.length, 0);
    const examsPassed = db.examAttempts.filter((a) => a.userId === user.id && a.passed).length;
    const scormCompleted = existing?.completedScormIds.length ?? 0;
    const attendancePresent = db.attendance.filter(
      (a) => a.targetId === user.id && a.status === 'present'
    ).length;
    const computed = calculateXpAndBadges({
      lessonsCompleted,
      examsPassed,
      scormCompleted,
      attendancePresent,
    });
    const profile = {
      userId: user.id,
      studentName: user.name,
      branchId: user.branchId,
      xp: Math.max(existing?.xp ?? 0, computed.xp),
      streakDays: Math.max(existing?.streakDays ?? 1, computed.streakDays),
      badges: Array.from(new Set([...(existing?.badges ?? []), ...computed.badges])),
      showOnLeaderboard: existing ? existing.showOnLeaderboard : true,
      completedScormIds: existing?.completedScormIds ?? [],
      updatedAt: new Date().toISOString(),
    };
    db.rewardsByUser[user.id] = profile;
    saveDb(db);
    res.json({ rewards: profile });
  });

  router.patch('/api/rewards/privacy', requireAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const profile = db.rewardsByUser[user.id] ?? {
      userId: user.id,
      studentName: user.name,
      branchId: user.branchId,
      xp: 100,
      streakDays: 1,
      badges: ['First Step Learner'],
      showOnLeaderboard: true,
      completedScormIds: [],
      updatedAt: new Date().toISOString(),
    };
    profile.showOnLeaderboard = Boolean(req.body?.showOnLeaderboard);
    profile.updatedAt = new Date().toISOString();
    db.rewardsByUser[user.id] = profile;
    saveDb(db);
    res.json({ rewards: profile });
  });

  // ---------------- ADVANCED TESTIMONIALS CRUD ----------------

  router.patch('/api/portal/reviews/reorder', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const { id, direction } = req.body ?? {};
    const db = getDb();
    const idx = db.reviews.findIndex((r) => r.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Review not found.' });
      return;
    }
    db.reviews = reorderListItem(db.reviews, idx, direction === 'down' ? 'down' : 'up');
    saveDb(db);
    res.json({ reviews: db.reviews });
  });

  router.patch('/api/portal/reviews/:id/status', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const review = db.reviews.find((r) => r.id === req.params.id);
    if (!review) {
      res.status(404).json({ error: 'Review not found.' });
      return;
    }
    if (req.body?.status && ['approved', 'pending', 'hidden'].includes(req.body.status)) {
      review.status = req.body.status;
    }
    if (typeof req.body?.featured === 'boolean') {
      review.featured = req.body.featured;
    }
    recordAuditLog(db, req.authUser!, 'REVIEW_MODERATION', review.name, `status=${review.status}, featured=${Boolean(review.featured)}`);
    saveDb(db);
    res.json({ review, reviews: db.reviews });
  });

  // ---------------- BULK SUBJECT-WISE QUESTION BANK & ADVANCED EXAMS ----------------

  router.get('/api/portal/question-bank', requireAuth, requireRole(['admin', 'teacher']), (_req, res) => {
    const db = getDb();
    res.json({ questionBank: db.questionBank });
  });

  router.post('/api/portal/question-bank/bulk', requireAuth, requireRole(['admin', 'teacher']), (req: AuthedRequest, res) => {
    const { rawText, subject, chapter, difficulty, questions } = req.body ?? {};
    const subj = String(subject ?? 'English Grammar').trim() || 'English Grammar';
    const chap = String(chapter ?? 'General').trim() || 'General';
    const diff = difficulty === 'Easy' || difficulty === 'Hard' ? difficulty : 'Medium';

    let imported = [] as ReturnType<typeof parseBulkQuestionBank>['items'];
    let errors: string[] = [];

    if (Array.isArray(questions) && questions.length > 0) {
      imported = questions
        .filter((q: Record<string, unknown>) => String(q.prompt ?? '').trim())
        .map((q: Record<string, unknown>, idx: number) => ({
          id: `qb-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          subject: String(q.subject ?? subj).trim(),
          chapter: String(q.chapter ?? chap).trim(),
          difficulty: diff,
          type: q.type === 'true_false' || q.type === 'written' ? q.type : 'mcq',
          prompt: String(q.prompt).trim(),
          options: Array.isArray(q.options) ? q.options.map((o) => String(o).trim()) : ['True', 'False'],
          correctIndex: Math.max(0, Number(q.correctIndex) || 0),
          explanation: String(q.explanation ?? '').trim() || 'Verified by Question Bank.',
          marks: Math.max(1, Number(q.marks) || 1),
          createdAt: new Date().toISOString(),
        }));
    } else {
      const parsed = parseBulkQuestionBank(String(rawText ?? ''), subj, chap, diff);
      imported = parsed.items;
      errors = parsed.errors;
    }

    if (imported.length === 0) {
      res.status(400).json({ error: errors[0] || 'No valid questions found to import.', errors });
      return;
    }

    const db = getDb();
    db.questionBank.unshift(...imported);
    recordAuditLog(db, req.authUser!, 'QUESTION_BANK_BULK_IMPORT', subj, `Imported ${imported.length} questions (${chap})`);
    saveDb(db);
    res.status(201).json({ importedCount: imported.length, errors, questionBank: db.questionBank });
  });

  router.delete('/api/portal/question-bank/:id', requireAuth, requireRole(['admin', 'teacher']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.questionBank.findIndex((q) => q.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    const [removed] = db.questionBank.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}`,
      entityType: 'question',
      originalId: removed.id,
      label: removed.prompt.slice(0, 70),
      deletedBy: req.authUser!.name,
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    saveDb(db);
    res.json({ deletedId: removed.id, questionBank: db.questionBank });
  });

  router.post('/api/portal/exams/from-bank', requireAuth, requireRole(['admin', 'teacher']), (req: AuthedRequest, res) => {
    const {
      title,
      category,
      courseId,
      durationMinutes,
      passPercentage,
      negativeMarkPerWrong,
      visibility,
      questionIds,
      randomSubject,
      randomCount,
    } = req.body ?? {};
    if (!String(title ?? '').trim()) {
      res.status(400).json({ error: 'Exam title is required.' });
      return;
    }
    const db = getDb();
    let selected = Array.isArray(questionIds) && questionIds.length > 0
      ? db.questionBank.filter((q) => questionIds.includes(q.id))
      : [];

    if (selected.length === 0) {
      const pool = randomSubject && randomSubject !== 'all'
        ? db.questionBank.filter((q) => q.subject === randomSubject)
        : db.questionBank;
      const limit = Math.max(1, Math.min(pool.length, Number(randomCount) || 4));
      selected = [...pool].sort(() => Math.random() - 0.5).slice(0, limit);
    }

    if (selected.length === 0) {
      res.status(400).json({ error: 'Select or match at least 1 question from the Question Bank.' });
      return;
    }

    const exam: Exam = {
      id: `ex-${Date.now()}`,
      title: String(title).trim(),
      courseId: courseId || null,
      category: String(category || 'HSC English').trim(),
      durationMinutes: Math.max(5, Number(durationMinutes) || 20),
      passPercentage: Math.max(20, Math.min(90, Number(passPercentage) || 40)),
      negativeMarkPerWrong: Math.max(0, Number(negativeMarkPerWrong) || 0),
      examType: 'mcq',
      visibility: visibility === 'course' ? 'course' : 'public',
      teacherId: req.authUser!.id,
      questions: selected.map((q) => ({ ...q })),
      createdAt: new Date().toISOString(),
    };

    db.exams.unshift(exam);
    recordAuditLog(db, req.authUser!, 'EXAM_FROM_BANK', exam.title, `${exam.questions.length} questions`);
    saveDb(db);
    res.status(201).json({ exam });
  });

  router.delete('/api/portal/exams/:id', requireAuth, requireRole(['admin', 'teacher']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.exams.findIndex((ex) => ex.id === req.params.id);
    if (idx === -1) return void res.status(404).json({ error: 'Exam not found.' });
    const [removed] = db.exams.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      entityType: 'exam',
      originalId: removed.id,
      label: removed.title,
      deletedBy: req.authUser!.name,
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    recordAuditLog(db, req.authUser!, 'EXAM_DELETE', removed.title, 'Moved to Recycle Bin');
    saveDb(db);
    res.json({ deletedId: removed.id });
  });

  // ---------------- CATALOG & CONTENT CREATORS (IMAGES + SOFT DELETE TO RECYCLE BIN) ----------------

  router.post('/api/portal/ebooks', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const {
      title,
      level,
      category,
      isFree,
      price,
      originalPrice,
      author,
      pagesCount,
      coverImage,
      pdfUrl,
      summary,
      sampleContent,
    } = req.body ?? {};
    if (!String(title ?? '').trim()) {
      res.status(400).json({ error: 'E-Book title is required.' });
      return;
    }
    const db = getDb();
    const ebook: Ebook = {
      id: `ebk-${Date.now()}`,
      title: String(title).trim(),
      level: String(level || 'HSC 27').trim(),
      category: String(category || 'Digital PDF').trim(),
      isFree: Boolean(isFree),
      price: Boolean(isFree) ? 0 : Math.max(0, Number(price) || 190),
      originalPrice: Boolean(isFree) ? 0 : Math.max(0, Number(originalPrice) || Number(price) || 350),
      author: String(author || 'Aloms English Academic Team').trim(),
      pagesCount: Math.max(5, Number(pagesCount) || 120),
      coverImage: sanitizeSafeUrl(String(coverImage ?? ''), '/src/assets/images/course_english_books_1795411661325.jpg'),
      pdfUrl: pdfUrl ? sanitizeSafeUrl(String(pdfUrl), '') : undefined,
      salesCount: 0,
      summary: String(summary || 'Structured bilingual digital E-Book with solved board questions.').trim(),
      sampleContent: Array.isArray(sampleContent) && sampleContent.length
        ? sampleContent.map(String)
        : ['Chapter 1: Grammar Rules & Solved Board Patterns', 'Chapter 2: Guided Practice Exercises'],
    };
    db.ebooks.unshift(ebook);
    recordAuditLog(db, req.authUser!, 'EBOOK_CREATE', ebook.title, ebook.level);
    saveDb(db);
    res.status(201).json({ ebook });
  });

  router.put('/api/portal/ebooks/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const ebook = db.ebooks.find((e) => e.id === req.params.id);
    if (!ebook) return void res.status(404).json({ error: 'E-Book not found.' });
    const b = req.body ?? {};
    if (typeof b.title === 'string' && b.title.trim()) ebook.title = b.title.trim();
    if (typeof b.level === 'string' && b.level.trim()) ebook.level = b.level.trim();
    if (typeof b.category === 'string' && b.category.trim()) ebook.category = b.category.trim();
    if (typeof b.isFree === 'boolean') ebook.isFree = b.isFree;
    if (ebook.isFree) {
      ebook.price = 0;
      ebook.originalPrice = 0;
    } else {
      if (b.price !== undefined) ebook.price = Math.max(0, Number(b.price) || 0);
      if (b.originalPrice !== undefined) ebook.originalPrice = Math.max(ebook.price, Number(b.originalPrice) || ebook.price);
    }
    if (typeof b.author === 'string' && b.author.trim()) ebook.author = b.author.trim();
    if (b.pagesCount !== undefined) ebook.pagesCount = Math.max(1, Number(b.pagesCount) || ebook.pagesCount);
    if (typeof b.coverImage === 'string' && b.coverImage.trim()) {
      ebook.coverImage = sanitizeSafeUrl(b.coverImage, ebook.coverImage || '/src/assets/images/course_english_books_1795411661325.jpg');
    }
    if (typeof b.pdfUrl === 'string') {
      ebook.pdfUrl = b.pdfUrl.trim() ? sanitizeSafeUrl(b.pdfUrl.trim(), '') : undefined;
    }
    if (typeof b.summary === 'string') ebook.summary = b.summary.trim();
    if (Array.isArray(b.sampleContent) && b.sampleContent.length > 0) {
      ebook.sampleContent = b.sampleContent.map((s: unknown) => String(s).trim()).filter(Boolean);
    }
    recordAuditLog(db, req.authUser!, 'EBOOK_UPDATE', ebook.title, ebook.isFree ? 'FREE' : `৳${ebook.price}`);
    saveDb(db);
    res.json({ ebook });
  });

  router.delete('/api/portal/ebooks/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.ebooks.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return void res.status(404).json({ error: 'E-Book not found.' });
    const [removed] = db.ebooks.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}`,
      entityType: 'ebook',
      originalId: removed.id,
      label: removed.title,
      deletedBy: req.authUser!.name,
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    saveDb(db);
    res.json({ deletedId: removed.id });
  });

  router.post('/api/portal/products', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const { title, category, price, originalPrice, stock, image, description, active } = req.body ?? {};
    if (!String(title ?? '').trim()) {
      res.status(400).json({ error: 'Product title is required.' });
      return;
    }
    const db = getDb();
    const cleanPrice = Math.max(0, Number(price) || 450);
    const product: Product = {
      id: `prd-${Date.now()}`,
      title: String(title).trim(),
      category: String(category || 'Books').trim(),
      price: cleanPrice,
      originalPrice: Math.max(cleanPrice, Number(originalPrice) || cleanPrice + 150),
      stock: Math.max(0, Number(stock) ?? 50),
      image: sanitizeSafeUrl(String(image ?? ''), '/src/assets/images/course_english_books_1795411661325.jpg'),
      description: String(description || 'Printed study guide by Aloms English Center.').trim(),
      active: active !== false,
    };
    db.products.unshift(product);
    recordAuditLog(db, req.authUser!, 'PRODUCT_CREATE', product.title, `৳${product.price}`);
    saveDb(db);
    res.status(201).json({ product });
  });

  router.put('/api/portal/products/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const product = db.products.find((p) => p.id === req.params.id);
    if (!product) return void res.status(404).json({ error: 'Product not found.' });
    const b = req.body ?? {};
    if (typeof b.title === 'string' && b.title.trim()) product.title = b.title.trim();
    if (typeof b.category === 'string' && b.category.trim()) product.category = b.category.trim();
    if (b.price !== undefined) product.price = Math.max(0, Number(b.price) || 0);
    if (b.originalPrice !== undefined) product.originalPrice = Math.max(product.price, Number(b.originalPrice) || product.price);
    if (b.stock !== undefined) product.stock = Math.max(0, Math.round(Number(b.stock) || 0));
    if (typeof b.image === 'string' && b.image.trim()) {
      product.image = sanitizeSafeUrl(b.image, product.image);
    }
    if (typeof b.description === 'string') product.description = b.description.trim();
    if (typeof b.active === 'boolean') product.active = b.active;
    recordAuditLog(db, req.authUser!, 'PRODUCT_UPDATE', product.title, `৳${product.price} · Stock ${product.stock}`);
    saveDb(db);
    res.json({ product });
  });

  router.delete('/api/portal/products/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.products.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return void res.status(404).json({ error: 'Product not found.' });
    const [removed] = db.products.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}`,
      entityType: 'product',
      originalId: removed.id,
      label: removed.title,
      deletedBy: req.authUser!.name,
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    saveDb(db);
    res.json({ deletedId: removed.id });
  });

  router.post('/api/portal/instructors', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const { name, subject, roleTitle, education, panel, branchId, bio, avatar } = req.body ?? {};
    if (!String(name ?? '').trim()) {
      res.status(400).json({ error: 'Instructor name is required.' });
      return;
    }
    const db = getDb();
    const instructor: Instructor = {
      id: `inst-${Date.now()}`,
      name: String(name).trim(),
      subject: String(subject || 'English Grammar & IELTS').trim(),
      roleTitle: String(roleTitle || 'Senior English Faculty').trim(),
      education: String(education || 'MA in English, University of Dhaka').trim(),
      panel: panel === 'Branch Faculty' ? 'Branch Faculty' : 'Head Faculty',
      branchId: String(branchId || filterActiveBranches(db.branches)[0]?.id || 'br-mirpur'),
      bio: String(bio || 'Experienced board & admission English mentor.').trim(),
      avatar: sanitizeSafeUrl(String(avatar ?? ''), '/src/assets/images/instructor_portrait_lead_1795411661581.jpg'),
    };
    db.instructors.unshift(instructor);
    recordAuditLog(db, req.authUser!, 'INSTRUCTOR_CREATE', instructor.name, instructor.subject);
    saveDb(db);
    res.status(201).json({ instructor });
  });

  router.delete('/api/portal/instructors/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.instructors.findIndex((i) => i.id === req.params.id);
    if (idx === -1) return void res.status(404).json({ error: 'Instructor not found.' });
    const [removed] = db.instructors.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}`,
      entityType: 'instructor',
      originalId: removed.id,
      label: removed.name,
      deletedBy: req.authUser!.name,
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    saveDb(db);
    res.json({ deletedId: removed.id });
  });

  router.post('/api/portal/categories', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const { name, type, description, image, active } = req.body ?? {};
    if (!String(name ?? '').trim()) {
      res.status(400).json({ error: 'Category name is required.' });
      return;
    }
    const cleanName = String(name).trim();
    const db = getDb();
    const category: CategoryItem = {
      id: `cat-${Date.now()}`,
      name: cleanName,
      slug: cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      type: ['course', 'product', 'ebook', 'post'].includes(type) ? type : 'course',
      description: String(description || `${cleanName} programs and resources.`).trim(),
      image: sanitizeSafeUrl(String(image ?? ''), '/src/assets/images/hero_hsc_english_1795411661478.jpg'),
      active: active !== false,
    };
    db.categories.unshift(category);
    recordAuditLog(db, req.authUser!, 'CATEGORY_CREATE', category.name, category.type);
    saveDb(db);
    res.status(201).json({ category, categories: db.categories });
  });

  router.put('/api/portal/categories/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const category = db.categories.find((c) => c.id === req.params.id);
    if (!category) return void res.status(404).json({ error: 'Category not found.' });
    const b = req.body ?? {};
    if (typeof b.name === 'string' && b.name.trim()) {
      category.name = b.name.trim();
      category.slug = category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    if (['course', 'product', 'ebook', 'post'].includes(b.type)) {
      category.type = b.type;
    }
    if (typeof b.description === 'string') category.description = b.description.trim();
    if (typeof b.image === 'string' && b.image.trim()) {
      category.image = sanitizeSafeUrl(b.image, category.image || '/src/assets/images/hero_hsc_english_1795411661478.jpg');
    }
    if (typeof b.active === 'boolean') category.active = b.active;
    recordAuditLog(db, req.authUser!, 'CATEGORY_UPDATE', category.name, `${category.type} · active=${category.active}`);
    saveDb(db);
    res.json({ category, categories: db.categories });
  });

  router.delete('/api/portal/categories/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.categories.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return void res.status(404).json({ error: 'Category not found.' });
    const [removed] = db.categories.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}`,
      entityType: 'category',
      originalId: removed.id,
      label: removed.name,
      deletedBy: req.authUser!.name,
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    saveDb(db);
    res.json({ deletedId: removed.id, categories: db.categories });
  });

  router.post('/api/portal/posts', requireAuth, requireRole(['admin', 'teacher', 'student']), (req: AuthedRequest, res) => {
    const { title, category, content, image, status } = req.body ?? {};
    if (!String(title ?? '').trim() || !String(content ?? '').trim()) {
      res.status(400).json({ error: 'Post title and content are required.' });
      return;
    }
    const db = getDb();
    const post: CommunityPost = {
      id: `post-${Date.now()}`,
      title: String(title).trim(),
      category: String(category || 'Exam Strategy & Tips').trim(),
      content: String(content).trim(),
      image: sanitizeSafeUrl(String(image ?? ''), ''),
      authorId: req.authUser!.id,
      authorName: req.authUser!.name,
      authorRole: req.authUser!.role,
      likes: 1,
      likedByUserIds: [req.authUser!.id],
      comments: [],
      status: status === 'draft' ? 'draft' : 'published',
      createdAt: new Date().toISOString(),
    };
    db.posts.unshift(post);
    recordAuditLog(db, req.authUser!, 'POST_CREATE', post.title, post.category);
    saveDb(db);
    res.status(201).json({ post });
  });

  router.put('/api/portal/posts/:id', requireAuth, requireRole(['admin', 'teacher']), (req: AuthedRequest, res) => {
    const db = getDb();
    const post = db.posts.find((p) => p.id === req.params.id);
    if (!post) return void res.status(404).json({ error: 'Post not found.' });
    const b = req.body ?? {};
    if (typeof b.title === 'string' && b.title.trim()) post.title = b.title.trim();
    if (typeof b.category === 'string' && b.category.trim()) post.category = b.category.trim();
    if (typeof b.content === 'string' && b.content.trim()) post.content = b.content.trim();
    if (typeof b.image === 'string') {
      post.image = b.image.trim() ? sanitizeSafeUrl(b.image.trim(), '') : undefined;
    }
    if (b.status === 'published' || b.status === 'draft') post.status = b.status;
    recordAuditLog(db, req.authUser!, 'POST_UPDATE', post.title, post.status);
    saveDb(db);
    res.json({ post });
  });

  router.post('/api/portal/posts/:id/convert-to-course', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const post = db.posts.find((p) => p.id === req.params.id);
    if (!post) return void res.status(404).json({ error: 'Source post not found.' });
    const b = req.body ?? {};
    const draft = buildCourseDraftFromPost(post, db.branches, {
      title: typeof b.title === 'string' && b.title.trim() ? b.title.trim() : undefined,
      category: typeof b.category === 'string' && b.category.trim() ? b.category.trim() : undefined,
      price: b.price !== undefined ? Number(b.price) : undefined,
      originalPrice: b.originalPrice !== undefined ? Number(b.originalPrice) : undefined,
      levelTag: typeof b.levelTag === 'string' && b.levelTag.trim() ? b.levelTag.trim() : undefined,
      duration: typeof b.duration === 'string' && b.duration.trim() ? b.duration.trim() : undefined,
      status: b.status === 'draft' ? 'draft' : 'active',
    });
    const suffix = Date.now().toString().slice(-4);
    const course = {
      id: `crs-${Date.now()}`,
      ...draft,
      slug: `${draft.slug}-${suffix}`,
      enrolledCount: 0,
    };
    db.courses.unshift(course);
    recordAuditLog(db, req.authUser!, 'COURSE_FROM_POST', course.title, `Converted from post "${post.title}"`);
    saveDb(db);
    res.status(201).json({ course, sourcePostId: post.id });
  });

  router.delete('/api/portal/posts/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.posts.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return void res.status(404).json({ error: 'Post not found.' });
    const [removed] = db.posts.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}`,
      entityType: 'post',
      originalId: removed.id,
      label: removed.title,
      deletedBy: req.authUser!.name,
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    saveDb(db);
    res.json({ deletedId: removed.id });
  });

  router.post('/api/portal/coupons', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    const discountPercent = Math.min(90, Math.max(1, Number(req.body?.discountPercent) || 10));
    if (!code) return void res.status(400).json({ error: 'Coupon code is required.' });
    const db = getDb();
    const existing = db.coupons.find((c) => c.code.toUpperCase() === code);
    const coupon: Coupon = {
      code,
      discountPercent,
      active: req.body?.active !== false,
      appliesTo: ['all', 'courses', 'products'].includes(req.body?.appliesTo) ? req.body.appliesTo : 'all',
      description: String(req.body?.description ?? `${discountPercent}% promotional discount`).trim(),
    };
    if (existing) {
      Object.assign(existing, coupon);
    } else {
      db.coupons.unshift(coupon);
    }
    recordAuditLog(db, req.authUser!, 'COUPON_SAVE', coupon.code, `${coupon.discountPercent}% (${coupon.appliesTo})`);
    saveDb(db);
    res.status(201).json({ coupon, coupons: db.coupons });
  });

  router.delete('/api/portal/coupons/:code', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const code = String(req.params.code ?? '').toUpperCase();
    const idx = db.coupons.findIndex((c) => c.code.toUpperCase() === code);
    if (idx === -1) return void res.status(404).json({ error: 'Coupon not found.' });
    const [removed] = db.coupons.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      entityType: 'coupon',
      originalId: removed.code,
      label: `${removed.code} (${removed.discountPercent}% OFF)`,
      deletedBy: req.authUser!.name,
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    recordAuditLog(db, req.authUser!, 'COUPON_DELETE', removed.code, 'Moved to Recycle Bin');
    saveDb(db);
    res.json({ coupons: db.coupons });
  });

  router.put('/api/portal/branding', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (typeof b.brandName === 'string' && b.brandName.trim()) db.settings.brandName = b.brandName.trim();
    if (typeof b.tagline === 'string') db.settings.tagline = b.tagline.trim();
    if (typeof b.logoUrl === 'string') {
      db.settings.logoUrl = sanitizeSafeUrl(b.logoUrl, '/images/aec-logo.png');
    }
    if (typeof b.faviconUrl === 'string') {
      db.settings.faviconUrl = sanitizeSafeUrl(b.faviconUrl, '/images/aec-logo.png');
    }
    if (typeof b.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.primaryColor)) {
      db.settings.primaryColor = b.primaryColor;
    }
    if (typeof b.whiteLabelDomain === 'string') db.settings.whiteLabelDomain = b.whiteLabelDomain.trim();
    if (b.language === 'bn' || b.language === 'en') db.settings.language = b.language;
    if (typeof b.footerCopyright === 'string') db.settings.footerCopyright = b.footerCopyright.trim();
    if (typeof b.aboutMission === 'string') db.settings.aboutMission = b.aboutMission.trim();
    if (Array.isArray(b.footerLinks)) {
      db.settings.footerLinks = b.footerLinks.map((fl: { label?: string; path?: string }) => ({
        label: String(fl.label ?? 'Link').trim(),
        path: sanitizeSafeUrl(String(fl.path ?? '/'), '/'),
      }));
    }
    if (Array.isArray(b.headerMenu)) {
      db.settings.headerMenu = normalizeHeaderMenu(b.headerMenu, db.settings.headerMenu);
    }
    if (b.socialLinks && typeof b.socialLinks === 'object') {
      db.settings.socialLinks = {
        youtube: sanitizeSafeUrl(String(b.socialLinks.youtube ?? 'https://youtube.com'), 'https://youtube.com'),
        facebook: sanitizeSafeUrl(String(b.socialLinks.facebook ?? 'https://facebook.com'), 'https://facebook.com'),
        linkedin: sanitizeSafeUrl(String(b.socialLinks.linkedin ?? 'https://linkedin.com'), 'https://linkedin.com'),
      };
    }
    if (Array.isArray(b.customPages)) {
      db.settings.customPages = b.customPages;
    }

    recordAuditLog(db, req.authUser!, 'BRANDING_FOOTER_UPDATE', db.settings.brandName, 'Menus, Logo, Theme & Footer saved');
    saveDb(db);
    res.json({ settings: db.settings });
  });

  // ---------------- ATTENDANCE, PAYROLL & FINANCE ----------------

  router.get('/api/portal/attendance', requireAuth, requireRole(['admin', 'branch_manager', 'teacher', 'accountant', 'staff']), (_req, res) => {
    const db = getDb();
    res.json({ attendance: db.attendance });
  });

  router.post('/api/portal/attendance', requireAuth, requireRole(['admin', 'branch_manager', 'teacher', 'staff']), (req: AuthedRequest, res) => {
    const { targetType, targetId, branchId, batchId, date, status, checkInTime, checkOutTime } = req.body ?? {};
    const db = getDb();
    const targetUser = db.users.find((u) => u.id === targetId);
    if (!targetUser) return void res.status(404).json({ error: 'Student or staff user not found.' });

    const cleanDate = String(date || new Date().toISOString().slice(0, 10));
    const safeStatus = ['present', 'absent', 'late', 'leave'].includes(status) ? status : 'present';
    const existing = db.attendance.find(
      (a) => a.targetId === targetId && a.date === cleanDate
    );

    if (existing) {
      existing.status = safeStatus;
      if (checkInTime) existing.checkInTime = String(checkInTime);
      if (checkOutTime) existing.checkOutTime = String(checkOutTime);
      existing.recordedBy = req.authUser!.name;
      saveDb(db);
      res.json({ record: existing, attendance: db.attendance });
      return;
    }

    const record: AttendanceRecord = {
      id: `att-${Date.now()}`,
      targetType: targetType === 'teacher' || targetType === 'staff' ? targetType : 'student',
      targetId: targetUser.id,
      targetName: targetUser.name,
      branchId: branchId ?? targetUser.branchId,
      batchId: batchId ?? null,
      date: cleanDate,
      status: safeStatus,
      checkInTime: String(checkInTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      checkOutTime: checkOutTime ? String(checkOutTime) : undefined,
      recordedBy: req.authUser!.name,
    };
    db.attendance.unshift(record);
    saveDb(db);
    res.status(201).json({ record, attendance: db.attendance });
  });

  router.post('/api/portal/payroll', requireAuth, requireRole(['admin', 'branch_manager', 'accountant']), (req: AuthedRequest, res) => {
    const { employeeId, monthKey, baseSalary, allowances, bonuses, deductions, advance } = req.body ?? {};
    const db = getDb();
    const emp = db.users.find((u) => u.id === employeeId);
    if (!emp) return void res.status(404).json({ error: 'Employee not found.' });

    const cleanMonth = String(monthKey || new Date().toISOString().slice(0, 7));
    if (db.payrolls.some((p) => p.employeeId === emp.id && p.monthKey === cleanMonth)) {
      res.status(409).json({
        error: `Duplicate payroll guard: Salary sheet for ${emp.name} (${cleanMonth}) already exists.`,
      });
      return;
    }

    const netSalary = calculateNetPayroll(
      Number(baseSalary) || 0,
      Number(allowances) || 0,
      Number(bonuses) || 0,
      Number(deductions) || 0,
      Number(advance) || 0
    );

    const payroll: PayrollRecord = {
      id: `pay-${Date.now()}`,
      employeeId: emp.id,
      employeeName: emp.name,
      role: emp.role,
      branchId: emp.branchId,
      monthKey: cleanMonth,
      baseSalary: Number(baseSalary) || 0,
      allowances: Number(allowances) || 0,
      bonuses: Number(bonuses) || 0,
      deductions: Number(deductions) || 0,
      advance: Number(advance) || 0,
      netSalary,
      status: 'pending',
    };
    db.payrolls.unshift(payroll);
    recordAuditLog(db, req.authUser!, 'PAYROLL_GENERATE', `${emp.name} (${cleanMonth})`, `Net ৳${netSalary}`);
    saveDb(db);
    res.status(201).json({ payroll, payrolls: db.payrolls });
  });

  router.patch('/api/portal/payroll/:id', requireAuth, requireRole(['admin', 'branch_manager', 'accountant']), (req: AuthedRequest, res) => {
    const db = getDb();
    const pr = db.payrolls.find((p) => p.id === req.params.id);
    if (!pr) return void res.status(404).json({ error: 'Payroll record not found.' });
    const nextStatus = req.body?.status;
    if (['pending', 'approved', 'paid'].includes(nextStatus)) {
      pr.status = nextStatus;
      if (nextStatus === 'paid') {
        pr.paidAt = new Date().toISOString();
        db.financialRecords.unshift({
          id: `fin-${Date.now()}`,
          type: 'expense',
          category: 'Staff Payroll',
          title: `Salary Paid: ${pr.employeeName} (${pr.monthKey})`,
          amount: pr.netSalary,
          branchId: pr.branchId,
          date: new Date().toISOString().slice(0, 10),
          recordedBy: req.authUser!.name,
        });
      }
    }
    saveDb(db);
    res.json({ payroll: pr, payrolls: db.payrolls });
  });

  router.post('/api/portal/finance', requireAuth, requireRole(['admin', 'branch_manager', 'accountant']), (req: AuthedRequest, res) => {
    const { type, category, title, amount, branchId } = req.body ?? {};
    if (!String(title ?? '').trim() || Number(amount) <= 0) {
      res.status(400).json({ error: 'Valid entry title and positive amount are required.' });
      return;
    }
    const db = getDb();
    const entry = {
      id: `fin-${Date.now()}`,
      type: (['income', 'expense', 'refund'].includes(type) ? type : 'expense') as 'income' | 'expense' | 'refund',
      category: String(category || 'General').trim(),
      title: String(title).trim(),
      amount: Math.round(Number(amount)),
      branchId: branchId || req.authUser!.branchId,
      date: new Date().toISOString().slice(0, 10),
      recordedBy: req.authUser!.name,
    };
    db.financialRecords.unshift(entry);
    saveDb(db);
    res.status(201).json({ entry, financialRecords: db.financialRecords });
  });

  // ---------------- SECURITY BACKUPS, RECYCLE BIN & AUDIT LOGS ----------------

  router.get('/api/portal/security', requireAuth, requireRole(['admin']), (_req, res) => {
    const db = getDb();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      backups: db.backups.map(({ payloadJson: _ignored, ...meta }) => meta),
      recycleBin: db.recycleBin,
      auditLogs: db.auditLogs.slice(0, 80),
      plugins: db.plugins,
      webhooks: db.webhooks,
      campaigns: db.campaigns,
      refreshedAt: new Date().toISOString(),
    });
  });

  router.get('/api/portal/recycle-bin', requireAuth, requireRole(['admin']), (_req, res) => {
    const db = getDb();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ recycleBin: db.recycleBin, refreshedAt: new Date().toISOString() });
  });

  router.post('/api/portal/backups', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const label = String(req.body?.label ?? `Manual Snapshot ${new Date().toLocaleTimeString()}`).trim();
    const snapshot = createVerifiedBackupSnapshot(db, req.authUser!.name, label, 'manual');
    recordAuditLog(db, req.authUser!, 'BACKUP_CREATE', snapshot.id, `SHA256 ${snapshot.checksumSha256.slice(0, 12)}...`);
    saveDb(db);
    const { payloadJson: _ignored, ...meta } = snapshot;
    res.status(201).json({ backup: meta });
  });

  router.post('/api/portal/backups/:id/verify', requireAuth, requireRole(['admin']), (req, res) => {
    const db = getDb();
    const bkp = db.backups.find((b) => b.id === req.params.id);
    if (!bkp) return void res.status(404).json({ error: 'Backup snapshot not found.' });
    const ok = verifyBackupSnapshotIntegrity(bkp);
    bkp.verified = ok;
    saveDb(db);
    res.json({ id: bkp.id, verified: ok, checksumSha256: bkp.checksumSha256 });
  });

  router.post('/api/portal/backups/:id/restore', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const target = db.backups.find((b) => b.id === req.params.id);
    if (!target || !target.payloadJson) {
      res.status(404).json({ error: 'Backup payload not found.' });
      return;
    }
    if (!verifyBackupSnapshotIntegrity(target)) {
      res.status(400).json({ error: 'Backup SHA-256 checksum verification failed! Restore aborted for data safety.' });
      return;
    }
    createVerifiedBackupSnapshot(db, req.authUser!.name, 'Safety Pre-Restore Snapshot', 'pre_restore');
    const keptBackups = [...db.backups];
    const restored = JSON.parse(target.payloadJson);
    restored.backups = keptBackups;
    recordAuditLog(restored, req.authUser!, 'BACKUP_RESTORE', target.id, target.label);
    saveDb(restored);
    res.json({ ok: true, restoredFrom: target.label });
  });

  router.post('/api/portal/system/reset', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    // Always verify and persist a pre-reset recovery backup before resetting state!
    const preReset = createVerifiedBackupSnapshot(
      db,
      req.authUser!.name,
      `Auto Pre-Reset Recovery (${new Date().toISOString().slice(0, 16)})`,
      'pre_reset'
    );
    if (!verifyBackupSnapshotIntegrity(preReset)) {
      res.status(500).json({ error: 'Pre-reset recovery backup verification failed. Reset aborted.' });
      return;
    }
    const keptBackups = [...db.backups];
    const fresh = resetDbToDefaults();
    fresh.backups = keptBackups;
    recordAuditLog(fresh, req.authUser!, 'SYSTEM_RESET_SAFE', 'Database', `Verified pre-reset backup ${preReset.id}`);
    saveDb(fresh);
    const { payloadJson: _ignored, ...meta } = preReset;
    res.json({ ok: true, preResetBackup: meta });
  });

  router.post('/api/portal/recycle-bin/:id/restore', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.recycleBin.findIndex((item) => item.id === req.params.id);
    if (idx === -1) return void res.status(404).json({ error: 'Recycle Bin item not found.' });
    const [item] = db.recycleBin.splice(idx, 1);
    const snap = item.snapshot as any;

    if (item.entityType === 'course' && !db.courses.some((x) => x.id === snap.id)) db.courses.unshift(snap);
    else if (item.entityType === 'batch' && !db.batches.some((x) => x.id === snap.id)) db.batches.unshift(snap);
    else if (item.entityType === 'lesson' && !db.lessons.some((x) => x.id === snap.id)) db.lessons.unshift(snap);
    else if (item.entityType === 'exam' && !db.exams.some((x) => x.id === snap.id)) db.exams.unshift(snap);
    else if (item.entityType === 'product' && !db.products.some((x) => x.id === snap.id)) db.products.unshift(snap);
    else if (item.entityType === 'ebook' && !db.ebooks.some((x) => x.id === snap.id)) db.ebooks.unshift(snap);
    else if (item.entityType === 'review' && !db.reviews.some((x) => x.id === snap.id)) db.reviews.unshift(snap);
    else if (item.entityType === 'post' && !db.posts.some((x) => x.id === snap.id)) db.posts.unshift(snap);
    else if (item.entityType === 'question' && !db.questionBank.some((x) => x.id === snap.id)) db.questionBank.unshift(snap);
    else if (item.entityType === 'instructor' && !db.instructors.some((x) => x.id === snap.id)) db.instructors.unshift(snap);
    else if (item.entityType === 'category' && !db.categories.some((x) => x.id === snap.id)) db.categories.unshift(snap);
    else if (item.entityType === 'coupon' && !db.coupons.some((x) => x.code === snap.code)) db.coupons.unshift(snap);
    else if (item.entityType === 'branch' && !db.branches.some((x) => x.id === snap.id)) db.branches.push(snap);
    else if (item.entityType === 'payment_gateway' && !db.paymentGateways.some((x) => x.id === snap.id)) db.paymentGateways.push(snap);
    else if (item.entityType === 'plugin' && !db.plugins.some((x) => x.id === snap.id)) db.plugins.unshift(snap);

    recordAuditLog(db, req.authUser!, 'RECYCLE_BIN_RESTORE', item.entityType, item.label);
    saveDb(db);
    res.json({ restored: item, recycleBin: db.recycleBin });
  });

  router.delete('/api/portal/recycle-bin/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    db.recycleBin = db.recycleBin.filter((item) => item.id !== req.params.id);
    saveDb(db);
    res.json({ recycleBin: db.recycleBin });
  });

  // ---------------- DEDICATED PAYMENT GATEWAYS & TRANSACTIONS ----------------

  router.get('/api/portal/payment-gateways', requireAuth, requireRole(['admin', 'branch_manager', 'accountant']), (_req, res) => {
    const db = getDb();
    res.json({ paymentGateways: db.paymentGateways ?? [], transactions: db.transactions ?? [] });
  });

  router.post('/api/portal/payment-gateways', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const name = String(b.name ?? '').trim();
    const code = String(b.code ?? name).trim();
    if (!name || !code) {
      res.status(400).json({ error: 'Gateway name and code are required.' });
      return;
    }
    const db = getDb();
    if (db.paymentGateways.some((g) => g.code.toLowerCase() === code.toLowerCase())) {
      res.status(409).json({ error: `Payment gateway code "${code}" already exists.` });
      return;
    }
    const providerType = ['mobile_wallet', 'card_gateway', 'bank_transfer', 'cash_desk'].includes(b.providerType)
      ? b.providerType
      : 'mobile_wallet';
    const gateway: PaymentGatewayConfig = {
      id: `pg-${Date.now()}`,
      code,
      name,
      subtitle: String(b.subtitle ?? 'Verified Payment Gateway').trim(),
      providerType,
      merchantAccount: String(b.merchantAccount ?? 'Merchant Account').trim(),
      instructions: String(b.instructions ?? 'Complete payment and submit your Transaction ID.').trim(),
      mode: b.mode === 'live' ? 'live' : 'sandbox',
      feePercent: Math.max(0, Math.min(20, Number(b.feePercent) || 0)),
      apiKeyMasked: maskSecretValue(String(b.apiKey ?? ''), 'Not Configured'),
      webhookSecretMasked: maskSecretValue(String(b.webhookSecret ?? ''), 'Not Configured'),
      active: b.active !== false,
      sortOrder: db.paymentGateways.length + 1,
    };
    db.paymentGateways.push(gateway);
    recordAuditLog(db, req.authUser!, 'PAYMENT_GATEWAY_CREATE', gateway.name, `${gateway.code} (${gateway.mode})`);
    saveDb(db);
    res.status(201).json({ gateway, paymentGateways: db.paymentGateways });
  });

  router.put('/api/portal/payment-gateways/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const gw = db.paymentGateways.find((g) => g.id === req.params.id);
    if (!gw) return void res.status(404).json({ error: 'Payment gateway not found.' });
    const b = req.body ?? {};
    if (typeof b.name === 'string' && b.name.trim()) gw.name = b.name.trim();
    if (typeof b.subtitle === 'string') gw.subtitle = b.subtitle.trim();
    if (['mobile_wallet', 'card_gateway', 'bank_transfer', 'cash_desk'].includes(b.providerType)) {
      gw.providerType = b.providerType;
    }
    if (typeof b.merchantAccount === 'string') gw.merchantAccount = b.merchantAccount.trim();
    if (typeof b.instructions === 'string') gw.instructions = b.instructions.trim();
    if (b.mode === 'live' || b.mode === 'sandbox') gw.mode = b.mode;
    if (b.feePercent !== undefined) gw.feePercent = Math.max(0, Math.min(20, Number(b.feePercent) || 0));
    if (typeof b.apiKey === 'string' && b.apiKey.trim()) {
      gw.apiKeyMasked = maskSecretValue(b.apiKey, gw.apiKeyMasked);
    }
    if (typeof b.webhookSecret === 'string' && b.webhookSecret.trim()) {
      gw.webhookSecretMasked = maskSecretValue(b.webhookSecret, gw.webhookSecretMasked);
    }
    if (typeof b.active === 'boolean') gw.active = b.active;
    if (b.sortOrder !== undefined) gw.sortOrder = Math.max(1, Number(b.sortOrder) || gw.sortOrder);

    recordAuditLog(db, req.authUser!, 'PAYMENT_GATEWAY_UPDATE', gw.name, `${gw.mode} · ${gw.active ? 'Active' : 'Inactive'}`);
    saveDb(db);
    res.json({ gateway: gw, paymentGateways: db.paymentGateways });
  });

  router.patch('/api/portal/payment-gateways/:id/status', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const gw = db.paymentGateways.find((g) => g.id === req.params.id);
    if (!gw) return void res.status(404).json({ error: 'Payment gateway not found.' });
    gw.active = typeof req.body?.active === 'boolean' ? req.body.active : !gw.active;
    recordAuditLog(db, req.authUser!, 'PAYMENT_GATEWAY_STATUS', gw.name, gw.active ? 'Activated' : 'Deactivated');
    saveDb(db);
    res.json({ gateway: gw, paymentGateways: db.paymentGateways });
  });

  router.delete('/api/portal/payment-gateways/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.paymentGateways.findIndex((g) => g.id === req.params.id);
    if (idx === -1) return void res.status(404).json({ error: 'Payment gateway not found.' });
    const [removed] = db.paymentGateways.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      entityType: 'payment_gateway',
      originalId: removed.id,
      label: `${removed.name} (${removed.code})`,
      deletedBy: req.authUser!.name,
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    recordAuditLog(db, req.authUser!, 'PAYMENT_GATEWAY_DELETE', removed.name, 'Moved to Recycle Bin');
    saveDb(db);
    res.json({ deletedId: removed.id, paymentGateways: db.paymentGateways });
  });

  router.patch('/api/portal/payments/transactions/:id/status', requireAuth, requireRole(['admin', 'branch_manager', 'accountant']), (req: AuthedRequest, res) => {
    const db = getDb();
    const txn = db.transactions.find((t) => t.id === req.params.id);
    if (!txn) return void res.status(404).json({ error: 'Payment transaction not found.' });
    const nextStatus = req.body?.status;
    if (!['completed', 'pending_verification', 'refunded'].includes(nextStatus)) {
      res.status(400).json({ error: 'Invalid transaction status.' });
      return;
    }
    const prev = txn.status;
    txn.status = nextStatus;

    if (txn.referenceType === 'course') {
      const enr = db.enrollments.find((e) => e.id === txn.referenceId);
      if (enr) {
        if (nextStatus === 'completed' && enr.status !== 'approved') {
          enr.status = 'approved';
          const course = db.courses.find((c) => c.id === enr.courseId);
          if (course) course.enrolledCount += 1;
        } else if (nextStatus === 'refunded') {
          enr.status = 'rejected';
        }
      }
    } else if (txn.referenceType === 'ebook') {
      const existing = db.claimedEbooksByUser[txn.userId] ?? [];
      const ebook = db.ebooks.find((e) => e.id === txn.referenceId);
      if (nextStatus === 'completed' && !existing.includes(txn.referenceId)) {
        existing.push(txn.referenceId);
        db.claimedEbooksByUser[txn.userId] = existing;
        if (ebook) ebook.salesCount = (ebook.salesCount ?? 0) + 1;
      } else if (nextStatus === 'refunded') {
        db.claimedEbooksByUser[txn.userId] = existing.filter((id) => id !== txn.referenceId);
      }
    }

    if (prev !== 'refunded' && nextStatus === 'refunded') {
      db.financialRecords.unshift({
        id: `fin-${Date.now()}`,
        type: 'refund',
        category: 'Payment Refund',
        title: `Refund ${txn.invoiceNo} (${txn.gateway}) — ${txn.payerName}`,
        amount: txn.totalAmount,
        branchId: req.authUser!.branchId,
        date: new Date().toISOString().slice(0, 10),
        recordedBy: req.authUser!.name,
      });
    }

    recordAuditLog(db, req.authUser!, 'PAYMENT_TXN_STATUS', txn.invoiceNo, `${prev} -> ${nextStatus}`);
    saveDb(db);
    res.json({ transaction: txn, transactions: db.transactions });
  });

  // ---------------- OFFICIAL API CONNECTORS (PLUGINS) & WEBHOOKS ----------------

  router.post('/api/portal/plugins', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const name = String(b.name ?? '').trim();
    if (!name) return void res.status(400).json({ error: 'API connector name is required.' });
    const db = getDb();
    const allowedCats: ApiPlugin['category'][] = ['Payment', 'Live Video', 'AI', 'Marketing', 'LMS Widget', 'SMS & Messaging'];
    const category = allowedCats.includes(b.category) ? b.category : 'Marketing';
    const endpointUrl = b.endpointUrl ? sanitizeSafeUrl(String(b.endpointUrl), '') : '';
    const scopes = Array.isArray(b.scopes)
      ? b.scopes.map((s: unknown) => String(s).trim()).filter(Boolean)
      : String(b.scopes ?? 'api:read')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

    const plugin: ApiPlugin = {
      id: `plg-${Date.now()}`,
      name,
      category,
      version: String(b.version || '1.0.0').trim(),
      active: Boolean(b.active),
      environment: b.environment === 'production' ? 'production' : 'sandbox',
      endpointUrl: endpointUrl || 'https://api.alomsenglishcenter.com/connector',
      apiKeyMasked: maskSecretValue(String(b.apiKey ?? ''), 'Not Configured'),
      description: String(b.description || 'Custom external API connector').trim(),
      scopes: scopes.length ? scopes : ['api:read'],
    };
    db.plugins.unshift(plugin);
    recordAuditLog(db, req.authUser!, 'PLUGIN_CREATE', plugin.name, `${plugin.category} (${plugin.active ? 'Active' : 'Inactive'})`);
    saveDb(db);
    res.status(201).json({ plugin, plugins: db.plugins });
  });

  router.put('/api/portal/plugins/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const plg = db.plugins.find((p) => p.id === req.params.id);
    if (!plg) return void res.status(404).json({ error: 'API connector not found.' });
    const b = req.body ?? {};
    if (typeof b.name === 'string' && b.name.trim()) plg.name = b.name.trim();
    const allowedCats: ApiPlugin['category'][] = ['Payment', 'Live Video', 'AI', 'Marketing', 'LMS Widget', 'SMS & Messaging'];
    if (allowedCats.includes(b.category)) plg.category = b.category;
    if (typeof b.version === 'string' && b.version.trim()) plg.version = b.version.trim();
    if (typeof b.description === 'string') plg.description = b.description.trim();
    if (typeof b.endpointUrl === 'string') {
      plg.endpointUrl = sanitizeSafeUrl(b.endpointUrl, plg.endpointUrl || 'https://api.alomsenglishcenter.com');
    }
    if (b.environment === 'production' || b.environment === 'sandbox') {
      plg.environment = b.environment;
    }
    if (typeof b.apiKey === 'string' && b.apiKey.trim()) {
      plg.apiKeyMasked = maskSecretValue(b.apiKey, plg.apiKeyMasked || 'Not Configured');
    }
    if (b.scopes !== undefined) {
      const nextScopes = Array.isArray(b.scopes)
        ? b.scopes.map((s: unknown) => String(s).trim()).filter(Boolean)
        : String(b.scopes)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
      if (nextScopes.length) plg.scopes = nextScopes;
    }
    if (typeof b.active === 'boolean') plg.active = b.active;

    recordAuditLog(db, req.authUser!, 'PLUGIN_UPDATE', plg.name, `${plg.environment ?? 'sandbox'} · ${plg.active ? 'Active' : 'Inactive'}`);
    saveDb(db);
    res.json({ plugin: plg, plugins: db.plugins });
  });

  router.patch('/api/portal/plugins/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const plg = db.plugins.find((p) => p.id === req.params.id);
    if (!plg) return void res.status(404).json({ error: 'Plugin not found.' });
    const nextActive = typeof req.body?.active === 'boolean' ? req.body.active : !plg.active;
    const depCheck = validatePluginDependencies(db.plugins as any, plg.id, nextActive);
    if (!depCheck.ok) {
      res.status(400).json({ error: depCheck.error });
      return;
    }
    plg.active = nextActive;
    recordAuditLog(db, req.authUser!, 'PLUGIN_TOGGLE', plg.name, plg.active ? 'Activated' : 'Deactivated');
    saveDb(db);
    res.json({ plugin: plg, plugins: db.plugins });
  });

  router.delete('/api/portal/plugins/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.plugins.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return void res.status(404).json({ error: 'API connector not found.' });
    const [removed] = db.plugins.splice(idx, 1);
    db.recycleBin.unshift({
      id: `bin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      entityType: 'plugin',
      originalId: removed.id,
      label: `${removed.name} (${removed.category})`,
      deletedBy: req.authUser!.name,
      deletedAt: new Date().toISOString(),
      snapshot: removed,
    });
    recordAuditLog(db, req.authUser!, 'PLUGIN_DELETE', removed.name, 'Moved to Recycle Bin');
    saveDb(db);
    res.json({ deletedId: removed.id, plugins: db.plugins });
  });

  router.post('/api/portal/webhooks', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const { name, url, event } = req.body ?? {};
    const safeUrl = sanitizeSafeUrl(String(url ?? ''), '');
    if (!String(name ?? '').trim() || !safeUrl) {
      res.status(400).json({ error: 'Valid webhook name and https:// URL are required.' });
      return;
    }
    const db = getDb();
    const webhook = {
      id: `wh-${Date.now()}`,
      name: String(name).trim(),
      url: safeUrl,
      event: String(event || 'enrollment.approved').trim(),
      active: req.body?.active !== false,
      lastStatus: req.body?.active === false ? 'Paused' : 'Ready',
      secretMasked: `whsec_••••${crypto.randomBytes(2).toString('hex')}`,
    };
    db.webhooks.unshift(webhook);
    recordAuditLog(db, req.authUser!, 'WEBHOOK_CREATE', webhook.name, webhook.event);
    saveDb(db);
    res.status(201).json({ webhook, webhooks: db.webhooks });
  });

  router.put('/api/portal/webhooks/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const wh = db.webhooks.find((w) => w.id === req.params.id);
    if (!wh) return void res.status(404).json({ error: 'Webhook not found.' });
    const { name, url, event, active } = req.body ?? {};
    if (typeof name === 'string' && name.trim()) wh.name = name.trim();
    if (typeof url === 'string' && url.trim()) {
      const safeUrl = sanitizeSafeUrl(url, '');
      if (!safeUrl) return void res.status(400).json({ error: 'Valid https:// webhook URL is required.' });
      wh.url = safeUrl;
    }
    if (typeof event === 'string' && event.trim()) wh.event = event.trim();
    if (typeof active === 'boolean') {
      wh.active = active;
      wh.lastStatus = active ? 'Ready' : 'Paused';
    }
    recordAuditLog(db, req.authUser!, 'WEBHOOK_UPDATE', wh.name, `${wh.event} (${wh.active ? 'Active' : 'Paused'})`);
    saveDb(db);
    res.json({ webhook: wh, webhooks: db.webhooks });
  });

  router.patch('/api/portal/webhooks/:id/status', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const wh = db.webhooks.find((w) => w.id === req.params.id);
    if (!wh) return void res.status(404).json({ error: 'Webhook not found.' });
    wh.active = typeof req.body?.active === 'boolean' ? req.body.active : !wh.active;
    wh.lastStatus = wh.active ? 'Ready' : 'Paused';
    recordAuditLog(db, req.authUser!, 'WEBHOOK_STATUS', wh.name, wh.active ? 'Activated' : 'Deactivated');
    saveDb(db);
    res.json({ webhook: wh, webhooks: db.webhooks });
  });

  router.delete('/api/portal/webhooks/:id', requireAuth, requireRole(['admin']), (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.webhooks.findIndex((w) => w.id === req.params.id);
    if (idx === -1) return void res.status(404).json({ error: 'Webhook not found.' });
    const [removed] = db.webhooks.splice(idx, 1);
    recordAuditLog(db, req.authUser!, 'WEBHOOK_DELETE', removed.name, removed.url);
    saveDb(db);
    res.json({ deletedId: removed.id, webhooks: db.webhooks });
  });

  router.post('/api/portal/campaigns', requireAuth, requireRole(['admin', 'branch_manager']), (req: AuthedRequest, res) => {
    const { title, channel, audience, message } = req.body ?? {};
    if (!String(title ?? '').trim() || !String(message ?? '').trim()) {
      res.status(400).json({ error: 'Campaign title and broadcast message are required.' });
      return;
    }
    const db = getDb();
    const camp = {
      id: `cmp-${Date.now()}`,
      title: String(title).trim(),
      channel: (['SMS', 'Email', 'WhatsApp', 'Notice'].includes(channel) ? channel : 'SMS') as 'SMS' | 'Email' | 'WhatsApp' | 'Notice',
      audience: String(audience || 'All Active Students').trim(),
      message: String(message).trim(),
      sentCount: db.users.length * 45,
      status: 'sent' as const,
      createdAt: new Date().toISOString(),
    };
    db.campaigns.unshift(camp);
    recordAuditLog(db, req.authUser!, 'BROADCAST_SEND', camp.title, `${camp.channel} -> ${camp.audience}`);
    saveDb(db);
    res.status(201).json({ campaign: camp, campaigns: db.campaigns });
  });

  return router;
}
