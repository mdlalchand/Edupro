import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  Layers,
  Play,
  Radio,
  Tag,
  Users,
  Video,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { FourStepPaymentModal } from '../components/FourStepPaymentModal';
import { useAuth } from '../context/AuthContext';
import {
  calculateDiscountedPrice,
  computeBatchSeatUsage,
  filterActiveBranches,
  toSafeVideoEmbedUrl,
} from '../lib/domain';
import type {
  Branch,
  Coupon,
  Course,
  CourseBatch,
  CourseLesson,
  Instructor,
} from '../types';

interface CourseDetailPageProps {
  slug: string;
  navigate: (path: string) => void;
}

interface CourseDetailPayload {
  course: Course;
  instructors: Instructor[];
  batches?: CourseBatch[];
  lessons: CourseLesson[];
  branches: Branch[];
}

export function CourseDetailPage({ slug, navigate }: CourseDetailPageProps) {
  const { user, apiFetch, refreshBootstrap } = useAuth();
  const [data, setData] = useState<CourseDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'demo'>('overview');
  const [expandedDesc, setExpandedDesc] = useState(false);

  // Coupon & Enrollment state
  const [showCouponBox, setShowCouponBox] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [enrollStatus, setEnrollStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(
    null
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/public/courses/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (active && payload) {
          setData(payload);
          const activeBr = filterActiveBranches(payload.branches);
          setSelectedBranchId(activeBr[0]?.id || '');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center text-slate-500">
        Loading course details...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Course Not Found</h1>
        <button
          type="button"
          onClick={() => navigate('/courses')}
          className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Back to Courses
        </button>
      </div>
    );
  }

  const { course, instructors, batches = [], lessons, branches } = data;
  const activeBranches = filterActiveBranches(branches);
  const pricing = calculateDiscountedPrice(course.price, course.originalPrice, appliedCoupon);
  const demoEmbedUrl = toSafeVideoEmbedUrl(course.demoYoutubeUrl);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError(null);
    try {
      const res = await fetch('/api/public/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponInput, courseId: course.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCouponError(json.error || 'Invalid coupon code');
        setAppliedCoupon(null);
        return;
      }
      setAppliedCoupon(json.coupon);
    } catch {
      setCouponError('Failed to validate coupon');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/90 via-slate-50 to-white pb-16 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate('/courses')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Courses</span>
        </button>

        <div className="mt-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {course.title}
          </h1>
          <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
            <Users className="h-4 w-4 text-slate-500" />
            <span className="font-mono-tabular font-semibold">
              {course.enrolledCount.toLocaleString()}
            </span>
            <span>students enrolled</span>
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Content Card (Overview / Demo Class) */}
          <div className="lg:col-span-8">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              {/* Tabs */}
              <div className="grid grid-cols-2 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className={`flex items-center justify-center gap-2 py-4 text-sm font-bold transition-colors ${
                    activeTab === 'overview'
                      ? 'border-b-2 border-sky-600 text-sky-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Overview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('demo')}
                  className={`flex items-center justify-center gap-2 py-4 text-sm font-bold transition-colors ${
                    activeTab === 'demo'
                      ? 'border-b-2 border-sky-600 text-sky-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Play className="h-4 w-4" />
                  <span>Demo Class</span>
                </button>
              </div>

              {activeTab === 'overview' ? (
                <div className="space-y-8 p-6 sm:p-8">
                  {/* Course Instructors */}
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      Course Instructors
                    </h3>
                    <div className="mt-4 flex flex-wrap gap-5">
                      {instructors.map((inst) => (
                        <div key={inst.id} className="flex w-28 flex-col items-center text-center">
                          <img
                            src={inst.avatar}
                            alt={inst.name}
                            className="h-16 w-16 rounded-full border-2 border-sky-100 object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <h4 className="mt-2 text-xs font-bold text-slate-900">{inst.name}</h4>
                          <p className="text-[11px] text-slate-500">{inst.subject}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Course Description */}
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      Course Description
                    </h3>
                    <p
                      className={`mt-3 text-sm leading-relaxed text-slate-700 ${
                        expandedDesc ? '' : 'line-clamp-3'
                      }`}
                    >
                      {course.description}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExpandedDesc((v) => !v)}
                      className="mt-2 text-xs font-bold text-sky-600 hover:underline"
                    >
                      {expandedDesc ? 'Show less' : 'See more'}
                    </button>

                    <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {course.highlights.map((h) => (
                        <div
                          key={h}
                          className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-medium text-slate-700"
                        >
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <span>{h}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Active Batches & Routine */}
                  {batches.length > 0 && (
                    <div>
                      <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                        <Layers className="h-4 w-4 text-indigo-600" />
                        <span>Active Batches & Schedules ({batches.length})</span>
                      </h3>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {batches.map((bat) => {
                          const seatInfo = computeBatchSeatUsage(bat);
                          return (
                            <div
                              key={bat.id}
                              className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono-tabular rounded-lg bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                                  {bat.code}
                                </span>
                                <span
                                  className={`rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase ${
                                    bat.status === 'open'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : bat.status === 'running'
                                        ? 'bg-sky-50 text-sky-700'
                                        : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  {bat.status === 'open' ? 'Admission Open' : bat.status}
                                </span>
                              </div>
                              <p className="mt-2 text-sm font-extrabold text-slate-900">
                                {bat.name}
                              </p>
                              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                                <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                                <span>{bat.schedule}</span>
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Mode: <strong>{bat.mode}</strong> · {seatInfo.remainingSeats} seats
                                available
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Syllabus Preview */}
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      Course Curriculum ({lessons.length} Lectures & Videos)
                    </h3>
                    <div className="mt-3 space-y-2.5">
                      {lessons.map((les) => {
                        const lType = les.lessonType ?? 'recorded';
                        return (
                          <div
                            key={les.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                                    lType === 'live'
                                      ? 'bg-rose-50 text-rose-700'
                                      : lType === 'lecture_sheet'
                                        ? 'bg-amber-50 text-amber-800'
                                        : 'bg-sky-50 text-sky-700'
                                  }`}
                                >
                                  {lType === 'live' ? (
                                    <Radio className="h-3 w-3" />
                                  ) : lType === 'lecture_sheet' ? (
                                    <FileText className="h-3 w-3" />
                                  ) : (
                                    <Video className="h-3 w-3" />
                                  )}
                                  <span>
                                    {lType === 'live'
                                      ? 'Live Class'
                                      : lType === 'lecture_sheet'
                                        ? 'Lecture Sheet'
                                        : 'Recorded Video'}
                                  </span>
                                </span>
                                {les.batchName && (
                                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                    {les.batchName}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-sm font-bold text-slate-900">{les.title}</p>
                              <p className="text-xs text-slate-500">
                                {les.moduleName} ·{' '}
                                <span className="font-mono-tabular">{les.duration}</span>
                              </p>
                            </div>
                            {les.isFreePreview ? (
                              <button
                                type="button"
                                onClick={() => setActiveTab('demo')}
                                className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"
                              >
                                Free Preview
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-slate-400">
                                Enrolled Only
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 p-6 sm:p-8">
                  <h3 className="text-lg font-extrabold text-slate-900">
                    {course.demoVideoTitle}
                  </h3>
                  {demoEmbedUrl ? (
                    <div className="aspect-video overflow-hidden rounded-xl border border-slate-200 bg-black">
                      <iframe
                        src={demoEmbedUrl}
                        title={course.demoVideoTitle}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-video flex-col items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-950 p-6 text-center text-white">
                      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-lg">
                        <Play className="h-7 w-7 fill-slate-950" />
                      </span>
                      <p className="mt-4 text-base font-bold">{course.demoVideoTitle}</p>
                      <p className="mt-1 max-w-md text-xs text-slate-300">
                        Preview lesson unlocked for prospective learners. Enroll to unlock all{' '}
                        {lessons.length} live & recorded modules, PDF sheets, and MCQ exams.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Sticky Checkout Card */}
          <div className="lg:col-span-4">
            <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="overflow-hidden rounded-xl">
                <img
                  src={course.thumbnail}
                  alt={course.title}
                  className="aspect-[16/9] w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="mt-5 flex flex-col items-center">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono-tabular text-3xl font-extrabold text-indigo-600">
                    ৳{pricing.finalPrice}
                  </span>
                  {pricing.originalPrice > pricing.finalPrice && (
                    <span className="font-mono-tabular text-base text-slate-400 line-through">
                      ৳{pricing.originalPrice}
                    </span>
                  )}
                </div>

                {pricing.baseDiscountPercent > 0 && (
                  <span className="mt-2 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    {pricing.baseDiscountPercent}% OFF
                    {pricing.appliedCouponCode
                      ? ` + ${pricing.appliedCouponCode} (-৳${pricing.couponDiscountAmount})`
                      : ''}
                  </span>
                )}
              </div>

              {/* Coupon Toggle */}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setShowCouponBox((v) => !v)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-50"
                >
                  <Tag className="h-3.5 w-3.5" />
                  <span>Have Coupon Code? (Try AEC20)</span>
                </button>

                {showCouponBox && (
                  <form onSubmit={handleApplyCoupon} className="mt-2.5 flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="Enter code (e.g. AEC20)"
                      className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs uppercase"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-[#062436] px-4 py-2 text-xs font-bold text-white"
                    >
                      Apply
                    </button>
                  </form>
                )}
                {couponError && (
                  <p className="mt-1.5 text-center text-xs font-medium text-rose-600">
                    {couponError}
                  </p>
                )}
              </div>

              {enrollStatus && (
                <div
                  className={`mt-4 rounded-xl p-3 text-xs font-semibold ${
                    enrollStatus.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {enrollStatus.msg}
                </div>
              )}

              {/* Primary Enroll CTA */}
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    navigate('/login');
                  } else {
                    setEnrollOpen(true);
                  }
                }}
                className="mt-3 w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-indigo-700"
              >
                {user ? 'Enroll Now (4-Step Checkout)' : 'Login to Enroll'}
              </button>

              <FourStepPaymentModal
                open={enrollOpen}
                onClose={() => setEnrollOpen(false)}
                referenceType="course"
                itemTitle={course.title}
                baseAmount={course.price}
                initialCouponCode={appliedCoupon?.code || ''}
                initialDiscount={pricing.couponDiscountAmount}
                courseId={course.id}
                branchId={selectedBranchId}
                branches={activeBranches}
                onSuccess={async ({ transaction }) => {
                  await refreshBootstrap();
                  setEnrollStatus({
                    type: 'ok',
                    msg:
                      transaction.status === 'completed'
                        ? `Enrollment approved! Invoice ${transaction.invoiceNo} issued. Open /learn to start classes.`
                        : `Request ${transaction.invoiceNo} submitted for Branch/Manual verification.`,
                  });
                }}
              />

              {/* Meta Footer matching reference */}
              <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-400" />
                    Students
                  </span>
                  <span className="font-mono-tabular font-bold text-slate-900">
                    {course.enrolledCount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-slate-400" />
                    Exam System
                  </span>
                  <span className="font-bold text-emerald-600">
                    {course.examSystemIncluded ? 'Included' : 'Optional'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
