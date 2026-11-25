import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  Coins,
  DatabaseBackup,
  Edit3,
  ExternalLink,
  FileArchive,
  Globe,
  KeyRound,
  Layers,
  Megaphone,
  Package,
  Play,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  UserCheck,
  Users,
  Wallet,
  Webhook,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  calculateNetPayroll,
  canClaimEbookFree,
  computeAttendanceSummary,
  filterActiveBranches,
  isAdminRole,
  mergeCourseCategories,
} from '../lib/domain';
import type {
  AiAgentRole,
  ApiPlugin,
  AttendanceRecord,
  AuditLogEntry,
  BackupSnapshot,
  Branch,
  BroadcastCampaign,
  CategoryItem,
  CommunityPost,
  Coupon,
  Course,
  Ebook,
  FinancialRecord,
  Instructor,
  PaymentTransaction,
  PayrollRecord,
  Product,
  QuestionBankItem,
  RecycleBinItem,
  ScormPackage,
  User,
  UserRole,
  WebhookConfig,
} from '../types';
import { ImageUploadField } from './ImageUploadField';
import { ScormPlayerModal } from './ScormPlayerModal';

interface RefreshProps {
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

/* ============================================================================
 * 1. BULK SUBJECT-WISE QUESTION BANK & EXAM FROM BANK STUDIO
 * ========================================================================== */
interface ExamBankPanelProps extends RefreshProps {
  questionBank: QuestionBankItem[];
  courses: Course[];
}

const SAMPLE_BULK_QUESTIONS = `He ___ to Dhaka yesterday. | goes | went | gone | going | 1 | Past indefinite uses V2 (went) with yesterday. | 2
Synonym of 'Ephemeral' is ___. | permanent | short-lived | strong | silent | 1 | Ephemeral means lasting for a very short time. | 2
She has been reading ___ two hours. | since | for | from | during | 1 | 'For' is used before a period of time. | 1`;

export function ExamBankPanel({
  questionBank,
  courses,
  onRefresh,
  onNotify,
}: ExamBankPanelProps) {
  const { apiFetch } = useAuth();
  const [subject, setSubject] = useState('HSC English 2nd Paper');
  const [chapter, setChapter] = useState('Right Form of Verbs & Grammar');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [rawText, setRawText] = useState(SAMPLE_BULK_QUESTIONS);
  const [importing, setImporting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);

  const [searchQ, setSearchQ] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Build Exam from Bank form
  const [examTitle, setExamTitle] = useState('');
  const [examCat, setExamCat] = useState('HSC English');
  const [examCourseId, setExamCourseId] = useState('');
  const [durationMin, setDurationMin] = useState(20);
  const [passPct, setPassPct] = useState(40);
  const [negativeMark, setNegativeMark] = useState(0.25);
  const [visibility, setVisibility] = useState<'public' | 'course'>('public');
  const [randomSubject, setRandomSubject] = useState('all');
  const [randomCount, setRandomCount] = useState(5);

  const subjects = Array.from(new Set(questionBank.map((q) => q.subject)));

  const filteredBank = questionBank.filter((q) => {
    if (subjectFilter !== 'all' && q.subject !== subjectFilter) return false;
    const s = searchQ.trim().toLowerCase();
    if (!s) return true;
    return (
      q.prompt.toLowerCase().includes(s) ||
      q.subject.toLowerCase().includes(s) ||
      q.chapter.toLowerCase().includes(s)
    );
  });

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankError(null);
    setImporting(true);
    try {
      const res = await apiFetch<{ importedCount: number }>('/api/portal/question-bank/bulk', {
        method: 'POST',
        body: JSON.stringify({ subject, chapter, difficulty, rawText }),
      });
      await onRefresh();
      onNotify(`Imported ${res.importedCount} questions into "${subject}".`);
    } catch (err) {
      setBankError(err instanceof Error ? err.message : 'Bulk import failed.');
    } finally {
      setImporting(false);
    }
  };

  const handleAiGenerate = async () => {
    setBankError(null);
    setAiLoading(true);
    try {
      const res = await apiFetch<{
        items: {
          prompt: string;
          options: string[];
          correctIndex: number;
          explanation: string;
          marks?: number;
        }[];
      }>('/api/ai/generate-questions', {
        method: 'POST',
        body: JSON.stringify({ subject, chapter, count: 3 }),
      });
      if (Array.isArray(res.items) && res.items.length > 0) {
        const lines = res.items.map(
          (q) =>
            `${q.prompt} | ${(q.options || ['A', 'B', 'C', 'D']).slice(0, 4).join(' | ')} | ${q.correctIndex ?? 0} | ${q.explanation || 'AI verified'} | ${q.marks || 1}`
        );
        setRawText(lines.join('\n'));
        onNotify(`AI drafted ${res.items.length} MCQs — review & click Bulk Import!`);
      }
    } catch (err) {
      setBankError(err instanceof Error ? err.message : 'AI generation unavailable.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleDeleteBankItem = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    await apiFetch(`/api/portal/question-bank/${id}`, { method: 'DELETE' });
    setConfirmDeleteId(null);
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    await onRefresh();
    onNotify('Question moved to Recycle Bin.');
  };

  const handleBuildExamFromBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankError(null);
    try {
      const res = await apiFetch<{ exam: { title: string; questions: unknown[] } }>(
        '/api/portal/exams/from-bank',
        {
          method: 'POST',
          body: JSON.stringify({
            title: examTitle,
            category: examCat,
            courseId: examCourseId || null,
            durationMinutes: durationMin,
            passPercentage: passPct,
            negativeMarkPerWrong: negativeMark,
            visibility,
            questionIds: selectedIds.length > 0 ? selectedIds : undefined,
            randomSubject,
            randomCount,
          }),
        }
      );
      setExamTitle('');
      setSelectedIds([]);
      await onRefresh();
      onNotify(`Published "${res.exam.title}" with ${res.exam.questions.length} MCQs!`);
    } catch (err) {
      setBankError(err instanceof Error ? err.message : 'Could not build exam.');
    }
  };

  return (
    <div className="space-y-6">
      {bankError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {bankError}
        </div>
      )}

      {/* Bulk Subject-Wise Importer */}
      <form
        onSubmit={handleBulkImport}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Bulk Subject-Wise Question Bank Importer
            </h2>
            <p className="text-xs text-slate-500">
              Add many MCQs at once per Subject & Chapter. Format per line:{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-indigo-700">
                Question | Opt A | Opt B | Opt C | Opt D | CorrectIdx(0-3) | Explanation | Marks
              </code>
            </p>
          </div>
          <button
            type="button"
            disabled={aiLoading}
            onClick={handleAiGenerate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 border border-amber-200 hover:bg-amber-100 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{aiLoading ? 'Generating...' : 'AI Draft 3 MCQs'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (e.g. HSC English 2nd Paper)"
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
          />
          <input
            type="text"
            required
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            placeholder="Chapter / Topic"
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
          />
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as 'Easy' | 'Medium' | 'Hard')}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
          >
            <option value="Easy">Difficulty: Easy</option>
            <option value="Medium">Difficulty: Medium</option>
            <option value="Hard">Difficulty: Hard</option>
          </select>
        </div>

        <textarea
          rows={5}
          required
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste multiple MCQ lines or JSON array here..."
          className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setRawText(SAMPLE_BULK_QUESTIONS)}
            className="text-xs font-bold text-indigo-600 hover:underline"
          >
            Load Sample Batch Template
          </button>
          <button
            type="submit"
            disabled={importing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#062436] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0b3854] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>{importing ? 'Importing...' : 'Import Batch to Question Bank'}</span>
          </button>
        </div>
      </form>

      {/* Assemble Exam from Question Bank */}
      <form
        onSubmit={handleBuildExamFromBank}
        className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Generate Exam from Question Bank
            </h3>
            <p className="text-xs text-slate-600">
              {selectedIds.length > 0
                ? `${selectedIds.length} specific bank questions checked below.`
                : 'No questions checked — will randomly draw questions from the chosen Subject.'}
            </p>
          </div>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs font-bold text-rose-600 hover:underline"
            >
              Clear Selection ({selectedIds.length})
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            type="text"
            required
            placeholder="New Exam Title"
            value={examTitle}
            onChange={(e) => setExamTitle(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
          />
          <input
            type="text"
            required
            placeholder="Category (e.g. HSC English)"
            value={examCat}
            onChange={(e) => setExamCat(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
          />
          <select
            value={examCourseId}
            onChange={(e) => setExamCourseId(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
          >
            <option value="">Open Public / Any Course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-600">Minutes</label>
            <input
              type="number"
              min={5}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-600">Pass %</label>
            <input
              type="number"
              min={20}
              max={90}
              value={passPct}
              onChange={(e) => setPassPct(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-600">Neg Mark</label>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={negativeMark}
              onChange={(e) => setNegativeMark(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-600">Random Subject</label>
            <select
              value={randomSubject}
              onChange={(e) => setRandomSubject(e.target.value)}
              disabled={selectedIds.length > 0}
              className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs disabled:opacity-50"
            >
              <option value="all">All Subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-600">Draw Count</label>
            <input
              type="number"
              min={1}
              max={50}
              disabled={selectedIds.length > 0}
              value={randomCount}
              onChange={(e) => setRandomCount(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'public' | 'course')}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
          >
            <option value="public">Public Exam</option>
            <option value="course">Course Students Only</option>
          </select>
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
          >
            Publish Exam from Question Bank
          </button>
        </div>
      </form>

      {/* Bank Directory */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-extrabold text-slate-900">
            Question Bank Repository ({questionBank.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search questions..."
                className="rounded-xl border border-slate-300 py-1.5 pl-8 pr-3 text-xs"
              />
            </div>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold"
            >
              <option value="all">All Subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
          {filteredBank.map((q) => {
            const checked = selectedIds.includes(q.id);
            const confirming = confirmDeleteId === q.id;
            return (
              <div
                key={q.id}
                className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-xs ${
                  checked ? 'border-indigo-400 bg-indigo-50/40' : 'border-slate-200'
                }`}
              >
                <label className="flex flex-1 cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedIds((prev) =>
                        checked ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                      )
                    }
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <div>
                    <p className="font-bold text-slate-900">{q.prompt}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      <span className="font-semibold text-sky-700">{q.subject}</span> · {q.chapter}{' '}
                      · {q.difficulty} · Correct: {q.options[q.correctIndex] ?? 'Opt'}
                    </p>
                  </div>
                </label>
                <button
                  type="button"
                  onClick={() => void handleDeleteBankItem(q.id)}
                  className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${
                    confirming ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50'
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {confirming && <span>Confirm</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. CATALOG & CONTENT STUDIO (E-BOOKS, PRODUCTS, INSTRUCTORS, CATEGORIES, POSTS, COUPONS)
 * ========================================================================== */
interface CatalogContentPanelProps extends RefreshProps {
  ebooks: Ebook[];
  products: Product[];
  instructors: Instructor[];
  categories: CategoryItem[];
  posts: CommunityPost[];
  coupons: Coupon[];
  branches: Branch[];
  transactions?: PaymentTransaction[];
}

export function CatalogContentPanel({
  ebooks,
  products,
  instructors,
  categories,
  posts,
  coupons,
  branches,
  transactions = [],
  onRefresh,
  onNotify,
}: CatalogContentPanelProps) {
  const { apiFetch } = useAuth();
  const [subTab, setSubTab] = useState<
    'ebooks' | 'products' | 'instructors' | 'categories' | 'posts' | 'coupons'
  >('ebooks');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeBranches = filterActiveBranches(branches);
  const syncedCourseCategories = mergeCourseCategories(categories);
  const syncedProductCategories = Array.from(
    new Set([
      'Books',
      'Study Kits',
      'Merchandise',
      ...categories.filter((c) => c.type === 'product' && c.active).map((c) => c.name),
    ])
  );
  const syncedEbookCategories = Array.from(
    new Set([
      'Digital PDF',
      'Board Prep',
      'Grammar Pro',
      'IELTS & Spoken',
      ...categories.filter((c) => c.type === 'ebook' && c.active).map((c) => c.name),
    ])
  );
  const syncedPostCategories = Array.from(
    new Set([
      'Exam Strategy & Tips',
      'Grammar Clinic',
      'IELTS Prep',
      'Success Stories',
      ...categories.filter((c) => c.type === 'post' && c.active).map((c) => c.name),
    ])
  );

  // Ebook form + edit
  const [editingEbookId, setEditingEbookId] = useState<string | null>(null);
  const [ebTitle, setEbTitle] = useState('');
  const [ebLevel, setEbLevel] = useState('HSC 27');
  const [ebCategory, setEbCategory] = useState('Digital PDF');
  const [ebAuthor, setEbAuthor] = useState('Aloms English Academic Team');
  const [ebPages, setEbPages] = useState(120);
  const [ebIsFree, setEbIsFree] = useState(false);
  const [ebPrice, setEbPrice] = useState(190);
  const [ebOriginalPrice, setEbOriginalPrice] = useState(320);
  const [ebPdfUrl, setEbPdfUrl] = useState('');
  const [ebCover, setEbCover] = useState('/src/assets/images/course_english_books_1795411661325.jpg');
  const [ebSummary, setEbSummary] = useState('');
  const [ebSamples, setEbSamples] = useState(
    'Chapter 1: Core Concepts & Grammar Frameworks\nChapter 2: Solved Board Questions & Practice'
  );

  // Product form + edit
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prTitle, setPrTitle] = useState('');
  const [prCategory, setPrCategory] = useState('Books');
  const [prPrice, setPrPrice] = useState(420);
  const [prOriginalPrice, setPrOriginalPrice] = useState(550);
  const [prStock, setPrStock] = useState(40);
  const [prActive, setPrActive] = useState(true);
  const [prImage, setPrImage] = useState('/src/assets/images/course_english_books_1795411661325.jpg');
  const [prDesc, setPrDesc] = useState('');

  // Instructor form
  const [inName, setInName] = useState('');
  const [inSubject, setInSubject] = useState('HSC & IELTS Grammar');
  const [inRoleTitle, setInRoleTitle] = useState('Senior Faculty');
  const [inEducation, setInEducation] = useState('MA in English, University of Dhaka');
  const [inBranchId, setInBranchId] = useState(activeBranches[0]?.id ?? branches[0]?.id ?? '');
  const [inAvatar, setInAvatar] = useState('/src/assets/images/instructor_portrait_lead_1795411661581.jpg');

  // Category form + edit + filter
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'course' | 'product' | 'ebook' | 'post'>('course');
  const [catDesc, setCatDesc] = useState('');
  const [catActive, setCatActive] = useState(true);
  const [catImage, setCatImage] = useState('/src/assets/images/hero_hsc_english_1795411661478.jpg');
  const [catFilterType, setCatFilterType] = useState<'all' | 'course' | 'product' | 'ebook' | 'post'>('all');

  // Post form + edit + convert-to-course
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState('');
  const [postCat, setPostCat] = useState('Exam Strategy & Tips');
  const [postStatus, setPostStatus] = useState<'published' | 'draft'>('published');
  const [postContent, setPostContent] = useState('');
  const [postImage, setPostImage] = useState('');
  const [convertingPostId, setConvertingPostId] = useState<string | null>(null);
  const [convTitle, setConvTitle] = useState('');
  const [convCategory, setConvCategory] = useState(syncedCourseCategories[0] ?? 'HSC English');
  const [convPrice, setConvPrice] = useState(2500);
  const [convOriginalPrice, setConvOriginalPrice] = useState(3500);
  const [convLevelTag, setConvLevelTag] = useState('Featured Course');
  const [convDuration, setConvDuration] = useState('3 Months · 36 Live Classes');
  const [convStatus, setConvStatus] = useState<'active' | 'draft'>('active');

  // Coupon form
  const [cpCode, setCpCode] = useState('');
  const [cpPercent, setCpPercent] = useState(15);
  const [cpAppliesTo, setCpAppliesTo] = useState<'all' | 'courses' | 'products'>('all');
  const [cpDesc, setCpDesc] = useState('');

  const resetEbookForm = () => {
    setEditingEbookId(null);
    setEbTitle('');
    setEbLevel('HSC 27');
    setEbCategory('Digital PDF');
    setEbAuthor('Aloms English Academic Team');
    setEbPages(120);
    setEbIsFree(false);
    setEbPrice(190);
    setEbOriginalPrice(320);
    setEbPdfUrl('');
    setEbCover('/src/assets/images/course_english_books_1795411661325.jpg');
    setEbSummary('');
    setEbSamples('Chapter 1: Core Concepts & Grammar Frameworks\nChapter 2: Solved Board Questions & Practice');
  };

  const resetProductForm = () => {
    setEditingProductId(null);
    setPrTitle('');
    setPrCategory('Books');
    setPrPrice(420);
    setPrOriginalPrice(550);
    setPrStock(40);
    setPrActive(true);
    setPrImage('/src/assets/images/course_english_books_1795411661325.jpg');
    setPrDesc('');
  };

  const resetCatForm = () => {
    setEditingCatId(null);
    setCatName('');
    setCatType('course');
    setCatDesc('');
    setCatActive(true);
    setCatImage('/src/assets/images/hero_hsc_english_1795411661478.jpg');
  };

  const resetPostForm = () => {
    setEditingPostId(null);
    setPostTitle('');
    setPostCat('Exam Strategy & Tips');
    setPostStatus('published');
    setPostContent('');
    setPostImage('');
  };

  const softDelete = async (endpoint: string, id: string, label: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setPanelError(null);
    try {
      await apiFetch(`${endpoint}/${id}`, { method: 'DELETE' });
      setConfirmId(null);
      await onRefresh();
      onNotify(`${label} moved to Recycle Bin.`);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : `Could not delete ${label}.`);
    }
  };

  const ebookSalesTransactions = transactions.filter(
    (t) => t.referenceType === 'ebook' && t.status === 'completed'
  );
  const totalEbookRevenue = ebookSalesTransactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
  const totalEbookCopiesSold = ebooks.reduce((sum, e) => sum + (e.salesCount || 0), 0);
  const paidEbooksCount = ebooks.filter((e) => !canClaimEbookFree(e)).length;

  return (
    <div className="space-y-6">
      {panelError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800"
        >
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{panelError}</span>
          </span>
          <button
            type="button"
            onClick={() => setPanelError(null)}
            className="rounded p-1 text-rose-600 hover:bg-rose-100"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
        {[
          { id: 'ebooks' as const, label: `E-Books & PDF Store (${ebooks.length})` },
          { id: 'products' as const, label: `Products (${products.length})` },
          { id: 'categories' as const, label: `Categories (${categories.length})` },
          { id: 'posts' as const, label: `Posts & Course Builder (${posts.length})` },
          { id: 'instructors' as const, label: `Instructors (${instructors.length})` },
          { id: 'coupons' as const, label: `Coupons (${coupons.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setSubTab(tab.id);
              setConfirmId(null);
              setPanelError(null);
            }}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
              subTab === tab.id ? 'bg-[#062436] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* E-BOOKS & DIGITAL PDF SELLING SYSTEM */}
      {subTab === 'ebooks' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold text-slate-500">Total Digital E-Books</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900">
                {ebooks.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold text-slate-500">Paid vs Free PDFs</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-indigo-700">
                {paidEbooksCount} Paid / {ebooks.length - paidEbooksCount} Free
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold text-slate-500">E-Book Copies Sold</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900">
                {totalEbookCopiesSold}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold text-slate-500">Paid E-Book Revenue</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-emerald-700">
                ৳{totalEbookRevenue.toLocaleString()}
              </p>
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPanelError(null);
              setSaving(true);
              try {
                const payload = {
                  title: ebTitle.trim(),
                  level: ebLevel.trim(),
                  category: ebCategory.trim() || 'Digital PDF',
                  author: ebAuthor.trim() || 'Aloms English Academic Team',
                  pagesCount: Math.max(5, Number(ebPages) || 120),
                  isFree: ebIsFree,
                  price: ebIsFree ? 0 : Math.max(0, Number(ebPrice) || 0),
                  originalPrice: ebIsFree ? 0 : Math.max(Number(ebPrice) || 0, Number(ebOriginalPrice) || 0),
                  coverImage: ebCover,
                  pdfUrl: ebPdfUrl.trim(),
                  summary: ebSummary.trim(),
                  sampleContent: ebSamples
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                };
                if (editingEbookId) {
                  await apiFetch(`/api/portal/ebooks/${editingEbookId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                  });
                  onNotify('E-Book updated.');
                } else {
                  await apiFetch('/api/portal/ebooks', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                  });
                  onNotify('E-Book published to Digital PDF Store.');
                }
                resetEbookForm();
                await onRefresh();
              } catch (err) {
                setPanelError(err instanceof Error ? err.message : 'Failed to save E-Book.');
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingEbookId ? 'Edit Digital E-Book / PDF' : 'Publish Paid or Free Digital E-Book / PDF'}
                </h2>
                <p className="text-xs text-slate-500">
                  Paid PDFs automatically route buyers through the 4-Step Payment Checkout and unlock downloadable access.
                </p>
              </div>
              {editingEbookId && (
                <button
                  type="button"
                  onClick={resetEbookForm}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input
                type="text"
                required
                placeholder="E-Book Title"
                aria-label="E-Book Title"
                value={ebTitle}
                onChange={(e) => setEbTitle(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold sm:col-span-2"
              />
              <input
                type="text"
                placeholder="Target Level (e.g. HSC 27, IELTS)"
                aria-label="Target Level"
                value={ebLevel}
                onChange={(e) => setEbLevel(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
              />
              <select
                value={ebCategory}
                onChange={(e) => setEbCategory(e.target.value)}
                aria-label="E-Book Category"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
              >
                {syncedEbookCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input
                type="text"
                placeholder="Author / Faculty Name"
                aria-label="E-Book Author"
                value={ebAuthor}
                onChange={(e) => setEbAuthor(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="number"
                min={5}
                placeholder="Pages Count"
                aria-label="Pages Count"
                value={ebPages}
                onChange={(e) => setEbPages(Number(e.target.value))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <div className="flex items-center gap-3 sm:col-span-2">
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={ebIsFree}
                    onChange={(e) => setEbIsFree(e.target.checked)}
                  />
                  Free Download
                </label>
                {!ebIsFree && (
                  <>
                    <input
                      type="number"
                      min={1}
                      value={ebPrice}
                      onChange={(e) => setEbPrice(Number(e.target.value))}
                      placeholder="Price ৳"
                      aria-label="E-Book Sale Price"
                      className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                    />
                    <input
                      type="number"
                      min={1}
                      value={ebOriginalPrice}
                      onChange={(e) => setEbOriginalPrice(Number(e.target.value))}
                      placeholder="Regular ৳"
                      aria-label="E-Book Original Price"
                      className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ImageUploadField label="E-Book Cover Photo" value={ebCover} onChange={setEbCover} />
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-600">
                  PDF Download / Reader URL (optional external or /downloads/... link)
                </label>
                <input
                  type="text"
                  placeholder="https://... or /downloads/grammar-handbook.pdf"
                  aria-label="PDF Download URL"
                  value={ebPdfUrl}
                  onChange={(e) => setEbPdfUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <input
              type="text"
              placeholder="Short marketing summary..."
              aria-label="E-Book Summary"
              value={ebSummary}
              onChange={(e) => setEbSummary(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <textarea
              rows={2}
              placeholder="Digital Reader Chapters / Sample Notes (one per line)..."
              aria-label="Digital Reader Sample Chapters"
              value={ebSamples}
              onChange={(e) => setEbSamples(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs"
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#062436] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0b3854] disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingEbookId ? 'Save E-Book Changes' : 'Publish E-Book'}
            </button>
          </form>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {ebooks.map((eb) => {
              const isFree = canClaimEbookFree(eb);
              return (
                <div
                  key={eb.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <img
                      src={eb.coverImage || '/src/assets/images/course_english_books_1795411661325.jpg'}
                      alt={eb.title}
                      className="h-14 w-12 shrink-0 rounded-lg object-cover border border-slate-200"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{eb.title}</p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {eb.level} · {eb.category || 'Digital PDF'} ·{' '}
                        <span className={`font-mono font-bold ${isFree ? 'text-emerald-700' : 'text-indigo-700'}`}>
                          {isFree ? 'FREE' : `৳${eb.price}`}
                        </span>
                      </p>
                      <p className="mt-1 font-mono text-[11px] tabular-nums text-slate-500">
                        {eb.pagesCount} pages · {eb.salesCount ?? 0} unlocked/sold
                        {eb.pdfUrl ? ' · PDF Attached' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEbookId(eb.id);
                        setEbTitle(eb.title);
                        setEbLevel(eb.level);
                        setEbCategory(eb.category || 'Digital PDF');
                        setEbAuthor(eb.author);
                        setEbPages(eb.pagesCount);
                        setEbIsFree(eb.isFree);
                        setEbPrice(eb.price);
                        setEbOriginalPrice(eb.originalPrice);
                        setEbPdfUrl(eb.pdfUrl || '');
                        setEbCover(eb.coverImage || '/src/assets/images/course_english_books_1795411661325.jpg');
                        setEbSummary(eb.summary);
                        setEbSamples((eb.sampleContent || []).join('\n'));
                      }}
                      aria-label={`Edit E-Book ${eb.title}`}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void softDelete('/api/portal/ebooks', eb.id, eb.title)}
                      aria-label={`Delete E-Book ${eb.title}`}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                        confirmId === eb.id ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmId === eb.id && <span>Confirm</span>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {ebookSalesTransactions.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Recent Paid E-Book Purchases ({ebookSalesTransactions.length})
              </h3>
              <div className="divide-y divide-slate-100 text-xs">
                {ebookSalesTransactions.slice(0, 6).map((tx) => (
                  <div key={tx.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <span className="font-mono font-bold text-slate-900">{tx.invoiceNo}</span>
                      <span className="ml-2 font-semibold text-slate-700">{tx.payerName}</span>
                      <span className="ml-2 text-slate-500">via {tx.gateway}</span>
                    </div>
                    <span className="font-mono font-bold tabular-nums text-emerald-700">
                      ৳{tx.totalAmount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PRODUCTS */}
      {subTab === 'products' && (
        <div className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPanelError(null);
              setSaving(true);
              try {
                const payload = {
                  title: prTitle.trim(),
                  category: prCategory.trim() || 'Books',
                  price: Math.max(0, Number(prPrice) || 0),
                  originalPrice: Math.max(Number(prPrice) || 0, Number(prOriginalPrice) || 0),
                  stock: Math.max(0, Math.round(Number(prStock) || 0)),
                  active: prActive,
                  image: prImage,
                  description: prDesc.trim(),
                };
                if (editingProductId) {
                  await apiFetch(`/api/portal/products/${editingProductId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                  });
                  onNotify('Product updated.');
                } else {
                  await apiFetch('/api/portal/products', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                  });
                  onNotify('Product added to Book Store.');
                }
                resetProductForm();
                await onRefresh();
              } catch (err) {
                setPanelError(err instanceof Error ? err.message : 'Could not save product.');
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">
                {editingProductId ? 'Edit Store Product' : 'Create Book / Study Store Product'}
              </h2>
              {editingProductId && (
                <button
                  type="button"
                  onClick={resetProductForm}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <input
                type="text"
                required
                placeholder="Product Title"
                aria-label="Product Title"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold sm:col-span-2"
              />
              <select
                value={prCategory}
                onChange={(e) => setPrCategory(e.target.value)}
                aria-label="Product Category"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
              >
                {syncedProductCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={prPrice}
                  onChange={(e) => setPrPrice(Number(e.target.value))}
                  placeholder="৳ Price"
                  aria-label="Product Price"
                  className="w-1/2 rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-semibold"
                />
                <input
                  type="number"
                  min={0}
                  value={prOriginalPrice}
                  onChange={(e) => setPrOriginalPrice(Number(e.target.value))}
                  placeholder="৳ Regular"
                  aria-label="Product Regular Price"
                  className="w-1/2 rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={prStock}
                  onChange={(e) => setPrStock(Number(e.target.value))}
                  placeholder="Stock"
                  aria-label="Product Stock"
                  className="w-20 rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-semibold"
                />
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={prActive}
                    onChange={(e) => setPrActive(e.target.checked)}
                  />
                  Active
                </label>
              </div>
            </div>
            <ImageUploadField label="Product Photo" value={prImage} onChange={setPrImage} />
            <input
              type="text"
              placeholder="Product description..."
              aria-label="Product Description"
              value={prDesc}
              onChange={(e) => setPrDesc(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#062436] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0b3854] disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingProductId ? 'Save Product Changes' : 'Add Product'}
            </button>
          </form>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {products.map((p) => {
              const isVisible = p.active !== false;
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={p.image}
                      alt={p.title}
                      className="h-12 w-12 shrink-0 rounded-lg object-cover border border-slate-200"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{p.title}</p>
                      <p className="font-mono text-xs tabular-nums text-slate-500">
                        {p.category} · ৳{p.price} · Stock {p.stock} ·{' '}
                        <span className={isVisible ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                          {isVisible ? 'Active' : 'Hidden'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiFetch(`/api/portal/products/${p.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ stock: p.stock + 5 }),
                          });
                          await onRefresh();
                          onNotify(`${p.title} restocked (+5).`);
                        } catch (err) {
                          setPanelError(err instanceof Error ? err.message : 'Stock update failed.');
                        }
                      }}
                      className="rounded-lg border border-slate-200 px-2 py-1 font-mono text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                      title="Add 5 stock"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiFetch(`/api/portal/products/${p.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ active: !isVisible }),
                          });
                          await onRefresh();
                          onNotify(`${p.title} marked ${!isVisible ? 'Active' : 'Hidden'}.`);
                        } catch (err) {
                          setPanelError(err instanceof Error ? err.message : 'Visibility update failed.');
                        }
                      }}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${
                        isVisible
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {isVisible ? 'Visible' : 'Hidden'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProductId(p.id);
                        setPrTitle(p.title);
                        setPrCategory(p.category);
                        setPrPrice(p.price);
                        setPrOriginalPrice(p.originalPrice);
                        setPrStock(p.stock);
                        setPrActive(p.active !== false);
                        setPrImage(p.image);
                        setPrDesc(p.description);
                      }}
                      aria-label={`Edit Product ${p.title}`}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void softDelete('/api/portal/products', p.id, p.title)}
                      aria-label={`Delete Product ${p.title}`}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold ${
                        confirmId === p.id ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmId === p.id && <span>Confirm</span>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CATEGORIES */}
      {subTab === 'categories' && (
        <div className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPanelError(null);
              setSaving(true);
              try {
                const payload = {
                  name: catName.trim(),
                  type: catType,
                  description: catDesc.trim(),
                  image: catImage,
                  active: catActive,
                };
                if (editingCatId) {
                  await apiFetch(`/api/portal/categories/${editingCatId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                  });
                  onNotify('Category updated and synced across catalog.');
                } else {
                  await apiFetch('/api/portal/categories', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                  });
                  onNotify('Category created and synced across catalog.');
                }
                resetCatForm();
                await onRefresh();
              } catch (err) {
                setPanelError(err instanceof Error ? err.message : 'Could not save category.');
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingCatId ? 'Edit Category' : 'Create Category'}
                </h2>
                <p className="text-xs text-slate-500">
                  Active Course categories automatically appear in the Course Creator and public /courses filters.
                </p>
              </div>
              {editingCatId && (
                <button
                  type="button"
                  onClick={resetCatForm}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                required
                placeholder="Category Name (e.g. Spoken Fluency)"
                aria-label="Category Name"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
              />
              <select
                value={catType}
                onChange={(e) =>
                  setCatType(e.target.value as 'course' | 'product' | 'ebook' | 'post')
                }
                aria-label="Category Type"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
              >
                <option value="course">Course Category</option>
                <option value="product">Product Category</option>
                <option value="ebook">E-Book Category</option>
                <option value="post">Community Post Category</option>
              </select>
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={catActive}
                  onChange={(e) => setCatActive(e.target.checked)}
                />
                Active in Public Filters
              </label>
            </div>
            <input
              type="text"
              placeholder="Short category description..."
              aria-label="Category Description"
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <ImageUploadField label="Category Icon / Banner" value={catImage} onChange={setCatImage} />
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#062436] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0b3854] disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingCatId ? 'Update Category' : 'Create Category'}
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {(['all', 'course', 'product', 'ebook', 'post'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCatFilterType(t)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize ${
                  catFilterType === t
                    ? 'border-[#062436] bg-[#062436] text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t === 'all' ? 'All Types' : `${t} (${categories.filter((c) => c.type === t).length})`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {categories
              .filter((c) => catFilterType === 'all' || c.type === catFilterType)
              .map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-indigo-700">
                      {cat.type} · {cat.active ? 'Active' : 'Inactive'}
                    </span>
                    <p className="truncate text-sm font-bold text-slate-900">{cat.name}</p>
                    {cat.description && (
                      <p className="truncate text-[11px] text-slate-500">{cat.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiFetch(`/api/portal/categories/${cat.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ active: !cat.active }),
                          });
                          await onRefresh();
                        } catch (err) {
                          setPanelError(err instanceof Error ? err.message : 'Status toggle failed.');
                        }
                      }}
                      aria-label={`Toggle active for ${cat.name}`}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                        cat.active
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {cat.active ? 'On' : 'Off'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCatId(cat.id);
                        setCatName(cat.name);
                        setCatType(cat.type);
                        setCatDesc(cat.description);
                        setCatActive(cat.active);
                        setCatImage(cat.image || '/src/assets/images/hero_hsc_english_1795411661478.jpg');
                      }}
                      aria-label={`Edit Category ${cat.name}`}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void softDelete('/api/portal/categories', cat.id, cat.name)}
                      aria-label={`Delete Category ${cat.name}`}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${
                        confirmId === cat.id ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmId === cat.id && <span>Confirm</span>}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* POSTS & 1-CLICK COURSE CONVERSION */}
      {subTab === 'posts' && (
        <div className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPanelError(null);
              setSaving(true);
              try {
                const payload = {
                  title: postTitle.trim(),
                  category: postCat.trim() || 'Exam Strategy & Tips',
                  status: postStatus,
                  content: postContent.trim(),
                  image: postImage.trim(),
                };
                if (editingPostId) {
                  await apiFetch(`/api/portal/posts/${editingPostId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                  });
                  onNotify('Post updated.');
                } else {
                  await apiFetch('/api/portal/posts', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                  });
                  onNotify('Community post published.');
                }
                resetPostForm();
                await onRefresh();
              } catch (err) {
                setPanelError(err instanceof Error ? err.message : 'Could not save post.');
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingPostId ? 'Edit Community / Blog Post' : 'Create Blog / Community Post'}
                </h2>
                <p className="text-xs text-slate-500">
                  Any published or draft post below can be converted into a full Course in 1 click.
                </p>
              </div>
              {editingPostId && (
                <button
                  type="button"
                  onClick={resetPostForm}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                required
                placeholder="Post Title"
                aria-label="Post Title"
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
              />
              <select
                value={postCat}
                onChange={(e) => setPostCat(e.target.value)}
                aria-label="Post Category"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
              >
                {syncedPostCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <select
                value={postStatus}
                onChange={(e) => setPostStatus(e.target.value as 'published' | 'draft')}
                aria-label="Post Status"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            <textarea
              rows={3}
              required
              placeholder="Write article, syllabus overview, or study guide..."
              aria-label="Post Content"
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3 text-xs"
            />
            <ImageUploadField label="Post Header Image" value={postImage} onChange={setPostImage} />
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#062436] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0b3854] disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingPostId ? 'Save Post Changes' : 'Publish Post'}
            </button>
          </form>

          <div className="space-y-3">
            {posts.map((p) => {
              const isConverting = convertingPostId === p.id;
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold uppercase text-sky-700">{p.category}</span>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            p.status === 'published'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-slate-900">{p.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{p.content}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        By {p.authorName} · {p.likes} likes · {p.comments.length} comments
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (isConverting) {
                            setConvertingPostId(null);
                            return;
                          }
                          setConvertingPostId(p.id);
                          setConvTitle(p.title);
                          const matchedCat = syncedCourseCategories.find(
                            (c) => c.toLowerCase() === p.category.toLowerCase()
                          );
                          setConvCategory(matchedCat || syncedCourseCategories[0] || 'HSC English');
                          setConvPrice(2500);
                          setConvOriginalPrice(3500);
                          setConvLevelTag('Featured Course');
                          setConvDuration('3 Months · 36 Live Classes');
                          setConvStatus('active');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>{isConverting ? 'Close Builder' : 'Create Course from Post'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPostId(p.id);
                          setPostTitle(p.title);
                          setPostCat(p.category);
                          setPostStatus(p.status);
                          setPostContent(p.content);
                          setPostImage(p.image || '');
                        }}
                        aria-label={`Edit Post ${p.title}`}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void softDelete('/api/portal/posts', p.id, p.title)}
                        aria-label={`Delete Post ${p.title}`}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                          confirmId === p.id ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50'
                        }`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {confirmId === p.id && <span>Confirm</span>}
                      </button>
                    </div>
                  </div>

                  {isConverting && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setPanelError(null);
                        setSaving(true);
                        try {
                          const res = await apiFetch<{ course: Course }>(
                            `/api/portal/posts/${p.id}/convert-to-course`,
                            {
                              method: 'POST',
                              body: JSON.stringify({
                                title: convTitle.trim(),
                                category: convCategory,
                                price: Number(convPrice) || 0,
                                originalPrice: Number(convOriginalPrice) || Number(convPrice) || 0,
                                levelTag: convLevelTag.trim(),
                                duration: convDuration.trim(),
                                status: convStatus,
                              }),
                            }
                          );
                          setConvertingPostId(null);
                          await onRefresh();
                          onNotify(`Course "${res.course.title}" created from post!`);
                        } catch (err) {
                          setPanelError(
                            err instanceof Error ? err.message : 'Failed to convert post into course.'
                          );
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-indigo-900">
                          Convert Post into Course (Active Branches Automatically Linked)
                        </p>
                        <span className="font-mono text-[11px] text-indigo-700">
                          {activeBranches.length} active branches
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        <input
                          type="text"
                          required
                          value={convTitle}
                          onChange={(e) => setConvTitle(e.target.value)}
                          placeholder="Course Title"
                          aria-label="Converted Course Title"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold sm:col-span-2"
                        />
                        <select
                          value={convCategory}
                          onChange={(e) => setConvCategory(e.target.value)}
                          aria-label="Converted Course Category"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
                        >
                          {syncedCourseCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                        <input
                          type="number"
                          min={0}
                          value={convPrice}
                          onChange={(e) => setConvPrice(Number(e.target.value))}
                          placeholder="Price ৳"
                          aria-label="Converted Course Price"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
                        />
                        <input
                          type="number"
                          min={0}
                          value={convOriginalPrice}
                          onChange={(e) => setConvOriginalPrice(Number(e.target.value))}
                          placeholder="Original ৳"
                          aria-label="Converted Course Original Price"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                        />
                        <input
                          type="text"
                          value={convLevelTag}
                          onChange={(e) => setConvLevelTag(e.target.value)}
                          placeholder="Level Tag"
                          aria-label="Converted Course Level Tag"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                        />
                        <input
                          type="text"
                          value={convDuration}
                          onChange={(e) => setConvDuration(e.target.value)}
                          placeholder="Duration"
                          aria-label="Converted Course Duration"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                        />
                        <select
                          value={convStatus}
                          onChange={(e) => setConvStatus(e.target.value as 'active' | 'draft')}
                          aria-label="Converted Course Status"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
                        >
                          <option value="active">Active (Live)</option>
                          <option value="draft">Draft</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#062436] px-4 py-2 text-xs font-bold text-white hover:bg-[#0b3854]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Confirm &amp; Create Course</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConvertingPostId(null)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* INSTRUCTORS */}
      {subTab === 'instructors' && (
        <div className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPanelError(null);
              try {
                await apiFetch('/api/portal/instructors', {
                  method: 'POST',
                  body: JSON.stringify({
                    name: inName,
                    subject: inSubject,
                    roleTitle: inRoleTitle,
                    education: inEducation,
                    branchId: inBranchId || activeBranches[0]?.id || '',
                    avatar: inAvatar,
                  }),
                });
                setInName('');
                await onRefresh();
                onNotify('Instructor added to Faculty Panel.');
              } catch (err) {
                setPanelError(err instanceof Error ? err.message : 'Could not add instructor.');
              }
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900">Create Instructor Profile</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                required
                placeholder="Instructor Name"
                value={inName}
                onChange={(e) => setInName(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
              />
              <input
                type="text"
                placeholder="Subject Specialty"
                value={inSubject}
                onChange={(e) => setInSubject(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <select
                value={inBranchId}
                onChange={(e) => setInBranchId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              >
                {activeBranches.length === 0 ? (
                  <option value="">Head Office (Online)</option>
                ) : (
                  activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Role Title"
                value={inRoleTitle}
                onChange={(e) => setInRoleTitle(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="text"
                placeholder="Education Qualification"
                value={inEducation}
                onChange={(e) => setInEducation(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <ImageUploadField label="Instructor Portrait" value={inAvatar} onChange={setInAvatar} />
            <button
              type="submit"
              className="rounded-lg bg-[#062436] px-5 py-2.5 text-xs font-bold text-white"
            >
              Add Instructor
            </button>
          </form>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {instructors.map((ins) => (
              <div
                key={ins.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={ins.avatar}
                    alt={ins.name}
                    className="h-12 w-12 rounded-lg object-cover border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-900">{ins.name}</p>
                    <p className="text-xs text-slate-500">
                      {ins.roleTitle} · {ins.subject}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void softDelete('/api/portal/instructors', ins.id, ins.name)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                    confirmId === ins.id ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50'
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {confirmId === ins.id && <span>Confirm</span>}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COUPONS */}
      {subTab === 'coupons' && (
        <div className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPanelError(null);
              try {
                await apiFetch('/api/portal/coupons', {
                  method: 'POST',
                  body: JSON.stringify({
                    code: cpCode,
                    discountPercent: cpPercent,
                    appliesTo: cpAppliesTo,
                    description: cpDesc,
                    active: true,
                  }),
                });
                setCpCode('');
                setCpDesc('');
                await onRefresh();
                onNotify('Promo coupon saved & active.');
              } catch (err) {
                setPanelError(err instanceof Error ? err.message : 'Could not save coupon.');
              }
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900">
              Promo Coupon Engine (Courses, E-Books &amp; Store Products)
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input
                type="text"
                required
                placeholder="CODE (e.g. ALOMS25)"
                value={cpCode}
                onChange={(e) => setCpCode(e.target.value.toUpperCase())}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-extrabold uppercase"
              />
              <input
                type="number"
                min={1}
                max={90}
                value={cpPercent}
                onChange={(e) => setCpPercent(Number(e.target.value))}
                placeholder="Discount %"
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <select
                value={cpAppliesTo}
                onChange={(e) => setCpAppliesTo(e.target.value as 'all' | 'courses' | 'products')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
              >
                <option value="all">Applies to All (Courses, E-Books, Products)</option>
                <option value="courses">Courses &amp; E-Books Only</option>
                <option value="products">Book Store Products</option>
              </select>
              <input
                type="text"
                placeholder="Description"
                value={cpDesc}
                onChange={(e) => setCpDesc(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#062436] px-5 py-2.5 text-xs font-bold text-white"
            >
              <Tag className="h-3.5 w-3.5" />
              <span>Save Promo Coupon</span>
            </button>
          </form>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {coupons.map((cp) => (
              <div
                key={cp.code}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <span className="font-mono rounded bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-900">
                    {cp.code} · {cp.discountPercent}% OFF
                  </span>
                  <p className="mt-1 text-xs text-slate-600">
                    Scope: {cp.appliesTo || 'all'} · {cp.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiFetch(`/api/portal/coupons/${cp.code}`, { method: 'DELETE' });
                      await onRefresh();
                      onNotify(`Coupon ${cp.code} removed.`);
                    } catch (err) {
                      setPanelError(err instanceof Error ? err.message : 'Could not delete coupon.');
                    }
                  }}
                  className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                  aria-label={`Remove ${cp.code}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 3. REGULAR ATTENDANCE, MONTHLY PAYROLL & FINANCE P&L
 * ========================================================================== */
interface AttendanceFinancePanelProps extends RefreshProps {
  role: UserRole;
  users: User[];
  attendance: AttendanceRecord[];
  payrolls: PayrollRecord[];
  financialRecords: FinancialRecord[];
  transactions: PaymentTransaction[];
}

export function AttendanceFinancePanel({
  role,
  users,
  attendance,
  payrolls,
  financialRecords,
  transactions,
  onRefresh,
  onNotify,
}: AttendanceFinancePanelProps) {
  const { apiFetch } = useAuth();
  const [tab, setTab] = useState<'attendance' | 'payroll' | 'finance'>('attendance');
  const [targetFilter, setTargetFilter] = useState<'student' | 'teacher'>('student');
  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0, 10));

  // Payroll form
  const staffUsers = users.filter(
    (u) => u.role === 'teacher' || u.role === 'branch_manager' || u.role === 'accountant' || u.role === 'staff'
  );
  const [empId, setEmpId] = useState(staffUsers[0]?.id ?? '');
  const [monthKey, setMonthKey] = useState(new Date().toISOString().slice(0, 7));
  const [baseSalary, setBaseSalary] = useState(32000);
  const [allowances, setAllowances] = useState(3000);
  const [bonuses, setBonuses] = useState(2000);
  const [deductions, setDeductions] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [activePayslip, setActivePayslip] = useState<PayrollRecord | null>(null);

  // Finance entry form
  const [finType, setFinType] = useState<'income' | 'expense' | 'refund'>('expense');
  const [finCat, setFinCat] = useState('Campus Rent & Utilities');
  const [finTitle, setFinTitle] = useState('');
  const [finAmount, setFinAmount] = useState(5000);

  const canManageFinance = isAdminRole(role) || role === 'branch_manager' || role === 'accountant';
  const attSummary = computeAttendanceSummary(attendance);

  const markAttendance = async (u: User, status: AttendanceRecord['status']) => {
    await apiFetch('/api/portal/attendance', {
      method: 'POST',
      body: JSON.stringify({
        targetType: u.role === 'student' ? 'student' : 'teacher',
        targetId: u.id,
        branchId: u.branchId,
        date: attDate,
        status,
      }),
    });
    await onRefresh();
    onNotify(`${u.name} marked ${status} for ${attDate}.`);
  };

  const totalIncome = financialRecords
    .filter((f) => f.type === 'income')
    .reduce((s, f) => s + f.amount, 0);
  const totalExpense = financialRecords
    .filter((f) => f.type !== 'income')
    .reduce((s, f) => s + f.amount, 0);

  const visibleAttendanceTargets = users.filter((u) =>
    targetFilter === 'student'
      ? u.role === 'student'
      : u.role === 'teacher' || u.role === 'branch_manager' || u.role === 'staff' || u.role === 'accountant'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
        <button
          type="button"
          onClick={() => setTab('attendance')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold ${
            tab === 'attendance' ? 'bg-[#062436] text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <UserCheck className="h-3.5 w-3.5" />
          <span>Regular Attendance ({attendance.length})</span>
        </button>
        {canManageFinance && (
          <>
            <button
              type="button"
              onClick={() => setTab('payroll')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold ${
                tab === 'payroll' ? 'bg-[#062436] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Wallet className="h-3.5 w-3.5" />
              <span>Teacher & Staff Payroll ({payrolls.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('finance')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold ${
                tab === 'finance' ? 'bg-[#062436] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Coins className="h-3.5 w-3.5" />
              <span>Finance P&L & Invoices</span>
            </button>
          </>
        )}
      </div>

      {/* ATTENDANCE */}
      {tab === 'attendance' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Daily Student, Teacher &amp; Staff Attendance Sheet
                </h2>
                <p className="text-xs text-slate-500">
                  Monthly Rate: <strong className="font-mono tabular-nums text-emerald-700">{attSummary.attendanceRate}%</strong> · Present: {attSummary.present} · Late: {attSummary.late} · Absent: {attSummary.absent} · Leave: {attSummary.leave}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={attDate}
                  onChange={(e) => setAttDate(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold"
                />
                <button
                  type="button"
                  onClick={() => setTargetFilter('student')}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                    targetFilter === 'student'
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  Students
                </button>
                <button
                  type="button"
                  onClick={() => setTargetFilter('teacher')}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                    targetFilter === 'teacher'
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  Teachers & Staff
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {visibleAttendanceTargets.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Attendance marking is linked with your branch directory.
                </p>
              ) : (
                visibleAttendanceTargets.map((u) => {
                  const rec = attendance.find((a) => a.targetId === u.id && a.date === attDate);
                  return (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900">{u.name}</p>
                        <p className="text-xs text-slate-500">
                          {u.rollNumber || u.role} ·{' '}
                          {rec ? (
                            <span className="font-bold text-emerald-700">
                              Marked: {rec.status.toUpperCase()} ({rec.checkInTime})
                            </span>
                          ) : (
                            'Not marked for this date'
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(['present', 'late', 'absent', 'leave'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => void markAttendance(u, st)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold capitalize ${
                              rec?.status === st
                                ? st === 'present'
                                  ? 'bg-emerald-600 text-white'
                                  : st === 'absent'
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-amber-600 text-white'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h3 className="text-sm font-extrabold text-slate-900">Recent Attendance Logs</h3>
            <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
              {attendance.slice(0, 15).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                >
                  <span>
                    <strong>{a.targetName}</strong> ({a.targetType}) · {a.date}
                  </span>
                  <span className="font-bold uppercase text-indigo-700">
                    {a.status} · {a.checkInTime}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PAYROLL */}
      {tab === 'payroll' && canManageFinance && (
        <div className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPayErr(null);
              try {
                await apiFetch('/api/portal/payroll', {
                  method: 'POST',
                  body: JSON.stringify({
                    employeeId: empId,
                    monthKey,
                    baseSalary,
                    allowances,
                    bonuses,
                    deductions,
                    advance,
                  }),
                });
                await onRefresh();
                onNotify(`Payroll generated for ${monthKey}.`);
              } catch (err) {
                setPayErr(err instanceof Error ? err.message : 'Payroll creation failed.');
              }
            }}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-slate-900">
                Monthly Teacher & Staff Payroll Generator
              </h2>
              <span className="font-mono-tabular rounded-xl bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
                Net Pay: ৳{calculateNetPayroll(baseSalary, allowances, bonuses, deductions, advance).toLocaleString()}
              </span>
            </div>
            {payErr && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{payErr}</p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                required
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
              <input
                type="month"
                required
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold"
              />
              <input
                type="number"
                value={baseSalary}
                onChange={(e) => setBaseSalary(Number(e.target.value))}
                placeholder="Base Salary"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <input
                type="number"
                value={allowances}
                onChange={(e) => setAllowances(Number(e.target.value))}
                placeholder="Allowances"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="number"
                value={bonuses}
                onChange={(e) => setBonuses(Number(e.target.value))}
                placeholder="Bonuses"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="number"
                value={deductions}
                onChange={(e) => setDeductions(Number(e.target.value))}
                placeholder="Deductions"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="number"
                value={advance}
                onChange={(e) => setAdvance(Number(e.target.value))}
                placeholder="Advance"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-[#062436] px-5 py-2.5 text-xs font-bold text-white"
            >
              Generate Payroll Sheet
            </button>
          </form>

          <div className="space-y-2.5">
            {payrolls.map((pr) => (
              <div
                key={pr.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {pr.employeeName} · {pr.monthKey}
                  </p>
                  <p className="font-mono-tabular text-slate-500">
                    Base ৳{pr.baseSalary} + Bonus ৳{pr.bonuses} = Net{' '}
                    <strong className="text-slate-900">৳{pr.netSalary.toLocaleString()}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold uppercase text-slate-700">
                    {pr.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActivePayslip(pr)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Payslip
                  </button>
                  {pr.status !== 'paid' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/portal/payroll/${pr.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: 'paid' }),
                        });
                        await onRefresh();
                        onNotify(`Salary marked Paid for ${pr.employeeName} & logged to Finance Expense.`);
                      }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700"
                    >
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {activePayslip && (
            <div role="dialog" aria-label="Employee Payslip" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
              <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
                <div className="border-b border-slate-200 pb-3">
                  <p className="text-xs font-bold uppercase text-indigo-700">Aloms English Center · Official Payslip</p>
                  <h3 className="text-lg font-extrabold text-slate-900">{activePayslip.employeeName}</h3>
                  <p className="text-xs text-slate-500">Month: {activePayslip.monthKey} · Role: {activePayslip.role} · Status: {activePayslip.status.toUpperCase()}</p>
                </div>
                <div className="space-y-1.5 text-xs font-mono tabular-nums">
                  <div className="flex justify-between"><span>Basic Salary</span><span>৳{activePayslip.baseSalary.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Allowances</span><span>+৳{activePayslip.allowances.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Bonuses</span><span>+৳{activePayslip.bonuses.toLocaleString()}</span></div>
                  <div className="flex justify-between text-rose-700"><span>Deductions</span><span>-৳{activePayslip.deductions.toLocaleString()}</span></div>
                  <div className="flex justify-between text-rose-700"><span>Advance Adjustment</span><span>-৳{activePayslip.advance.toLocaleString()}</span></div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-extrabold text-slate-900">
                    <span>Net Salary Payable</span>
                    <span>৳{activePayslip.netSalary.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setActivePayslip(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700">Close</button>
                  <button type="button" onClick={() => window.print()} className="rounded-lg bg-[#062436] px-4 py-1.5 text-xs font-bold text-white">Print Payslip</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FINANCE P&L & TRANSACTIONS */}
      {tab === 'finance' && canManageFinance && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-xs font-bold uppercase text-emerald-700">Total Income</p>
              <p className="font-mono-tabular mt-1 text-2xl font-extrabold text-emerald-950">
                ৳{totalIncome.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <p className="text-xs font-bold uppercase text-rose-700">Expenses & Refunds</p>
              <p className="font-mono-tabular mt-1 text-2xl font-extrabold text-rose-950">
                ৳{totalExpense.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
              <p className="text-xs font-bold uppercase text-indigo-700">Net Cash Position</p>
              <p className="font-mono-tabular mt-1 text-2xl font-extrabold text-indigo-950">
                ৳{(totalIncome - totalExpense).toLocaleString()}
              </p>
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch('/api/portal/finance', {
                method: 'POST',
                body: JSON.stringify({ type: finType, category: finCat, title: finTitle, amount: finAmount }),
              });
              setFinTitle('');
              await onRefresh();
              onNotify('Finance ledger entry recorded.');
            }}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3"
          >
            <h3 className="text-base font-extrabold text-slate-900">Record Income / Expense Entry</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <select
                value={finType}
                onChange={(e) => setFinType(e.target.value as 'income' | 'expense' | 'refund')}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="income">Income (+)</option>
                <option value="expense">Expense (-)</option>
                <option value="refund">Refund (-)</option>
              </select>
              <input
                type="text"
                value={finCat}
                onChange={(e) => setFinCat(e.target.value)}
                placeholder="Category"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="text"
                required
                value={finTitle}
                onChange={(e) => setFinTitle(e.target.value)}
                placeholder="Entry Title / Memo"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="number"
                min={1}
                value={finAmount}
                onChange={(e) => setFinAmount(Number(e.target.value))}
                placeholder="Amount ৳"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white"
            >
              Add Ledger Entry
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h3 className="text-base font-extrabold text-slate-900">
              Official Payment Transactions & Invoices ({transactions.length})
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 font-bold uppercase text-slate-500">
                    <th className="py-2 pr-3">Invoice</th>
                    <th className="py-2 pr-3">Payer</th>
                    <th className="py-2 pr-3">Gateway & TrxID</th>
                    <th className="py-2 pr-3">Total</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.slice(0, 12).map((t) => (
                    <tr key={t.id}>
                      <td className="font-mono-tabular py-2 pr-3 font-bold text-indigo-700">
                        {t.invoiceNo}
                      </td>
                      <td className="py-2 pr-3 font-semibold">{t.payerName}</td>
                      <td className="py-2 pr-3">
                        {t.gateway} ({t.trxId})
                      </td>
                      <td className="font-mono-tabular py-2 pr-3 font-bold">৳{t.totalAmount}</td>
                      <td className="py-2 font-bold uppercase text-emerald-700">{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 4. SECURITY BACKUP, RECYCLE BIN & AUDIT PANEL (REUSABLE IN AI ECOSYSTEM & SETTINGS)
 * ========================================================================== */
export function SecurityBackupPanel({ onRefresh, onNotify }: RefreshProps) {
  const { apiFetch } = useAuth();
  const [backups, setBackups] = useState<BackupSnapshot[]>([]);
  const [recycleBin, setRecycleBin] = useState<RecycleBinItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [snapLabel, setSnapLabel] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [secError, setSecError] = useState<string | null>(null);

  const loadSecurity = useCallback(
    async (showFeedback = false) => {
      setRefreshing(true);
      setSecError(null);
      try {
        const res = await apiFetch<{
          backups: BackupSnapshot[];
          recycleBin: RecycleBinItem[];
          auditLogs: AuditLogEntry[];
          refreshedAt?: string;
        }>('/api/portal/security', { cache: 'no-store' });
        const nextBin = res.recycleBin ?? [];
        setBackups(res.backups ?? []);
        setRecycleBin(nextBin);
        setAuditLogs(res.auditLogs ?? []);
        setLastRefreshedAt(new Date().toLocaleTimeString());
        if (showFeedback) {
          onNotify(`Recycle Bin refreshed (${nextBin.length} soft-deleted items).`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to refresh Recycle Bin & backups.';
        setSecError(msg);
      } finally {
        setRefreshing(false);
      }
    },
    [apiFetch, onNotify]
  );

  useEffect(() => {
    void loadSecurity(false);
  }, [loadSecurity]);

  return (
    <div className="space-y-6">
      {secError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          {secError}
        </div>
      )}

      {/* Recovery Backups & Verified Reset */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <DatabaseBackup className="h-4 w-4 text-indigo-600" />
              <span>SHA-256 Verified Recovery Backups & Safe Reset</span>
            </h3>
            <p className="text-xs text-slate-500">
              Pre-reset and pre-restore recovery backups are SHA-256 verified automatically before any reset executes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Snapshot Label..."
              value={snapLabel}
              onChange={(e) => setSnapLabel(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={async () => {
                setSecError(null);
                try {
                  await apiFetch('/api/portal/backups', {
                    method: 'POST',
                    body: JSON.stringify({ label: snapLabel || undefined }),
                  });
                  setSnapLabel('');
                  await loadSecurity(false);
                  onNotify('Verified recovery snapshot created.');
                } catch (err) {
                  setSecError(err instanceof Error ? err.message : 'Snapshot creation failed.');
                }
              }}
              className="rounded-xl bg-[#062436] px-3.5 py-2 text-xs font-bold text-white"
            >
              Create Snapshot
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!confirmReset) {
                  setConfirmReset(true);
                  return;
                }
                setSecError(null);
                try {
                  const res = await apiFetch<{ preResetBackup: { id: string } }>('/api/portal/system/reset', {
                    method: 'POST',
                  });
                  setConfirmReset(false);
                  await Promise.all([loadSecurity(false), onRefresh()]);
                  onNotify(`System safely reset after verified backup ${res.preResetBackup.id}.`);
                } catch (err) {
                  setSecError(err instanceof Error ? err.message : 'Safe reset failed.');
                }
              }}
              className={`inline-flex items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-bold ${
                confirmReset
                  ? 'bg-rose-600 text-white'
                  : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>{confirmReset ? 'Confirm Safe Reset (Backup Verified)' : 'Safe System Reset'}</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {backups.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs"
            >
              <div>
                <p className="font-bold text-slate-900">
                  {b.label}{' '}
                  <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">
                    {b.verified ? 'SHA-256 VERIFIED' : 'UNVERIFIED'}
                  </span>
                </p>
                <p className="font-mono-tabular text-[11px] text-slate-500">
                  {b.checksumSha256.slice(0, 20)}... · {b.summary.courses} courses · {b.summary.users} users
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await apiFetch<{ verified: boolean }>(`/api/portal/backups/${b.id}/verify`, {
                      method: 'POST',
                    });
                    await loadSecurity(false);
                    onNotify(res.verified ? 'Checksum verified OK.' : 'Checksum mismatch!');
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-100"
                >
                  Verify
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (confirmRestoreId !== b.id) {
                      setConfirmRestoreId(b.id);
                      return;
                    }
                    await apiFetch(`/api/portal/backups/${b.id}/restore`, { method: 'POST' });
                    setConfirmRestoreId(null);
                    await Promise.all([loadSecurity(false), onRefresh()]);
                    onNotify(`Restored state from "${b.label}".`);
                  }}
                  className={`rounded-lg px-2.5 py-1 font-bold ${
                    confirmRestoreId === b.id
                      ? 'bg-amber-600 text-white'
                      : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  }`}
                >
                  {confirmRestoreId === b.id ? 'Confirm Restore' : 'Restore'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recycle Bin */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Recycle Bin — Soft-Deleted Items ({recycleBin.length})
            </h3>
            {lastRefreshedAt && (
              <p className="text-[11px] text-slate-400">Last synced at {lastRefreshedAt}</p>
            )}
          </div>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void loadSecurity(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
        {recycleBin.length === 0 ? (
          <p className="text-xs text-slate-500">
            Recycle Bin is empty. Deleted courses, batches, lessons, exams, testimonials, questions, coupons, e-books &amp; products land here safely.
          </p>
        ) : (
          <div className="space-y-2">
            {recycleBin.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs"
              >
                <div>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                    {item.entityType}
                  </span>{' '}
                  <strong className="ml-1 text-slate-900">{item.label}</strong>
                  <span className="ml-2 text-slate-500">by {item.deletedBy}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/portal/recycle-bin/${item.id}/restore`, { method: 'POST' });
                      await Promise.all([loadSecurity(false), onRefresh()]);
                      onNotify(`Restored "${item.label}".`);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-white hover:bg-emerald-700"
                  >
                    <RotateCcw className="h-3 w-3" /> Restore
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirmPurgeId !== item.id) {
                        setConfirmPurgeId(item.id);
                        return;
                      }
                      await apiFetch(`/api/portal/recycle-bin/${item.id}`, { method: 'DELETE' });
                      setConfirmPurgeId(null);
                      await loadSecurity(false);
                      onNotify('Item permanently purged.');
                    }}
                    className={`rounded-lg px-2.5 py-1 font-bold ${
                      confirmPurgeId === item.id
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    {confirmPurgeId === item.id ? 'Confirm Purge' : 'Purge'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit Log */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <Activity className="h-4 w-4 text-sky-600" />
          <span>Security & Activity Audit Log ({auditLogs.length})</span>
        </h3>
        <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto text-xs">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5"
            >
              <span>
                <strong className="text-indigo-700">{log.action}</strong> · {log.target} ({log.details})
              </span>
              <span className="text-slate-500">
                {log.actorName} ({log.actorRole})
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 5. AI AGENTS, SCORM 1.2 STUDIO, CAMPAIGNS & API PLUGINS PANEL
 * ========================================================================== */
interface AiEcosystemSecurityPanelProps extends RefreshProps {
  role: UserRole;
  scormPackages: ScormPackage[];
  campaigns: BroadcastCampaign[];
  plugins: ApiPlugin[];
  webhooks: WebhookConfig[];
  courses: Course[];
}

const DEFAULT_MANIFEST = `<manifest identifier="AEC-SCORM-NEW-01" version="1.2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations><organization identifier="org-aec"><title>Interactive Spoken & Grammar Drill</title><item identifier="item-1" identifierref="res-1"><title>Interactive Lesson</title></item></organization></organizations>
  <resources><resource identifier="res-1" type="webcontent" href="index.html" /></resources>
</manifest>`;

export function AiEcosystemSecurityPanel({
  role,
  scormPackages,
  campaigns,
  plugins,
  webhooks,
  courses,
  onRefresh,
  onNotify,
}: AiEcosystemSecurityPanelProps) {
  const { apiFetch } = useAuth();
  const [subTab, setSubTab] = useState<'agents' | 'scorm' | 'campaigns' | 'plugins' | 'security'>('agents');
  const [agentRole, setAgentRole] = useState<AiAgentRole>(
    isAdminRole(role) ? 'admin' : role === 'teacher' ? 'teacher' : 'student'
  );
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  // SCORM modal & creator
  const [activeScorm, setActiveScorm] = useState<ScormPackage | null>(null);
  const [scormCourseId, setScormCourseId] = useState(courses[0]?.id ?? 'crs-1');
  const [scormTitle, setScormTitle] = useState('');
  const [manifestXml, setManifestXml] = useState(DEFAULT_MANIFEST);
  const [scormContent, setScormContent] = useState('Interactive SCORM 1.2 practice unit with real-time score reporting.');
  const [scormErr, setScormErr] = useState<string | null>(null);

  // Broadcast form
  const [campTitle, setCampTitle] = useState('');
  const [campChannel, setCampChannel] = useState<'SMS' | 'Email' | 'WhatsApp' | 'Notice'>('WhatsApp');
  const [campAudience, setCampAudience] = useState('All Active Students & Guardians');
  const [campMessage, setCampMessage] = useState('');

  // Webhook & API Connector form states
  const [editingWhId, setEditingWhId] = useState<string | null>(null);
  const [whName, setWhName] = useState('');
  const [whUrl, setWhUrl] = useState('');
  const [whEvent, setWhEvent] = useState('enrollment.approved');
  const [confirmDelWhId, setConfirmDelWhId] = useState<string | null>(null);

  const [editingPlgId, setEditingPlgId] = useState<string | null>(null);
  const [plgName, setPlgName] = useState('');
  const [plgCategory, setPlgCategory] = useState<ApiPlugin['category']>('SMS & Messaging');
  const [plgVersion, setPlgVersion] = useState('1.0.0');
  const [plgEndpoint, setPlgEndpoint] = useState('');
  const [plgApiKey, setPlgApiKey] = useState('');
  const [plgEnv, setPlgEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [plgScopes, setPlgScopes] = useState('api:read, api:write');
  const [plgDesc, setPlgDesc] = useState('');
  const [plgActive, setPlgActive] = useState(false);
  const [plgErr, setPlgErr] = useState<string | null>(null);
  const [confirmDelPlgId, setConfirmDelPlgId] = useState<string | null>(null);

  const resetPluginForm = () => {
    setEditingPlgId(null);
    setPlgName('');
    setPlgCategory('SMS & Messaging');
    setPlgVersion('1.0.0');
    setPlgEndpoint('');
    setPlgApiKey('');
    setPlgEnv('sandbox');
    setPlgScopes('api:read, api:write');
    setPlgDesc('');
    setPlgActive(false);
    setPlgErr(null);
  };

  const startEditPlugin = (plg: ApiPlugin) => {
    setEditingPlgId(plg.id);
    setPlgName(plg.name);
    setPlgCategory(plg.category);
    setPlgVersion(plg.version);
    setPlgEndpoint(plg.endpointUrl ?? '');
    setPlgApiKey('');
    setPlgEnv(plg.environment ?? 'sandbox');
    setPlgScopes(plg.scopes.join(', '));
    setPlgDesc(plg.description);
    setPlgActive(plg.active);
    setPlgErr(null);
  };

  const askAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiError(null);
    setAsking(true);
    try {
      const res = await apiFetch<{ reply: string }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ agent: agentRole, message: prompt }),
      });
      setReply(res.reply);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI request failed.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
        <button
          type="button"
          onClick={() => setSubTab('agents')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold ${
            subTab === 'agents' ? 'bg-[#062436] text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Bot className="h-3.5 w-3.5" /> 5 Specialist AI Agents
        </button>
        <button
          type="button"
          onClick={() => setSubTab('scorm')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold ${
            subTab === 'scorm' ? 'bg-[#062436] text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileArchive className="h-3.5 w-3.5" /> SCORM 1.2 Runtime ({scormPackages.length})
        </button>
        {isAdminRole(role) && (
          <>
            <button
              type="button"
              onClick={() => setSubTab('campaigns')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold ${
                subTab === 'campaigns' ? 'bg-[#062436] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Megaphone className="h-3.5 w-3.5" /> Omnichannel Broadcasts
            </button>
            <button
              type="button"
              onClick={() => setSubTab('plugins')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold ${
                subTab === 'plugins' ? 'bg-[#062436] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Webhook className="h-3.5 w-3.5" /> API Plugins & Webhooks
            </button>
            <button
              type="button"
              onClick={() => setSubTab('security')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold ${
                subTab === 'security' ? 'bg-[#062436] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Recovery Backups & Recycle Bin
            </button>
          </>
        )}
      </div>

      {/* 5 SPECIALIST AI AGENTS */}
      {subTab === 'agents' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Role-Specialist AI Automation Console
            </h2>
            <p className="text-xs text-slate-500">
              Switch between Student Tutor, Teacher Copilot, Admin Strategist, Support Desk, and Learning Advisor.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'student' as const, label: 'Student Tutor' },
              { id: 'teacher' as const, label: 'Teacher Copilot' },
              { id: 'admin' as const, label: 'Admin Strategist' },
              { id: 'support' as const, label: 'Support Desk' },
              { id: 'learning' as const, label: 'Learning Advisor' },
            ].map((ag) => (
              <button
                key={ag.id}
                type="button"
                onClick={() => setAgentRole(ag.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                  agentRole === ag.id
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                {ag.label}
              </button>
            ))}
          </div>

          <form onSubmit={askAgent} className="space-y-3">
            <textarea
              rows={3}
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Ask the ${agentRole} AI specialist...`}
              className="w-full rounded-xl border border-slate-300 p-3 text-xs"
            />
            <button
              type="submit"
              disabled={asking}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#062436] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{asking ? 'Thinking...' : 'Run Specialist Agent'}</span>
            </button>
          </form>

          {aiError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              {aiError}
            </div>
          )}
          {reply && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
              {reply}
            </div>
          )}
        </div>
      )}

      {/* SCORM 1.2 PACKAGES */}
      {subTab === 'scorm' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {scormPackages.map((pkg) => (
              <div
                key={pkg.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
              >
                <div>
                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                    SCORM {pkg.version} · {pkg.identifier}
                  </span>
                  <h3 className="mt-2 text-base font-extrabold text-slate-900">{pkg.title}</h3>
                  <p className="mt-1 text-xs text-slate-600">{pkg.htmlContent}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveScorm(pkg)}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Launch SCORM 1.2 Lab (+{pkg.xpReward} XP)</span>
                </button>
              </div>
            ))}
          </div>

          {(isAdminRole(role) || role === 'teacher') && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setScormErr(null);
                try {
                  await apiFetch('/api/portal/scorm', {
                    method: 'POST',
                    body: JSON.stringify({
                      courseId: scormCourseId,
                      title: scormTitle,
                      manifestXml,
                      htmlContent: scormContent,
                    }),
                  });
                  setScormTitle('');
                  await onRefresh();
                  onNotify('Validated SCORM 1.2 package created.');
                } catch (err) {
                  setScormErr(err instanceof Error ? err.message : 'Manifest validation failed.');
                }
              }}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3"
            >
              <h3 className="text-base font-extrabold text-slate-900">
                Publish Validated SCORM 1.2 Package
              </h3>
              {scormErr && (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{scormErr}</p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  required
                  placeholder="SCORM Module Title"
                  value={scormTitle}
                  onChange={(e) => setScormTitle(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                />
                <select
                  value={scormCourseId}
                  onChange={(e) => setScormCourseId(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                value={scormContent}
                onChange={(e) => setScormContent(e.target.value)}
                placeholder="Activity Prompt / Content"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
              <textarea
                rows={4}
                value={manifestXml}
                onChange={(e) => setManifestXml(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 font-mono text-[11px]"
              />
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white"
              >
                Validate imsmanifest.xml & Publish SCORM 1.2
              </button>
            </form>
          )}
        </div>
      )}

      {/* OMNICHANNEL CAMPAIGNS */}
      {subTab === 'campaigns' && isAdminRole(role) && (
        <div className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch('/api/portal/campaigns', {
                method: 'POST',
                body: JSON.stringify({
                  title: campTitle,
                  channel: campChannel,
                  audience: campAudience,
                  message: campMessage,
                }),
              });
              setCampTitle('');
              setCampMessage('');
              await onRefresh();
              onNotify('Broadcast campaign dispatched.');
            }}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3"
          >
            <h3 className="text-base font-extrabold text-slate-900">
              Send Omnichannel SMS / WhatsApp / Email Notice
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                required
                placeholder="Campaign Title"
                value={campTitle}
                onChange={(e) => setCampTitle(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
              />
              <select
                value={campChannel}
                onChange={(e) =>
                  setCampChannel(e.target.value as 'SMS' | 'Email' | 'WhatsApp' | 'Notice')
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="WhatsApp">WhatsApp</option>
                <option value="SMS">SMS Gateway</option>
                <option value="Email">Email Digest</option>
                <option value="Notice">Student Portal Notice</option>
              </select>
              <input
                type="text"
                value={campAudience}
                onChange={(e) => setCampAudience(e.target.value)}
                placeholder="Audience Segment"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <textarea
              rows={2}
              required
              placeholder="Broadcast message body..."
              value={campMessage}
              onChange={(e) => setCampMessage(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-xs"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#062436] px-5 py-2 text-xs font-bold text-white"
            >
              Dispatch Campaign
            </button>
          </form>

          <div className="space-y-2">
            {campaigns.map((cmp) => (
              <div
                key={cmp.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs"
              >
                <div>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    {cmp.channel}
                  </span>{' '}
                  <strong className="ml-1 text-slate-900">{cmp.title}</strong>
                  <p className="mt-1 text-slate-500">
                    {cmp.audience} · {cmp.message}
                  </p>
                </div>
                <span className="font-mono-tabular font-bold text-indigo-700">
                  {cmp.sentCount} recipients
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API CONNECTORS & WEBHOOKS (FULL ADMIN API CRUD + ACTIVE/DEACTIVE) */}
      {subTab === 'plugins' && isAdminRole(role) && (
        <div className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPlgErr(null);
              try {
                const payload = {
                  name: plgName.trim(),
                  category: plgCategory,
                  version: plgVersion.trim() || '1.0.0',
                  endpointUrl: plgEndpoint.trim(),
                  apiKey: plgApiKey.trim() || undefined,
                  environment: plgEnv,
                  scopes: plgScopes,
                  description: plgDesc.trim(),
                  active: plgActive,
                };
                if (editingPlgId) {
                  await apiFetch(`/api/portal/plugins/${editingPlgId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                  });
                  onNotify(`API Connector "${payload.name}" updated.`);
                } else {
                  await apiFetch('/api/portal/plugins', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                  });
                  onNotify(`API Connector "${payload.name}" created.`);
                }
                resetPluginForm();
                await onRefresh();
              } catch (err) {
                setPlgErr(err instanceof Error ? err.message : 'Failed to save API connector.');
              }
            }}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingPlgId ? 'Edit & Update API Connector' : 'Add Official API Connector / Plugin'}
                </h3>
                <p className="text-xs text-slate-500">
                  Configure external SMS, WhatsApp, Live Video, Marketing &amp; LMS endpoints, mask API keys, and activate or deactivate individually.
                </p>
              </div>
              {editingPlgId && (
                <button
                  type="button"
                  onClick={resetPluginForm}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold text-slate-600"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {plgErr && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{plgErr}</p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input
                type="text"
                required
                placeholder="Connector Name (e.g. BulkSMS BD)"
                value={plgName}
                onChange={(e) => setPlgName(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold sm:col-span-2"
              />
              <select
                value={plgCategory}
                onChange={(e) => setPlgCategory(e.target.value as ApiPlugin['category'])}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
              >
                <option value="SMS & Messaging">SMS &amp; Messaging</option>
                <option value="Live Video">Live Video (Zoom/Meet)</option>
                <option value="AI">AI Engine</option>
                <option value="Marketing">Marketing &amp; Analytics</option>
                <option value="LMS Widget">LMS Widget</option>
                <option value="Payment">Payment Helper</option>
              </select>
              <select
                value={plgEnv}
                onChange={(e) => setPlgEnv(e.target.value as 'sandbox' | 'production')}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="sandbox">Environment: Sandbox</option>
                <option value="production">Environment: Production</option>
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="url"
                placeholder="https://api.example.com/v1/..."
                value={plgEndpoint}
                onChange={(e) => setPlgEndpoint(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="password"
                placeholder={editingPlgId ? 'New API Key / Token (optional)' : 'API Key / Secret Token'}
                value={plgApiKey}
                onChange={(e) => setPlgApiKey(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="text"
                placeholder="Scopes (comma-separated)"
                value={plgScopes}
                onChange={(e) => setPlgScopes(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input
                type="text"
                placeholder="Description"
                value={plgDesc}
                onChange={(e) => setPlgDesc(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs sm:col-span-3"
              />
              <input
                type="text"
                placeholder="Version (1.0.0)"
                value={plgVersion}
                onChange={(e) => setPlgVersion(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={plgActive}
                  onChange={(e) => setPlgActive(e.target.checked)}
                />
                <span>Active / Connected immediately after save</span>
              </label>
              <button
                type="submit"
                className="rounded-xl bg-[#062436] px-5 py-2 text-xs font-bold text-white hover:bg-[#0b3854]"
              >
                {editingPlgId ? 'Update API Connector' : 'Add API Connector'}
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {plugins.map((plg) => (
              <div
                key={plg.id}
                className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 ${
                  plg.active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50/80'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{plg.name}</p>
                      <p className="text-[11px] font-semibold text-indigo-700">
                        {plg.category} · v{plg.version} · {(plg.environment ?? 'sandbox').toUpperCase()}
                      </p>
                    </div>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                        plg.active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {plg.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600">{plg.description}</p>
                  <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-500">
                    {plg.endpointUrl && (
                      <p className="flex items-center gap-1 truncate">
                        <Globe className="h-3 w-3 shrink-0" />
                        <span className="truncate">{plg.endpointUrl}</span>
                      </p>
                    )}
                    <p className="flex items-center gap-1">
                      <KeyRound className="h-3 w-3 shrink-0" />
                      <span>Key: {plg.apiKeyMasked || 'Not Configured'}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                  <button
                    type="button"
                    onClick={async () => {
                      setPlgErr(null);
                      try {
                        await apiFetch(`/api/portal/plugins/${plg.id}`, { method: 'PATCH' });
                        await onRefresh();
                        onNotify(`Connector "${plg.name}" ${plg.active ? 'deactivated' : 'activated'}.`);
                      } catch (err) {
                        setPlgErr(err instanceof Error ? err.message : 'Dependency check prevented plugin toggle.');
                      }
                    }}
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${
                      plg.active
                        ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    <Power className="h-3.5 w-3.5" />
                    <span>{plg.active ? 'Deactivate' : 'Activate'}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEditPlugin(plg)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirmDelPlgId !== plg.id) {
                          setConfirmDelPlgId(plg.id);
                          return;
                        }
                        setConfirmDelPlgId(null);
                        await apiFetch(`/api/portal/plugins/${plg.id}`, { method: 'DELETE' });
                        if (editingPlgId === plg.id) resetPluginForm();
                        await onRefresh();
                        onNotify(`Connector "${plg.name}" moved to Recycle Bin.`);
                      }}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                        confirmDelPlgId === plg.id
                          ? 'bg-rose-600 text-white'
                          : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{confirmDelPlgId === plg.id ? 'Confirm' : 'Delete'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (editingWhId) {
                await apiFetch(`/api/portal/webhooks/${editingWhId}`, {
                  method: 'PUT',
                  body: JSON.stringify({ name: whName, url: whUrl, event: whEvent }),
                });
                setEditingWhId(null);
                onNotify('Webhook updated.');
              } else {
                await apiFetch('/api/portal/webhooks', {
                  method: 'POST',
                  body: JSON.stringify({ name: whName, url: whUrl, event: whEvent }),
                });
                onNotify('Webhook endpoint registered.');
              }
              setWhName('');
              setWhUrl('');
              await onRefresh();
            }}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                {editingWhId ? 'Edit Outbound Webhook' : 'Outbound Webhooks (Admin API)'}
              </h3>
              {editingWhId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingWhId(null);
                    setWhName('');
                    setWhUrl('');
                    setWhEvent('enrollment.approved');
                  }}
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                required
                placeholder="Webhook Name"
                value={whName}
                onChange={(e) => setWhName(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="url"
                required
                placeholder="https://hooks.example.com/..."
                value={whUrl}
                onChange={(e) => setWhUrl(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={whEvent}
                onChange={(e) => setWhEvent(e.target.value)}
                placeholder="Event (e.g. enrollment.approved)"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white"
            >
              {editingWhId ? 'Update Webhook' : 'Add Webhook'}
            </button>
            <div className="pt-2 space-y-2">
              {webhooks.map((wh) => (
                <div
                  key={wh.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs"
                >
                  <div>
                    <span
                      className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${
                        wh.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {wh.active ? 'Active' : 'Paused'}
                    </span>
                    <strong>{wh.name}</strong> ({wh.event}) ·{' '}
                    <span className="text-slate-500">{wh.url}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono-tabular mr-1 text-slate-500">{wh.secretMasked}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/portal/webhooks/${wh.id}/status`, { method: 'PATCH' });
                        await onRefresh();
                        onNotify(`Webhook "${wh.name}" ${wh.active ? 'paused' : 'activated'}.`);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100"
                    >
                      {wh.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingWhId(wh.id);
                        setWhName(wh.name);
                        setWhUrl(wh.url);
                        setWhEvent(wh.event);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirmDelWhId !== wh.id) {
                          setConfirmDelWhId(wh.id);
                          return;
                        }
                        setConfirmDelWhId(null);
                        await apiFetch(`/api/portal/webhooks/${wh.id}`, { method: 'DELETE' });
                        await onRefresh();
                        onNotify(`Webhook "${wh.name}" deleted.`);
                      }}
                      className={`rounded-lg px-2 py-1 font-bold ${
                        confirmDelWhId === wh.id
                          ? 'bg-rose-600 text-white'
                          : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                    >
                      {confirmDelWhId === wh.id ? 'Confirm' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </form>
        </div>
      )}

      {/* SECURITY & BACKUPS */}
      {subTab === 'security' && isAdminRole(role) && (
        <SecurityBackupPanel onRefresh={onRefresh} onNotify={onNotify} />
      )}

      <ScormPlayerModal
        pkg={activeScorm}
        onClose={() => setActiveScorm(null)}
        onCompleted={() => {
          void onRefresh();
          onNotify('SCORM 1.2 attempt & XP rewards updated!');
        }}
      />
    </div>
  );
}
