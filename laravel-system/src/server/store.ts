import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ApiPlugin,
  AppNotification,
  Assignment,
  AssignmentSubmission,
  AttendanceRecord,
  AuditLogEntry,
  AutomationWorkflow,
  BackupSnapshot,
  Branch,
  BroadcastCampaign,
  CategoryItem,
  CenterResultRecord,
  CertificateTemplate,
  CommunityPost,
  Coupon,
  Course,
  CourseBatch,
  CourseLesson,
  CrmContact,
  CustomRole,
  Ebook,
  Enrollment,
  Exam,
  ExamAttempt,
  FinancialRecord,
  FlashSaleConfig,
  GuardianTeacherMessage,
  HomepageConfig,
  Instructor,
  IssuedCertificate,
  LearnerRewardProfile,
  LoginHistoryEntry,
  NoticeItem,
  OmnichannelConversation,
  Order,
  PaymentGatewayConfig,
  PaymentTransaction,
  PayrollRecord,
  Product,
  QuestionBankItem,
  RecycleBinItem,
  ReferralRecord,
  Review,
  SaasTenant,
  ScheduledJobRecord,
  ScormAttempt,
  ScormPackage,
  SiteSettings,
  SpeakingSubmission,
  StudentFeeInvoice,
  SystemErrorLog,
  User,
  UserDashboardLayout,
  UserRole,
  WebhookConfig,
  WidgetUsageStat,
  WorkflowRunRecord,
} from '../types';
import { DEFAULT_HEADER_MENU, normalizeHeaderMenu } from '../lib/domain';
import { createEnterpriseSeedCollections } from './enterpriseSeed';
import { createExtendedSeedCollections } from './seedExtensions';

export interface StoredUser extends User {
  passwordHash: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string;
  branchId: string;
  message: string;
  createdAt: string;
}

export interface DatabaseState {
  settings: SiteSettings;
  branches: Branch[];
  users: StoredUser[];
  instructors: Instructor[];
  courses: Course[];
  batches: CourseBatch[];
  lessons: CourseLesson[];
  exams: Exam[];
  examAttempts: ExamAttempt[];
  questionBank: QuestionBankItem[];
  products: Product[];
  ebooks: Ebook[];
  categories: CategoryItem[];
  posts: CommunityPost[];
  scormPackages: ScormPackage[];
  scormAttempts: ScormAttempt[];
  rewardsByUser: Record<string, LearnerRewardProfile>;
  attendance: AttendanceRecord[];
  payrolls: PayrollRecord[];
  financialRecords: FinancialRecord[];
  paymentGateways: PaymentGatewayConfig[];
  transactions: PaymentTransaction[];
  enrollments: Enrollment[];
  orders: Order[];
  coupons: Coupon[];
  reviews: Review[];
  results: CenterResultRecord[];
  claimedEbooksByUser: Record<string, string[]>;
  contactMessages: ContactMessage[];
  backups: BackupSnapshot[];
  recycleBin: RecycleBinItem[];
  auditLogs: AuditLogEntry[];
  campaigns: BroadcastCampaign[];
  plugins: ApiPlugin[];
  webhooks: WebhookConfig[];
  customRoles: CustomRole[];
  loginHistory: LoginHistoryEntry[];
  assignments: Assignment[];
  assignmentSubmissions: AssignmentSubmission[];
  speakingSubmissions: SpeakingSubmission[];
  feeInvoices: StudentFeeInvoice[];
  certificateTemplates: CertificateTemplate[];
  certificates: IssuedCertificate[];
  notifications: AppNotification[];
  notices: NoticeItem[];
  guardianMessages: GuardianTeacherMessage[];
  saasTenants: SaasTenant[];
  workflows: AutomationWorkflow[];
  workflowRuns: WorkflowRunRecord[];
  crmContacts: CrmContact[];
  omnichannelConversations: OmnichannelConversation[];
  referrals: ReferralRecord[];
  flashSale: FlashSaleConfig;
  errorLogs: SystemErrorLog[];
  scheduledJobs: ScheduledJobRecord[];
  dashboardLayoutsByUser: Record<string, UserDashboardLayout>;
  widgetUsageStats: Record<string, WidgetUsageStat>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, key] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function sanitizeUser(user: StoredUser): User {
  const { passwordHash: _ignored, ...safe } = user;
  return safe;
}

function createInitialState(): DatabaseState {
  const demoPass = 'Aloms@2026';

  const branches: Branch[] = [
    {
      id: 'br-mirpur',
      name: 'Mirpur DOHS Main Campus',
      code: 'AEC-MPR',
      city: 'Dhaka',
      address: 'House 42, Road 6/A, Avenue 8, Mirpur DOHS, Dhaka',
      phone: '09617331133',
      managerName: 'Tariqul Islam',
      activeStudents: 1420,
      status: 'active',
    },
    {
      id: 'br-uttara',
      name: 'Uttara Sector 7 Campus',
      code: 'AEC-UTR',
      city: 'Dhaka',
      address: 'Level 4, Plot 18, Road 12, Sector 7, Uttara, Dhaka',
      phone: '01711002233',
      managerName: 'Nusrat Jahan',
      activeStudents: 980,
      status: 'active',
    },
    {
      id: 'br-ctg',
      name: 'Chattogram GEC Campus',
      code: 'AEC-CTG',
      city: 'Chattogram',
      address: 'Suite 502, Academic Plaza, GEC Circle, Chattogram',
      phone: '01811004455',
      managerName: 'Sajid Chowdhury',
      activeStudents: 760,
      status: 'active',
    },
  ];

  const users: StoredUser[] = [
    {
      id: 'u-super-admin',
      name: 'Dr. Alomgir Hossain (Super Admin)',
      email: 'superadmin@alomsenglish.com',
      phone: '01710000000',
      role: 'super_admin',
      status: 'active',
      branchId: null,
      referralCode: 'AEC-SUPER10',
      avatar: '/src/assets/images/instructor_portrait_lead_1795411661581.jpg',
      passwordHash: hashPassword(demoPass),
      createdAt: '2026-01-01T09:00:00.000Z',
    },
    {
      id: 'u-admin',
      name: 'Alomgir Hossain',
      email: 'admin@alomsenglish.com',
      phone: '01710000001',
      role: 'admin',
      status: 'active',
      branchId: null,
      referralCode: 'AEC-ADMIN10',
      avatar: '/src/assets/images/instructor_portrait_lead_1795411661581.jpg',
      passwordHash: hashPassword(demoPass),
      createdAt: '2026-01-05T09:00:00.000Z',
    },
    {
      id: 'u-manager',
      name: 'Tariqul Islam',
      email: 'manager@alomsenglish.com',
      phone: '01710000002',
      role: 'branch_manager',
      status: 'active',
      branchId: 'br-mirpur',
      passwordHash: hashPassword(demoPass),
      createdAt: '2026-01-06T09:00:00.000Z',
    },
    {
      id: 'u-teacher',
      name: 'Mahmudul Hasan',
      email: 'teacher@alomsenglish.com',
      phone: '01710000003',
      role: 'teacher',
      status: 'active',
      branchId: 'br-mirpur',
      qualification: 'MA in ELT, Jahangirnagar University',
      subjects: ['HSC English', 'Grammar Pro', 'Phonetics'],
      avatar: '/src/assets/images/instructor_portrait_lead_1795411661581.jpg',
      passwordHash: hashPassword(demoPass),
      createdAt: '2026-01-07T09:00:00.000Z',
    },
    {
      id: 'u-accountant',
      name: 'Rashida Begum (Accountant)',
      email: 'accountant@alomsenglish.com',
      phone: '01710000007',
      role: 'accountant',
      status: 'active',
      branchId: 'br-mirpur',
      passwordHash: hashPassword(demoPass),
      createdAt: '2026-01-08T09:00:00.000Z',
    },
    {
      id: 'u-staff',
      name: 'Mehedi Hasan (Front Desk Staff)',
      email: 'staff@alomsenglish.com',
      phone: '01710000008',
      role: 'staff',
      status: 'active',
      branchId: 'br-mirpur',
      passwordHash: hashPassword(demoPass),
      createdAt: '2026-01-09T09:00:00.000Z',
    },
    {
      id: 'u-student',
      name: 'Arafat Rahman',
      email: 'student@alomsenglish.com',
      phone: '01710000004',
      role: 'student',
      status: 'active',
      branchId: 'br-mirpur',
      rollNumber: 'AEC-2026-101',
      studentCode: 'STU-MPR-0101',
      admissionStatus: 'active',
      referralCode: 'AEC-ARAFAT10',
      referralEarnings: 250,
      documents: [
        {
          id: 'doc-1',
          title: 'AEC Student Admission Card 2026',
          type: 'ID Card',
          url: '/images/aec-logo.png',
          uploadedAt: '2026-01-10T09:00:00.000Z',
        },
      ],
      passwordHash: hashPassword(demoPass),
      createdAt: '2026-01-10T09:00:00.000Z',
    },
    {
      id: 'u-student-2',
      name: 'Farhana Yasmin',
      email: 'farhana@alomsenglish.com',
      phone: '01710000006',
      role: 'student',
      status: 'active',
      branchId: 'br-uttara',
      rollNumber: 'AEC-2026-102',
      studentCode: 'STU-UTR-0102',
      admissionStatus: 'active',
      referredByCode: 'AEC-ARAFAT10',
      passwordHash: hashPassword(demoPass),
      createdAt: '2026-01-12T09:00:00.000Z',
    },
    {
      id: 'u-guardian',
      name: 'Kamrul Hasan (Guardian)',
      email: 'guardian@alomsenglish.com',
      phone: '01710000005',
      role: 'guardian',
      status: 'active',
      branchId: 'br-mirpur',
      guardianLinkedStudentIds: ['u-student'],
      passwordHash: hashPassword(demoPass),
      createdAt: '2026-01-11T09:00:00.000Z',
    },
  ];

  const instructors: Instructor[] = [
    {
      id: 'inst-1',
      name: 'Alomgir Hossain',
      subject: 'English Grammar & IELTS',
      roleTitle: 'Founder & Lead Mentor, Aloms English Center',
      education: 'MA in English Literature, University of Dhaka',
      panel: 'Head Faculty',
      branchId: 'br-mirpur',
      bio: '12+ years coaching HSC, SSC, IELTS Band 8+ and University Admission English across Bangladesh.',
      avatar: '/src/assets/images/instructor_portrait_lead_1795411661581.jpg',
    },
    {
      id: 'inst-2',
      name: 'Mahmudul Hasan',
      subject: 'HSC & Admission English',
      roleTitle: 'Senior Lecturer, Academic English',
      education: 'BA (Hons), MA in ELT, Jahangirnagar University',
      panel: 'Head Faculty',
      branchId: 'br-mirpur',
      bio: 'Specialist in Right Form of Verbs, Modifiers, Clauses, and DU B-Unit English.',
      avatar: '/src/assets/images/hero_hsc_english_1795411661478.jpg',
    },
    {
      id: 'inst-3',
      name: 'Sabrina Karim',
      subject: 'Spoken English & Phonetics',
      roleTitle: 'Head of Fluency & Pronunciation',
      education: 'CELTA Certified, North South University',
      panel: 'Head Faculty',
      branchId: 'br-uttara',
      bio: 'Helps shy learners speak confident natural English through structured shadowing drills.',
      avatar: '/src/assets/images/hero_spoken_grammar_1795411660470.jpg',
    },
    {
      id: 'inst-4',
      name: 'Nafis Ahmed',
      subject: 'IELTS Writing & Reading',
      roleTitle: 'IELTS Band 8.5 Trainer',
      education: 'TESOL Certified, BRAC University',
      panel: 'Head Faculty',
      branchId: 'br-mirpur',
      bio: 'Reviewed over 4,500 IELTS Task 1 & Task 2 essays with Band 7.5+ student outcomes.',
      avatar: '/src/assets/images/hero_ielts_batch_1795411661577.jpg',
    },
    {
      id: 'inst-5',
      name: 'Tasnim Tabassum',
      subject: 'SSC English 1st & 2nd Paper',
      roleTitle: 'Branch Faculty Coordinator',
      education: 'English, University of Chittagong',
      panel: 'Branch Faculty',
      branchId: 'br-ctg',
      bio: 'Focused on board-standard paragraph, formal letter, and passage comprehension mastery.',
      avatar: '/src/assets/images/hero_spoken_grammar_1795411660470.jpg',
    },
    {
      id: 'inst-6',
      name: 'Rashedul Bari',
      subject: 'Vocabulary & Critical Reading',
      roleTitle: 'Admission English Mentor',
      education: 'IBA, University of Dhaka',
      panel: 'Branch Faculty',
      branchId: 'br-uttara',
      bio: 'Guides IBA, BUP, and Medical English candidates with root-word vocabulary systems.',
      avatar: '/src/assets/images/instructor_portrait_lead_1795411661581.jpg',
    },
  ];

  const courses: Course[] = [
    {
      id: 'crs-frpb-ssc',
      slug: 'ssc-english-final-revision',
      title: 'Final Revision Premium Batch for SSC-27 (English 1st & 2nd)',
      subtitle: 'Complete SSC Board Grammar, Writing & CQ/MCQ Mastery',
      category: 'SSC English',
      levelTag: 'SSC 27',
      isCombo: false,
      price: 2490,
      originalPrice: 3800,
      enrolledCount: 8920,
      examSystemIncluded: true,
      branchIds: ['br-mirpur', 'br-uttara', 'br-ctg'],
      instructorIds: ['inst-1', 'inst-2', 'inst-5'],
      thumbnail: '/src/assets/images/hero_hsc_english_1795411661478.jpg',
      description:
        'প্রিয় SSC 27 ব্যাচের শিক্ষার্থীরা, ইংরেজি ১ম ও ২য় পত্রে A+ নিশ্চিত করতে Aloms English Center নিয়ে এসেছে সম্পূর্ণ সিলেবাসের Final Revision Premium Batch। এখানে প্রতিটি Grammar টপিক একদম বেসিক থেকে বোর্ড পরীক্ষার প্রশ্ন সমাধানসহ শেখানো হবে এবং প্রতিটি অধ্যায়ের পর থাকবে লাইভ MCQ ও Written মডেল টেস্ট।',
      highlights: [
        '65+ Live & Recorded Concept Classes',
        '100% Board Grammar & Freehand Writing Coverage',
        'Weekly Model Test + Instant Merit List',
        'Printable PDF Lecture Sheets & Suggestion Book',
      ],
      demoVideoTitle: 'SSC English 2nd Paper: Completing Sentence & Suffix-Prefix Tricks',
      demoYoutubeUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
      status: 'active',
    },
    {
      id: 'crs-hsc-combo',
      slug: 'hsc-english-complete-combo',
      title: 'HSC 27-28 English 1st & 2nd Paper + Spoken Combo',
      subtitle: 'All-in-One Academic & Fluency Bundle for College Students',
      category: 'Combo Packs',
      levelTag: 'HSC 27',
      isCombo: true,
      includedCourses: [
        'HSC English 1st Paper Textual Mastery',
        'HSC English 2nd Paper Grammar Pro',
        'Freehand Writing & Flow Chart Lab',
      ],
      price: 3490,
      originalPrice: 5200,
      enrolledCount: 6410,
      examSystemIncluded: true,
      branchIds: ['br-mirpur', 'br-uttara', 'br-ctg'],
      instructorIds: ['inst-1', 'inst-2', 'inst-3'],
      thumbnail: '/src/assets/images/hero_ielts_batch_1795411661577.jpg',
      description:
        'HSC প্রথম ও দ্বিতীয় বর্ষের শিক্ষার্থীদের জন্য সম্পূর্ণ Academic English প্যাকেজ। Seen/Unseen Passage, Flow Chart, Summary থেকে শুরু করে Modifiers, Preposition, Connectors এবং Narration—সবকিছু ধাপে ধাপে শেখানো হয়।',
      highlights: [
        '3 Full Courses Included in One Bundle',
        '24/7 Doubt Solving & Guardian Progress Report',
        '30+ Chapter-wise Board Standard MCQ + CQ Exams',
        'Online + Any AEC Branch Hybrid Support',
      ],
      demoVideoTitle: 'HSC Modifiers & Connectors in 20 Minutes',
      demoYoutubeUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
      status: 'active',
    },
    {
      id: 'crs-ielts-pro',
      slug: 'ielts-band-8-pro',
      title: 'IELTS Academic & GT Complete Band 8.0 Mastery',
      subtitle: 'Listening, Reading, Writing Task 1 & 2, and 1-on-1 Speaking',
      category: 'IELTS & Spoken',
      levelTag: 'IELTS',
      isCombo: false,
      price: 4990,
      originalPrice: 7500,
      enrolledCount: 4180,
      examSystemIncluded: true,
      branchIds: ['br-mirpur', 'br-uttara'],
      instructorIds: ['inst-1', 'inst-4', 'inst-3'],
      thumbnail: '/src/assets/images/hero_spoken_grammar_1795411660470.jpg',
      description:
        'Target Band 7.5 to 8.5 with structured IELTS Writing Task 1 & Task 2 feedback, full computer-delivered mock tests, and live speaking mock interviews with certified trainers.',
      highlights: [
        '10 Full Computer-Delivered Mock Tests',
        '12 Evaluated Writing Task Scripts with Line Feedback',
        'Live 1-on-1 Speaking Mock Interviews',
        'Band 8+ Vocabulary & Cue Card Bank',
      ],
      demoVideoTitle: 'IELTS Writing Task 2: How to Score Band 8 in Coherence',
      demoYoutubeUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
      status: 'active',
    },
    {
      id: 'crs-spoken-fluency',
      slug: 'spoken-english-phonetics',
      title: 'Spoken English & British/Neutral Phonetics Zero to Pro',
      subtitle: 'Speak Confidently in Interviews, Presentations & Daily Life',
      category: 'IELTS & Spoken',
      levelTag: 'Spoken',
      isCombo: false,
      price: 1990,
      originalPrice: 3000,
      enrolledCount: 7350,
      examSystemIncluded: true,
      branchIds: ['br-mirpur', 'br-uttara', 'br-ctg'],
      instructorIds: ['inst-3', 'inst-1'],
      thumbnail: '/src/assets/images/hero_spoken_grammar_1795411660470.jpg',
      description:
        'ইংরেজিতে কথা বলতে জড়তা দূর করতে এবং প্রাত্যহিক জীবন, চাকরির ইন্টারভিউ ও প্রেজেন্টেশনে সাবলীলভাবে ইংরেজি বলার জন্য তৈরি এই কোর্স।',
      highlights: [
        '40 Practical Speaking Drills & IPA Pronunciation',
        'Daily Situational Dialogues & Roleplay',
        'Live Speaking Club Access at All Branches',
      ],
      demoVideoTitle: 'How to Think in English Without Translating Word by Word',
      demoYoutubeUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
      status: 'active',
    },
    {
      id: 'crs-grammar-pro',
      slug: 'english-grammar-basic-to-pro',
      title: 'English Grammar Basic to Pro (Class 8 to University)',
      subtitle: 'Master Tense, Clause, Voice, Narration & Sentence Structure',
      category: 'Grammar Pro',
      levelTag: 'All Levels',
      isCombo: false,
      price: 1490,
      originalPrice: 2400,
      enrolledCount: 9540,
      examSystemIncluded: true,
      branchIds: ['br-mirpur', 'br-uttara', 'br-ctg'],
      instructorIds: ['inst-1', 'inst-2'],
      thumbnail: '/src/assets/images/course_english_books_1795411661325.jpg',
      description:
        'যাদের ইংরেজি গ্রামারের বেসিক দুর্বল, তাদের জন্য একদম শূন্য থেকে শুরু করে অ্যাডভান্সড লেভেল পর্যন্ত গাইডলাইন ও প্র্যাকটিস শিটসহ কমপ্লিট গ্রামার কোর্স।',
      highlights: [
        '50 Structured Grammar Modules',
        '1,500+ Practice MCQs with Explanations',
        'Lifetime Printable Grammar Handouts',
      ],
      demoVideoTitle: 'Parts of Speech & Clause Identification Shortcut',
      demoYoutubeUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
      status: 'active',
    },
    {
      id: 'crs-admission-du',
      slug: 'university-admission-english',
      title: 'DU, IBA & Medical Admission English Thunder Batch',
      subtitle: 'High-Yield Admission Grammar, Pinpoint Error & Vocabulary',
      category: 'Admission',
      levelTag: 'Admission',
      isCombo: false,
      price: 2990,
      originalPrice: 4500,
      enrolledCount: 5120,
      examSystemIncluded: true,
      branchIds: ['br-mirpur', 'br-uttara', 'br-ctg'],
      instructorIds: ['inst-2', 'inst-6'],
      thumbnail: '/src/assets/images/hero_ielts_batch_1795411661577.jpg',
      description:
        'ঢাকা বিশ্ববিদ্যালয়, গুচ্ছ, মেডিক্যাল ও বিইউপি ভর্তি পরীক্ষার জন্য বিগত ২০ বছরের প্রশ্ন বিশ্লেষণসহ স্পেশাল ইংরেজি কোর্স।',
      highlights: [
        'DU, RU, CU, JU & Medical Past Paper Solved',
        'Pinpoint Error & Analogy Special Classes',
        'Daily Timed Admission Mock Exams',
      ],
      demoVideoTitle: 'DU B-Unit Pinpoint Error Detection Strategy',
      demoYoutubeUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
      status: 'active',
    },
  ];

  const batches: CourseBatch[] = [
    {
      id: 'bat-ssc-mpr-1',
      courseId: 'crs-frpb-ssc',
      name: 'SSC-27 Mirpur Evening Batch A',
      code: 'SSC27-MPR-A',
      branchId: 'br-mirpur',
      instructorId: 'inst-1',
      schedule: 'Sun · Tue · Thu — 4:30 PM',
      startDate: '2026-04-05',
      seatLimit: 60,
      enrolledSeats: 44,
      mode: 'Hybrid',
      status: 'running',
    },
    {
      id: 'bat-ssc-online-1',
      courseId: 'crs-frpb-ssc',
      name: 'SSC-27 Nationwide Live Batch',
      code: 'SSC27-ONL-1',
      branchId: 'br-mirpur',
      instructorId: 'inst-2',
      schedule: 'Sat · Mon · Wed — 8:00 PM',
      startDate: '2026-04-10',
      seatLimit: 250,
      enrolledSeats: 185,
      mode: 'Online Live',
      status: 'open',
    },
    {
      id: 'bat-hsc-utr-1',
      courseId: 'crs-hsc-combo',
      name: 'HSC-27 Uttara Morning Batch',
      code: 'HSC27-UTR-1',
      branchId: 'br-uttara',
      instructorId: 'inst-2',
      schedule: 'Fri · Sat — 10:00 AM',
      startDate: '2026-04-12',
      seatLimit: 50,
      enrolledSeats: 38,
      mode: 'Offline Branch',
      status: 'open',
    },
    {
      id: 'bat-ielts-1',
      courseId: 'crs-ielts-pro',
      name: 'IELTS Band 8.0 Weekend Live',
      code: 'IELTS-WKND-04',
      branchId: 'br-mirpur',
      instructorId: 'inst-4',
      schedule: 'Fri · Sat — 7:30 PM',
      startDate: '2026-04-15',
      seatLimit: 40,
      enrolledSeats: 31,
      mode: 'Online Live',
      status: 'running',
    },
  ];

  const lessons: CourseLesson[] = [
    {
      id: 'les-1',
      courseId: 'crs-frpb-ssc',
      batchId: 'bat-ssc-mpr-1',
      batchName: 'SSC-27 Mirpur Evening Batch A',
      lessonType: 'recorded',
      title: '01. Right Form of Verbs — 12 Golden Board Rules',
      moduleName: 'Module 1: Core Grammar',
      duration: '42:15',
      videoPreviewTitle: 'Right Form of Verbs Masterclass',
      videoUrl: 'https://www.youtube.com/embed/M7lc1UVf-VE',
      lectureSheetUrl: 'https://alomsenglishcenter.com/sheets/ssc-right-form-verbs.pdf',
      sheetSummary:
        'Covers subject-verb agreement, conditional triggers, modal passives, and past board question patterns from Dhaka & Rajshahi boards.',
      isFreePreview: true,
      orderIndex: 1,
    },
    {
      id: 'les-2',
      courseId: 'crs-frpb-ssc',
      batchId: 'bat-ssc-online-1',
      batchName: 'SSC-27 Nationwide Live Batch',
      lessonType: 'live',
      title: '02. Live Completing Sentences & Board Doubt Solving',
      moduleName: 'Module 1: Core Grammar',
      duration: '60:00',
      videoPreviewTitle: 'Live Interactive Grammar Class',
      videoUrl: 'https://www.youtube.com/embed/M7lc1UVf-VE',
      liveJoinUrl: 'https://meet.google.com/aloms-ssc27-live',
      liveStatus: 'live_now',
      scheduledAt: '2026-11-23T20:00',
      lectureSheetUrl: 'https://alomsenglishcenter.com/sheets/completing-sentences-live.pdf',
      sheetSummary:
        'Live interactive workshop covering It is high time, Lest, No sooner had, Provided that, and student Q&A.',
      isFreePreview: false,
      orderIndex: 2,
    },
    {
      id: 'les-3',
      courseId: 'crs-frpb-ssc',
      batchId: 'bat-ssc-mpr-1',
      batchName: 'SSC-27 Mirpur Evening Batch A',
      lessonType: 'lecture_sheet',
      title: '03. Narration & Transformation Complete Formula Sheet (PDF)',
      moduleName: 'Module 2: Transformation',
      duration: 'PDF · 24 Pages',
      videoPreviewTitle: 'Passage Narration Shortcut Handout',
      videoUrl: '',
      lectureSheetUrl: 'https://alomsenglishcenter.com/sheets/narration-master-sheet.pdf',
      sheetSummary:
        'Complete rules for reporting verb shifts, universal truths, exclamation conversion, and 40 solved board passages.',
      isFreePreview: false,
      orderIndex: 3,
    },
    {
      id: 'les-4',
      courseId: 'crs-hsc-combo',
      batchId: 'bat-hsc-utr-1',
      batchName: 'HSC-27 Uttara Morning Batch',
      lessonType: 'recorded',
      title: '01. HSC Modifiers — Pre-Modifier & Post-Modifier Matrix',
      moduleName: 'HSC 2nd Paper Grammar',
      duration: '44:00',
      videoPreviewTitle: 'Modifiers 100% Accuracy System',
      videoUrl: 'https://www.youtube.com/embed/M7lc1UVf-VE',
      lectureSheetUrl: 'https://alomsenglishcenter.com/sheets/hsc-modifiers-guide.pdf',
      sheetSummary:
        'Distinguishes participle, appositive, determiner, intensifier, and infinitive modifiers with 25 board examples.',
      isFreePreview: true,
      orderIndex: 1,
    },
    {
      id: 'les-5',
      courseId: 'crs-hsc-combo',
      batchId: 'bat-hsc-utr-1',
      batchName: 'HSC-27 Uttara Morning Batch',
      lessonType: 'live',
      title: '02. Live Flow Chart & Summary Writing Clinic',
      moduleName: 'HSC 1st Paper Writing',
      duration: '50:00',
      videoPreviewTitle: '10/10 in Flow Charts (Scheduled Live)',
      videoUrl: 'https://www.youtube.com/embed/M7lc1UVf-VE',
      liveJoinUrl: 'https://zoom.us/j/aloms-hsc-flowchart',
      liveStatus: 'scheduled',
      scheduledAt: '2026-11-25T19:30',
      sheetSummary:
        'Gerund, infinitive, and noun phrase parallel structures for top marks in HSC 1st Paper Flow Charts.',
      isFreePreview: false,
      orderIndex: 2,
    },
    {
      id: 'les-6',
      courseId: 'crs-ielts-pro',
      batchId: 'bat-ielts-1',
      batchName: 'IELTS Band 8.0 Weekend Live',
      lessonType: 'recorded',
      title: '01. IELTS Writing Task 2 — Opinion & Discussion Essay Blueprint',
      moduleName: 'Writing Module',
      duration: '51:10',
      videoPreviewTitle: 'Band 8 Essay Structure',
      videoUrl: 'https://www.youtube.com/embed/M7lc1UVf-VE',
      lectureSheetUrl: 'https://alomsenglishcenter.com/sheets/ielts-task2-blueprint.pdf',
      sheetSummary:
        'Thesis framing, PEEL paragraph development, cohesive devices without repetition, and lexical precision.',
      isFreePreview: true,
      orderIndex: 1,
    },
    {
      id: 'les-phonetics-1',
      courseId: 'crs-spoken-fluency',
      batchId: null,
      batchName: 'Spoken & Phonetics Core',
      lessonType: 'audio',
      title: 'Phonetics Lab: /θ/ vs /ð/ & Connected Speech',
      moduleName: 'British & Neutral Phonetics',
      duration: '18:30',
      videoPreviewTitle: 'Phonetics Audio Drill & Speaking Recording',
      videoUrl: 'https://www.youtube.com/embed/M7lc1UVf-VE',
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      isPhonetics: true,
      dripDays: 0,
      sheetSummary:
        'Listen to the model pronunciation audio, record your own speaking practice privately, and submit for teacher pronunciation review.',
      isFreePreview: true,
      orderIndex: 1,
    },
    {
      id: 'les-drip-demo',
      courseId: 'crs-frpb-ssc',
      batchId: 'bat-ssc-mpr-1',
      batchName: 'SSC-27 Mirpur Flagship Batch',
      lessonType: 'lecture_sheet',
      title: '04. Week-2 Board Suggestion & Drip Practice Pack',
      moduleName: 'SSC Final Revision',
      duration: '25:00',
      videoPreviewTitle: 'Drip-Scheduled Board Suggestion',
      videoUrl: 'https://www.youtube.com/embed/M7lc1UVf-VE',
      lectureSheetUrl: 'https://alomsenglishcenter.com/sheets/ssc-suggestion-pack.pdf',
      dripDays: 0,
      sheetSummary: 'Scheduled weekly revision sheet with board-pattern exercises.',
      isFreePreview: false,
      orderIndex: 4,
    },
  ];

  const exams: Exam[] = [
    {
      id: 'exm-ssc-grammar',
      title: 'SSC English Grammar Diagnostic Quiz (Public)',
      courseId: 'crs-frpb-ssc',
      category: 'SSC English',
      durationMinutes: 10,
      passPercentage: 50,
      visibility: 'public',
      teacherId: 'u-teacher',
      createdAt: '2026-02-01T10:00:00.000Z',
      questions: [
        {
          id: 'q1',
          prompt: 'It is high time we _____ our study habits before the board exam.',
          options: ['change', 'changed', 'changing', 'will change'],
          correctIndex: 1,
          explanation: '"It is high time + subject" takes the past simple verb (V2) to indicate urgent present action.',
          marks: 2,
        },
        {
          id: 'q2',
          prompt: 'Walk fast lest you _____ miss the morning class at Aloms English Center.',
          options: ['will', 'would', 'should', 'can'],
          correctIndex: 2,
          explanation: '"Lest" is always followed by "should" (or "might") + base verb without "not".',
          marks: 2,
        },
        {
          id: 'q3',
          prompt: 'Neither the teacher nor the students _____ absent yesterday.',
          options: ['was', 'were', 'is', 'has been'],
          correctIndex: 1,
          explanation: 'With "neither...nor", the verb agrees with the nearer subject ("students" -> plural "were").',
          marks: 2,
        },
        {
          id: 'q4',
          prompt: 'He is _____ honest man in our neighborhood.',
          options: ['a', 'an', 'the', 'no article'],
          correctIndex: 1,
          explanation: 'The "h" in "honest" is silent, so it begins with a vowel sound and takes "an".',
          marks: 2,
        },
        {
          id: 'q5',
          prompt: 'No sooner had the bell rung _____ the students entered the hall.',
          options: ['when', 'then', 'than', 'before'],
          correctIndex: 2,
          explanation: 'The correlative pair is "No sooner had ... than".',
          marks: 2,
        },
      ],
    },
    {
      id: 'exm-hsc-modifiers',
      title: 'HSC Modifiers, Prepositions & Connectors Live Test',
      courseId: 'crs-hsc-combo',
      category: 'HSC English',
      durationMinutes: 15,
      passPercentage: 60,
      visibility: 'public',
      teacherId: 'u-teacher',
      createdAt: '2026-02-10T10:00:00.000Z',
      questions: [
        {
          id: 'hq1',
          prompt: 'Bangladesh is famous _____ its hospitality and natural beauty.',
          options: ['with', 'for', 'at', 'by'],
          correctIndex: 1,
          explanation: '"Famous for" is the standard collocation for being well-known because of something.',
          marks: 2,
        },
        {
          id: 'hq2',
          prompt: 'The boy _____ in the front row is my younger brother. (Use participle post-modifier)',
          options: ['sit', 'sat', 'sitting', 'sits'],
          correctIndex: 2,
          explanation: 'A present participle phrase ("sitting in the front row") post-modifies "The boy".',
          marks: 2,
        },
        {
          id: 'hq3',
          prompt: '_____ he worked very hard, he could not finish the essay on time.',
          options: ['Because', 'Although', 'Therefore', 'Unless'],
          correctIndex: 1,
          explanation: '"Although" introduces a contrast between hard work and not finishing on time.',
          marks: 2,
        },
        {
          id: 'hq4',
          prompt: 'She insisted _____ going to the Mirpur campus seminar.',
          options: ['in', 'on', 'to', 'for'],
          correctIndex: 1,
          explanation: 'The verb "insist" takes the preposition "on" followed by a gerund.',
          marks: 2,
        },
      ],
    },
    {
      id: 'exm-ielts-vocab',
      title: 'IELTS Band 8 Academic Vocabulary & Reading Drill',
      courseId: 'crs-ielts-pro',
      category: 'IELTS & Spoken',
      durationMinutes: 12,
      passPercentage: 60,
      visibility: 'course',
      teacherId: 'u-teacher',
      createdAt: '2026-02-14T10:00:00.000Z',
      questions: [
        {
          id: 'iq1',
          prompt: 'Which word is closest in meaning to "ubiquitous" in academic writing?',
          options: ['scarce', 'omnipresent', 'temporary', 'ambiguous'],
          correctIndex: 1,
          explanation: '"Ubiquitous" means present, appearing, or found everywhere (omnipresent).',
          marks: 2,
        },
        {
          id: 'iq2',
          prompt: 'Choose the best formal verb to replace "make smaller" in Task 1:',
          options: ['mitigate', 'diminish', 'exacerbate', 'proliferate'],
          correctIndex: 1,
          explanation: '"Diminish" accurately conveys decreasing or becoming smaller in data descriptions.',
          marks: 2,
        },
        {
          id: 'iq3',
          prompt: 'In IELTS Reading, "NOT GIVEN" means:',
          options: [
            'The statement directly contradicts the passage',
            'There is insufficient information in the passage to confirm or deny the claim',
            'The keyword appears in the final paragraph',
            'The author agrees partially',
          ],
          correctIndex: 1,
          explanation: 'NOT GIVEN applies when the passage does not contain information verifying or contradicting the statement.',
          marks: 2,
        },
      ],
    },
  ];

  const examAttempts: ExamAttempt[] = [
    {
      id: 'att-seed-1',
      examId: 'exm-ssc-grammar',
      examTitle: 'SSC English Grammar Diagnostic Quiz (Public)',
      userId: 'u-student',
      studentName: 'Arafat Rahman',
      rollNumber: 'AEC-2026-101',
      branchId: 'br-mirpur',
      score: 10,
      totalMarks: 10,
      percentage: 100,
      grade: 'A+',
      passed: true,
      answers: { q1: 1, q2: 2, q3: 1, q4: 1, q5: 2 },
      submittedAt: '2026-03-01T14:20:00.000Z',
    },
    {
      id: 'att-seed-2',
      examId: 'exm-hsc-modifiers',
      examTitle: 'HSC Modifiers, Prepositions & Connectors Live Test',
      userId: 'u-student',
      studentName: 'Arafat Rahman',
      rollNumber: 'AEC-2026-101',
      branchId: 'br-mirpur',
      score: 6,
      totalMarks: 8,
      percentage: 75,
      grade: 'A',
      passed: true,
      answers: { hq1: 1, hq2: 2, hq3: 1, hq4: 0 },
      submittedAt: '2026-03-04T16:10:00.000Z',
    },
  ];

  const products: Product[] = [
    {
      id: 'prd-1',
      title: 'AEC English Grammar Masterbook (SSC & HSC)',
      category: 'Books',
      price: 490,
      originalPrice: 690,
      stock: 120,
      image: '/src/assets/images/course_english_books_1795411661325.jpg',
      description: '420-page hardcover grammar & freehand writing manual with bilingual Bangla-English explanations.',
    },
    {
      id: 'prd-2',
      title: 'AEC Customize Premium Water Flask (Matte Black)',
      category: 'Merchandise',
      price: 799,
      originalPrice: 999,
      stock: 48,
      image: '/src/assets/images/course_english_books_1795411661325.jpg',
      description: 'Double-wall stainless steel insulated flask laser-engraved with the Aloms English Center emblem.',
    },
    {
      id: 'prd-3',
      title: 'AEC IELTS Band 8+ Vocabulary & Cue Card Kit',
      category: 'Study Kits',
      price: 650,
      originalPrice: 900,
      stock: 85,
      image: '/src/assets/images/course_english_books_1795411661325.jpg',
      description: 'Printed flashcards + Writing Task 2 Band 8 sample booklet.',
    },
    {
      id: 'prd-4',
      title: 'AEC Varsity & Academic Premium Hoodie',
      category: 'Merchandise',
      price: 990,
      originalPrice: 1850,
      stock: 0,
      image: '/src/assets/images/hero_ielts_batch_1795411661577.jpg',
      description: '360 GSM fleece hoodie in deep teal with embroidered AEC crest.',
    },
  ];

  const ebooks: Ebook[] = [
    {
      id: 'ebk-1',
      title: 'SSC 2026-27 English 2nd Paper Final Suggestion',
      level: 'SSC 27',
      isFree: true,
      price: 0,
      originalPrice: 0,
      author: 'Alomgir Hossain',
      pagesCount: 48,
      summary: 'Complete suggestion covering Paragraph, Formal Letter, Email, CV, Composition, and 150 Board Grammar MCQs.',
      sampleContent: [
        'Chapter 1: High-Probability Paragraphs — Load Shedding, Tree Plantation, Smart Bangladesh, Climate Change, Metro Rail.',
        'Chapter 2: Formal Application Format — Notice how Date, Salutation, and Subject line align cleanly to the left margin for full board marks.',
        'Chapter 3: Top 30 Completing Sentence Structures with Bengali meaning and board year tags.',
      ],
    },
    {
      id: 'ebk-2',
      title: 'HSC English 1st Paper Flow Chart & Summary ShortNote',
      level: 'HSC 27',
      isFree: false,
      price: 99,
      originalPrice: 150,
      author: 'Mahmudul Hasan',
      pagesCount: 72,
      summary: 'অধ্যায়ভিত্তিক প্রতিটি টেক্সটের বাংলা অনুবাদ, গুরুত্বপূর্ণ Vocabulary, Flow Chart এবং Summary লেখার শর্টকাট ফর্মুলা।',
      sampleContent: [
        'Unit 1: People or Institutions Making History — Key Nelson Mandela & Bangabandhu speech vocabulary.',
        'Flow Chart Rule 1: Always start every box with the same grammatical form (e.g., Verb+ing or To+Verb) matching the given first box.',
        'Summary Rule: Write within 1/3rd length of the passage without copying full sentences verbatim.',
      ],
    },
    {
      id: 'ebk-3',
      title: 'Daily Spoken English 100 Essential Sentence Patterns',
      level: 'IELTS',
      isFree: true,
      price: 0,
      originalPrice: 0,
      author: 'Sabrina Karim',
      pagesCount: 36,
      summary: 'প্রাত্যহিক কথা বলার জন্য সবচেয়ে বেশি ব্যবহৃত ১০০টি ইংরেজি স্ট্রাকচার ও বাংলা অর্থসহ উদাহরণ।',
      sampleContent: [
        'Pattern 01: "It takes + time + to + verb" — It takes 20 minutes to reach Mirpur campus.',
        'Pattern 02: "I am looking forward to + Verb-ing" — I am looking forward to meeting you tomorrow.',
        'Pattern 03: "Would you mind + Verb-ing?" — Polite requests in formal and everyday English.',
      ],
    },
    {
      id: 'ebk-4',
      title: 'Class 9-10 Grammar & Punctuation Pocket Guide',
      level: 'Class 9',
      isFree: false,
      price: 99,
      originalPrice: 150,
      author: 'Aloms English Center Academic Team',
      pagesCount: 64,
      summary: 'Voice, Narration, Tag Questions, Connectors, এবং Punctuation-এর কমপ্লিট পকেট রিভিশন গাইড।',
      sampleContent: [
        'Tag Question Exceptions: Let us -> shall we?, Let me/him -> will you?, Everybody/Nobody -> plural pronoun "they".',
        'Connectors Quick Map: Contrast (However, Yet), Addition (Moreover, Furthermore), Result (Consequently, Thus).',
      ],
    },
  ];

  const enrollments: Enrollment[] = [
    {
      id: 'enr-1',
      userId: 'u-student',
      studentName: 'Arafat Rahman',
      studentEmail: 'student@alomsenglish.com',
      courseId: 'crs-frpb-ssc',
      courseTitle: 'Final Revision Premium Batch for SSC-27 (English 1st & 2nd)',
      branchId: 'br-mirpur',
      paymentMethod: 'bKash',
      amountPaid: 2490,
      status: 'approved',
      completedLessonIds: ['les-1'],
      enrolledAt: '2026-02-05T11:00:00.000Z',
    },
    {
      id: 'enr-2',
      userId: 'u-student',
      studentName: 'Arafat Rahman',
      studentEmail: 'student@alomsenglish.com',
      courseId: 'crs-hsc-combo',
      courseTitle: 'HSC 27-28 English 1st & 2nd Paper + Spoken Combo',
      branchId: 'br-mirpur',
      paymentMethod: 'Branch Cash',
      amountPaid: 3490,
      status: 'pending',
      completedLessonIds: [],
      enrolledAt: '2026-03-06T09:30:00.000Z',
    },
    {
      id: 'enr-3',
      userId: 'u-student-2',
      studentName: 'Farhana Yasmin',
      studentEmail: 'farhana@alomsenglish.com',
      courseId: 'crs-ielts-pro',
      courseTitle: 'IELTS Academic & GT Complete Band 8.0 Mastery',
      branchId: 'br-uttara',
      paymentMethod: 'Nagad',
      amountPaid: 4990,
      status: 'approved',
      completedLessonIds: ['les-6'],
      enrolledAt: '2026-02-18T15:00:00.000Z',
    },
  ];

  const orders: Order[] = [
    {
      id: 'ord-1001',
      userId: 'u-student',
      customerName: 'Arafat Rahman',
      phone: '01710000004',
      deliveryAddress: 'Mirpur 10, Dhaka',
      branchPickupId: 'br-mirpur',
      items: [
        {
          productId: 'prd-1',
          title: 'AEC English Grammar Masterbook (SSC & HSC)',
          quantity: 1,
          unitPrice: 490,
        },
      ],
      deliveryFee: 0,
      totalAmount: 490,
      status: 'delivered',
      createdAt: '2026-02-12T10:15:00.000Z',
    },
  ];

  const coupons: Coupon[] = [
    { code: 'AEC20', discountPercent: 20, active: true, description: '20% Launch Offer' },
    { code: 'ALOMS10', discountPercent: 10, active: true, description: '10% Student Discount' },
  ];

  const reviews: Review[] = [
    {
      id: 'rev-1',
      name: 'Tasannun Tarin',
      roleLabel: 'Verified Student · SSC Batch',
      text: 'আলম স্যার একটা গ্রামার রুল বোঝানোর মাধ্যমে দশটা বোর্ড প্রশ্ন সলভ করার টেকনিক দেখিয়ে দেন। পরীক্ষায় হুবহু কমন আসে!',
      rating: 5,
      row: 1,
    },
    {
      id: 'rev-2',
      name: 'Shamim Shohan',
      roleLabel: 'Verified Student · HSC 27',
      text: 'Before joining Aloms English Center, I struggled with Modifiers and Connectors. Now I score 56+ out of 60 in English 2nd Paper.',
      rating: 5,
      row: 1,
    },
    {
      id: 'rev-3',
      name: 'Mubina Khanom',
      roleLabel: 'Verified Student · Spoken',
      text: 'আলহামদুলিল্লাহ, Spoken English ও Phonetics ক্লাস করার পর আমার কথা বলার জড়তা একদম কেটে গেছে।',
      rating: 5,
      row: 1,
    },
    {
      id: 'rev-4',
      name: 'Borhan Uddin Shifat',
      roleLabel: 'Verified Student · IELTS',
      text: 'IELTS Writing Task 2-তে আগে 5.5 পেতাম, আলমস ইংলিশ সেন্টারের ফিডব্যাক ক্লাসের পর মক টেস্টে 7.5 পেয়েছি।',
      rating: 5,
      row: 2,
    },
    {
      id: 'rev-5',
      name: 'Afrina Jahan',
      roleLabel: 'Verified Student · Grammar Pro',
      text: 'বেসিক থেকে শুরু করে সব CQ, MCQ এবং ফ্রি-হ্যান্ড রাইটিং কভার হয়ে যায়। এক কথায় সেরা প্ল্যাটফর্ম!',
      rating: 5,
      row: 2,
    },
    {
      id: 'rev-6',
      name: 'Kamrul Hasan',
      roleLabel: 'Guardian · Mirpur Branch',
      text: 'গার্ডিয়ান পোর্টাল থেকে আমার ছেলের পরীক্ষার রেজাল্ট, ক্লাস প্রোগ্রেস আর ফি স্ট্যাটাস ঘরে বসেই দেখতে পারি—দারুণ সিস্টেম!',
      rating: 5,
      row: 2,
    },
  ];

  const results: CenterResultRecord[] = [
    {
      rollNumber: 'AEC-2026-101',
      studentName: 'Arafat Rahman',
      batchName: 'SSC-27 Final Revision Batch',
      branchName: 'Mirpur DOHS Main Campus',
      examName: 'Grand English Model Test 01',
      mcqScore: 28,
      writtenScore: 64,
      totalScore: 92,
      maxScore: 100,
      gpaOrGrade: 'A+ (5.00)',
      meritPosition: 3,
      status: 'Distinction',
    },
    {
      rollNumber: 'AEC-2026-102',
      studentName: 'Farhana Yasmin',
      batchName: 'IELTS Band 8.0 Mastery',
      branchName: 'Uttara Sector 7 Campus',
      examName: 'Full Mock Assessment 02',
      mcqScore: 36,
      writtenScore: 51,
      totalScore: 87,
      maxScore: 100,
      gpaOrGrade: 'Band 8.0',
      meritPosition: 1,
      status: 'Distinction',
    },
  ];

  const ext = createExtendedSeedCollections();
  const homepageConfig = createDefaultHomepageConfig();

  const settings: SiteSettings = {
    brandName: 'Aloms English Center',
    tagline: 'Master Academic English, Spoken Fluency & IELTS with Confidence',
    logoUrl: '/images/aec-logo.png',
    faviconUrl: '/images/aec-logo.png',
    primaryColor: '#062436',
    accentColor: '#f59e0b',
    whiteLabelDomain: 'portal.alomsenglish.com',
    language: 'en',
    phone: '09617331133',
    email: 'info@alomsenglishcenter.com',
    whatsappNumber: '8801710000001',
    address: 'House 42, Road 6/A, Avenue 8, Mirpur DOHS, Dhaka',
    licenseNo: 'TRAD/DNCC/058412/2026',
    aboutMission:
      'Aloms English Center is a premier online and multi-branch English learning platform delivering structured SSC, HSC, Spoken English, Grammar, and IELTS programs led by experienced educators across Bangladesh.',
    footerCopyright: '© 2026 Aloms English Center. All Rights Reserved.',
    footerLinks: ext.footerLinks,
    headerMenu: DEFAULT_HEADER_MENU.map((m) => ({ ...m })),
    socialLinks: {
      youtube: 'https://www.youtube.com',
      facebook: 'https://www.facebook.com',
      linkedin: 'https://www.linkedin.com',
    },
    customPages: ext.customPages,
    heroSlides: [
      {
        id: 'slide-1',
        badge: 'AEC 27',
        title: 'FINAL REVISION PREMIUM BATCH',
        subtitle: 'SSC & HSC English 1st + 2nd Paper (Complete Syllabus)',
        ctaText: 'Explore SSC Batch',
        courseSlug: 'ssc-english-final-revision',
        image: '/src/assets/images/hero_ielts_batch_1795411661577.jpg',
        gradient: 'from-fuchsia-800/85 via-purple-900/70 to-slate-950/90',
        active: true,
      },
      {
        id: 'slide-2',
        badge: 'IELTS 8.0',
        title: 'IELTS ACADEMIC & SPOKEN PRO',
        subtitle: 'Live Writing Evaluation + 1-on-1 Speaking Mock Tests',
        ctaText: 'View IELTS Program',
        courseSlug: 'ielts-band-8-pro',
        image: '/src/assets/images/hero_spoken_grammar_1795411660470.jpg',
        gradient: 'from-emerald-900/85 via-teal-900/70 to-slate-950/90',
        active: true,
      },
      {
        id: 'slide-3',
        badge: 'HSC 27-28',
        title: 'ENGLISH BASIC TO PRO COMBO',
        subtitle: 'Grammar, Freehand Writing, Flow Charts & Weekly Exams',
        ctaText: 'Join HSC Combo',
        courseSlug: 'hsc-english-complete-combo',
        image: '/src/assets/images/hero_hsc_english_1795411661478.jpg',
        gradient: 'from-cyan-900/85 via-sky-950/75 to-slate-950/90',
        active: true,
      },
    ],
    homepageConfig,
  };

  const normalizedReviews = reviews.map((r) => ({
    ...r,
    status: r.status ?? ('approved' as const),
    verified: r.verified ?? true,
    featured: r.featured ?? r.row === 1,
  }));

  const normalizedCoupons = coupons.map((c) => ({
    ...c,
    appliesTo: c.appliesTo ?? ('all' as const),
  }));

  return {
    settings,
    branches,
    users,
    instructors,
    courses,
    batches,
    lessons,
    exams,
    examAttempts,
    questionBank: ext.questionBank,
    products,
    ebooks,
    categories: ext.categories,
    posts: ext.posts,
    scormPackages: ext.scormPackages,
    scormAttempts: ext.scormAttempts,
    rewardsByUser: ext.rewardsByUser,
    attendance: ext.attendance,
    payrolls: ext.payrolls,
    financialRecords: ext.financialRecords,
    paymentGateways: ext.paymentGateways,
    transactions: ext.transactions,
    enrollments,
    orders,
    coupons: normalizedCoupons,
    reviews: normalizedReviews,
    results,
    claimedEbooksByUser: {
      'u-student': ['ebk-1', 'ebk-3'],
    },
    contactMessages: [],
    backups: [],
    recycleBin: [],
    auditLogs: ext.auditLogs,
    campaigns: ext.campaigns,
    plugins: ext.plugins,
    webhooks: ext.webhooks,
    ...createEnterpriseSeedCollections(),
  };
}

export function createDefaultHomepageConfig(): HomepageConfig {
  return {
    featuredCard: {
      badge: 'Online & Branch Course',
      title: 'Online Batches are ongoing!',
      subtitle: 'Book your seat now!',
      ctaText: 'See All Courses',
      ctaLink: '/courses',
      highlights: [
        {
          id: 'fhl-1',
          title: 'Class 9, 10',
          desc: 'SSC English 1st & 2nd Paper Preparation',
          categoryLink: '/courses?cat=SSC%20English',
          iconKey: 'book',
          accentColor: 'emerald',
        },
        {
          id: 'fhl-2',
          title: 'College & IELTS',
          desc: 'HSC English, Spoken & IELTS Band 8 Prep',
          categoryLink: '/courses?cat=HSC%20English',
          iconKey: 'briefcase',
          accentColor: 'amber',
        },
      ],
    },
    statsCard: {
      mode: 'auto',
      badge: 'Trusted Platform',
      title: 'See the stats!',
      subtitle: 'The trust we are building!',
      ctaText: 'See All Courses',
      ctaLink: '/courses',
      customValues: {
        students: 340241,
        courses: 70,
        teachers: 30,
        videos: 6476,
      },
      labels: {
        students: 'Students',
        courses: 'Courses',
        teachers: 'Teachers',
        videos: 'Videos',
      },
    },
    learningPathsSection: {
      heading: 'Choose Your Learning Path',
      subheading:
        'Discover structured English programs across academic boards, university admission, spoken fluency, and IELTS mastery.',
      items: [
        {
          id: 'lp-1',
          title: 'Academic English',
          desc: 'Comprehensive SSC & HSC 1st & 2nd Paper board preparation',
          category: 'SSC English',
          iconKey: 'book',
          accentKey: 'sky',
        },
        {
          id: 'lp-2',
          title: 'Admission Courses',
          desc: 'Specialized English prep for DU, IBA, Medical & GST admissions',
          category: 'Admission',
          iconKey: 'graduation',
          accentKey: 'indigo',
        },
        {
          id: 'lp-3',
          title: 'Spoken & Fluency',
          desc: 'Practical speaking drills, phonetics & presentation mastery',
          category: 'IELTS & Spoken',
          iconKey: 'languages',
          accentKey: 'emerald',
        },
        {
          id: 'lp-4',
          title: 'IELTS Mastery',
          desc: 'Band 8.0 Academic & GT Writing, Reading, Listening & Speaking',
          category: 'IELTS & Spoken',
          iconKey: 'award',
          accentKey: 'amber',
        },
        {
          id: 'lp-5',
          title: 'Grammar Basic to Pro',
          desc: 'Deep conceptual clarity in Tense, Clause, Modifiers & Syntax',
          category: 'Grammar Pro',
          iconKey: 'layers',
          accentKey: 'purple',
        },
        {
          id: 'lp-6',
          title: 'Branch & Community',
          desc: 'Hybrid study across Mirpur, Uttara & Chattogram AEC campuses',
          category: 'All Courses',
          iconKey: 'landmark',
          accentKey: 'teal',
        },
      ],
    },
    reviewsSection: {
      kicker: 'Student Reviews',
      heading: 'What Our Students Say',
      subheading:
        'Feedback from learners and guardians who transformed their English journey with Aloms English Center',
    },
  };
}

let cachedState: DatabaseState | null = null;

export function getDb(): DatabaseState {
  if (cachedState) return cachedState;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as DatabaseState;
      const fallback = createInitialState();
      if (!Array.isArray(parsed.batches)) parsed.batches = fallback.batches;
      if (!parsed.settings.homepageConfig) {
        parsed.settings.homepageConfig = createDefaultHomepageConfig();
      }
      parsed.settings.logoUrl = parsed.settings.logoUrl || fallback.settings.logoUrl;
      parsed.settings.footerLinks = parsed.settings.footerLinks ?? fallback.settings.footerLinks;
      parsed.settings.headerMenu = normalizeHeaderMenu(parsed.settings.headerMenu, fallback.settings.headerMenu);
      parsed.settings.socialLinks = parsed.settings.socialLinks ?? fallback.settings.socialLinks;
      parsed.settings.customPages = parsed.settings.customPages ?? fallback.settings.customPages;
      parsed.settings.heroSlides = (parsed.settings.heroSlides ?? []).map((s) => ({
        ...s,
        active: s.active !== false,
      }));
      parsed.lessons = (parsed.lessons ?? []).map((l) => ({
        ...l,
        lessonType: l.lessonType ?? 'recorded',
      }));
      parsed.reviews = (parsed.reviews ?? []).map((r) => ({
        ...r,
        status: r.status ?? 'approved',
        verified: r.verified ?? true,
      }));
      parsed.questionBank = parsed.questionBank ?? fallback.questionBank;
      parsed.categories = parsed.categories ?? fallback.categories;
      parsed.posts = parsed.posts ?? fallback.posts;
      parsed.scormPackages = parsed.scormPackages ?? fallback.scormPackages;
      parsed.scormAttempts = parsed.scormAttempts ?? fallback.scormAttempts;
      parsed.rewardsByUser = parsed.rewardsByUser ?? fallback.rewardsByUser;
      parsed.attendance = parsed.attendance ?? fallback.attendance;
      parsed.payrolls = parsed.payrolls ?? fallback.payrolls;
      parsed.financialRecords = parsed.financialRecords ?? fallback.financialRecords;
      parsed.paymentGateways = parsed.paymentGateways ?? fallback.paymentGateways;
      parsed.transactions = parsed.transactions ?? fallback.transactions;
      parsed.backups = parsed.backups ?? [];
      parsed.recycleBin = parsed.recycleBin ?? [];
      parsed.auditLogs = parsed.auditLogs ?? fallback.auditLogs;
      parsed.campaigns = parsed.campaigns ?? fallback.campaigns;
      parsed.plugins = parsed.plugins ?? fallback.plugins;
      parsed.webhooks = parsed.webhooks ?? fallback.webhooks;
      parsed.customRoles = parsed.customRoles ?? fallback.customRoles;
      parsed.loginHistory = parsed.loginHistory ?? fallback.loginHistory;
      parsed.assignments = parsed.assignments ?? fallback.assignments;
      parsed.assignmentSubmissions = parsed.assignmentSubmissions ?? fallback.assignmentSubmissions;
      parsed.speakingSubmissions = parsed.speakingSubmissions ?? fallback.speakingSubmissions;
      parsed.feeInvoices = parsed.feeInvoices ?? fallback.feeInvoices;
      parsed.certificateTemplates = parsed.certificateTemplates ?? fallback.certificateTemplates;
      parsed.certificates = parsed.certificates ?? fallback.certificates;
      parsed.notifications = parsed.notifications ?? fallback.notifications;
      parsed.notices = parsed.notices ?? fallback.notices;
      parsed.guardianMessages = parsed.guardianMessages ?? fallback.guardianMessages;
      parsed.saasTenants = parsed.saasTenants ?? fallback.saasTenants;
      parsed.workflows = parsed.workflows ?? fallback.workflows;
      parsed.workflowRuns = parsed.workflowRuns ?? fallback.workflowRuns;
      parsed.crmContacts = parsed.crmContacts ?? fallback.crmContacts;
      parsed.omnichannelConversations = parsed.omnichannelConversations ?? fallback.omnichannelConversations;
      parsed.referrals = parsed.referrals ?? fallback.referrals;
      parsed.flashSale = parsed.flashSale ?? fallback.flashSale;
      parsed.errorLogs = parsed.errorLogs ?? fallback.errorLogs;
      parsed.scheduledJobs = parsed.scheduledJobs ?? fallback.scheduledJobs;
      parsed.dashboardLayoutsByUser = parsed.dashboardLayoutsByUser ?? fallback.dashboardLayoutsByUser;
      parsed.widgetUsageStats = parsed.widgetUsageStats ?? fallback.widgetUsageStats;
      cachedState = parsed;
      return cachedState;
    } catch {
      // Fall back to fresh seed if corrupted
    }
  }
  cachedState = createInitialState();
  saveDb(cachedState);
  return cachedState;
}

export function saveDb(state: DatabaseState): void {
  cachedState = state;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function resetDbToDefaults(): DatabaseState {
  cachedState = createInitialState();
  saveDb(cachedState);
  return cachedState;
}

export function recordAuditLog(
  db: DatabaseState,
  actor: { id: string; name: string; role: UserRole },
  action: string,
  target: string,
  details: string
): void {
  db.auditLogs.unshift({
    id: `audit-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    target,
    details,
    createdAt: new Date().toISOString(),
  });
  if (db.auditLogs.length > 250) {
    db.auditLogs = db.auditLogs.slice(0, 250);
  }
}

export function createVerifiedBackupSnapshot(
  db: DatabaseState,
  actorName: string,
  label: string,
  reason: 'manual' | 'pre_reset' | 'pre_restore'
): BackupSnapshot {
  const clone = { ...db, backups: [] };
  const payloadJson = JSON.stringify(clone);
  const checksumSha256 = crypto.createHash('sha256').update(payloadJson).digest('hex');
  const snapshot: BackupSnapshot = {
    id: `bkp-${Date.now()}`,
    label,
    reason,
    checksumSha256,
    verified: true,
    createdBy: actorName,
    createdAt: new Date().toISOString(),
    summary: {
      courses: db.courses.length,
      users: db.users.length,
      exams: db.exams.length,
      enrollments: db.enrollments.length,
      reviews: db.reviews.length,
    },
    payloadJson,
  };
  db.backups.unshift(snapshot);
  if (db.backups.length > 15) {
    db.backups = db.backups.slice(0, 15);
  }
  return snapshot;
}

export function verifyBackupSnapshotIntegrity(snapshot: BackupSnapshot): boolean {
  if (!snapshot.payloadJson || !snapshot.checksumSha256) return false;
  const computed = crypto.createHash('sha256').update(snapshot.payloadJson).digest('hex');
  return computed === snapshot.checksumSha256;
}

