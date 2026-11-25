import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  GraduationCap,
  Layers,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminCourseModal } from '../components/AdminCourseModal';
import { useAuth } from '../context/AuthContext';
import {
  calculateDiscountedPrice,
  filterCourses,
  isAdminRole,
  mergeCourseCategories,
  splitCoursesIntoSections,
  type CourseSortOption,
} from '../lib/domain';
import type { Course, CourseLesson } from '../types';

interface CoursesPageProps {
  navigate: (path: string) => void;
  initialCategory?: string;
}

const BASE_FILTER_TABS = [
  'All Courses',
  'Combos',
  'HSC 27',
  'SSC 27',
];

export function CoursesPage({ navigate, initialCategory = 'All Courses' }: CoursesPageProps) {
  const { user, bootstrap, loadingBootstrap, apiFetch, refreshBootstrap } = useAuth();
  const isAdmin = Boolean(user && isAdminRole(user.role));

  const [selectedCat, setSelectedCat] = useState(initialCategory);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<CourseSortOption>('featured');
  const [showDrafts, setShowDrafts] = useState(true);

  const [adminCourses, setAdminCourses] = useState<Course[] | null>(null);
  const [adminLessons, setAdminLessons] = useState<CourseLesson[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCat(initialCategory || 'All Courses');
  }, [initialCategory]);

  const loadAdminCourses = useCallback(async () => {
    if (!isAdmin) {
      setAdminCourses(null);
      return;
    }
    try {
      const res = await apiFetch<{ courses: Course[]; lessons: CourseLesson[] }>(
        '/api/portal/courses'
      );
      setAdminCourses(res.courses);
      setAdminLessons(res.lessons);
    } catch {
      setAdminCourses(null);
    }
  }, [isAdmin, apiFetch]);

  useEffect(() => {
    void loadAdminCourses();
  }, [loadAdminCourses]);

  const showNotice = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  const filterTabs = useMemo(() => {
    const mergedCats = mergeCourseCategories(bootstrap?.categories).filter(
      (c) => c !== 'HSC English' && c !== 'SSC English' && c !== 'Combo Packs'
    );
    return Array.from(new Set([...BASE_FILTER_TABS, ...mergedCats]));
  }, [bootstrap?.categories]);

  const sourceCourses = isAdmin && adminCourses ? adminCourses : (bootstrap?.courses ?? []);
  const filtered = filterCourses(sourceCourses, selectedCat, search, {
    includeDrafts: isAdmin && showDrafts,
    sortBy,
  });

  const { combos, regular } = splitCoursesIntoSections(filtered);

  const countForTab = (tab: string) =>
    filterCourses(sourceCourses, tab, '', { includeDrafts: isAdmin && showDrafts }).length;

  const handleOpenCreate = () => {
    setEditingCourse(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (course: Course) => {
    setEditingCourse(course);
    setModalOpen(true);
  };

  const handleToggleStatus = async (course: Course) => {
    const nextStatus = course.status === 'active' ? 'draft' : 'active';
    await apiFetch(`/api/portal/courses/${course.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    await Promise.all([loadAdminCourses(), refreshBootstrap()]);
    showNotice(`"${course.title}" is now ${nextStatus}.`);
  };

  const handleDuplicate = async (course: Course) => {
    await apiFetch(`/api/portal/courses/${course.id}/duplicate`, {
      method: 'POST',
    });
    await Promise.all([loadAdminCourses(), refreshBootstrap()]);
    showNotice(`Created draft copy of "${course.title}".`);
  };

  const handleDelete = async (course: Course) => {
    if (confirmDeleteId !== course.id) {
      setConfirmDeleteId(course.id);
      return;
    }
    await apiFetch(`/api/portal/courses/${course.id}`, { method: 'DELETE' });
    setConfirmDeleteId(null);
    await Promise.all([loadAdminCourses(), refreshBootstrap()]);
    showNotice(`Deleted "${course.title}".`);
  };

  const renderAdminControls = (course: Course) => {
    if (!isAdmin) return null;
    const isConfirming = confirmDeleteId === course.id;
    return (
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 bg-slate-50 px-4 py-2.5">
        <span
          className={`text-[11px] font-bold uppercase ${
            course.status === 'active' ? 'text-emerald-700' : 'text-amber-700'
          }`}
        >
          {course.status === 'active' ? 'Live' : 'Draft'}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleOpenEdit(course)}
            aria-label={`Edit ${course.title}`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
          >
            <Pencil className="h-3 w-3" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => handleToggleStatus(course)}
            aria-label={
              course.status === 'active' ? `Unpublish ${course.title}` : `Publish ${course.title}`
            }
            title={course.status === 'active' ? 'Move to Draft' : 'Publish Active'}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-indigo-700"
          >
            {course.status === 'active' ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleDuplicate(course)}
            aria-label={`Duplicate ${course.title}`}
            title="Duplicate Course"
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-indigo-700"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(course)}
            aria-label={
              isConfirming ? `Confirm delete ${course.title}` : `Delete ${course.title}`
            }
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
              isConfirming
                ? 'bg-rose-600 text-white'
                : 'border border-rose-200 bg-white text-rose-600 hover:bg-rose-50'
            }`}
          >
            <Trash2 className="h-3 w-3" />
            {isConfirming && <span>Confirm</span>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/90 via-slate-50 to-white pb-16 pt-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header matching reference */}
        <div className="text-center">
          <div className="inline-flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
              <GraduationCap className="h-6 w-6" />
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-indigo-950 sm:text-4xl">
              All Courses
            </h1>
          </div>

          {/* Search & Sort row */}
          <div className="mx-auto mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search HSC, SSC, IELTS, Spoken, Combo..."
                aria-label="Search courses"
                className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as CourseSortOption)}
              aria-label="Sort courses"
              className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-xs focus:border-indigo-500 focus:outline-none"
            >
              <option value="featured">Sort: Featured</option>
              <option value="popular">Most Enrolled</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>

          {/* Category / Batch Filter Tabs */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            {filterTabs.map((tab) => {
              const active = selectedCat === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSelectedCat(tab)}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all sm:text-sm ${
                    active
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'border border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                  }`}
                >
                  <span>{tab}</span>
                  <span
                    className={`font-mono-tabular rounded-full px-2 py-0.5 text-[11px] ${
                      active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {countForTab(tab)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Admin Quick Management Strip */}
        {isAdmin && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#062436] text-amber-400">
                <Settings2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-extrabold text-slate-900">
                  Admin Course Control Mode
                </p>
                <p className="text-xs text-slate-600">
                  Add, modify, duplicate, toggle draft/active, or delete courses directly from here or in Unified Portal.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={showDrafts}
                  onChange={(e) => setShowDrafts(e.target.checked)}
                  className="h-4 w-4 rounded accent-indigo-600"
                />
                <span>Show Drafts</span>
              </label>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                <span>Add Course / Combo</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/portal')}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
              >
                Full Portal Console
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{toast}</span>
          </div>
        )}

        {loadingBootstrap && sourceCourses.length === 0 ? (
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="aspect-[16/10] w-full rounded-xl bg-slate-200" />
                <div className="mt-4 h-4 w-2/3 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-full rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-base font-semibold text-slate-700">
              No courses matched your current filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCat('All Courses');
                setSearch('');
              }}
              className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="mt-10 space-y-12">
            {/* COMBOS SECTION matching Redwan's Method */}
            {combos.length > 0 && (
              <section aria-labelledby="combos-heading">
                <div className="mb-5 flex items-center justify-between">
                  <h2
                    id="combos-heading"
                    className="flex items-center gap-2 text-xl font-extrabold text-slate-900"
                  >
                    <Layers className="h-5 w-5 text-indigo-600" />
                    <span>Combos</span>
                  </h2>
                  <span className="font-mono-tabular text-xs font-semibold text-slate-500">
                    {combos.length} bundle{combos.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {combos.map((course) => {
                    const pricing = calculateDiscountedPrice(course.price, course.originalPrice);
                    const subCourses = course.includedCourses ?? [];
                    return (
                      <article
                        key={course.id}
                        className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div>
                          <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-900">
                            <img
                              src={course.thumbnail}
                              alt={course.title}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent" />
                            <span className="absolute left-3 top-3 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white shadow">
                              Combo
                            </span>
                            <span className="absolute right-3 top-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-semibold text-white">
                              {course.levelTag}
                            </span>
                          </div>

                          <div className="p-5">
                            <div className="flex items-center justify-between text-xs font-semibold text-indigo-700">
                              <span>{subCourses.length || 3} courses</span>
                              <span className="inline-flex items-center gap-1 font-mono-tabular text-slate-500">
                                <Users className="h-3.5 w-3.5" />
                                {course.enrolledCount.toLocaleString()}
                              </span>
                            </div>

                            <h3 className="mt-2 line-clamp-2 text-lg font-extrabold text-slate-900">
                              {course.title}
                            </h3>

                            {subCourses.length > 0 && (
                              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                                <p className="mb-2 text-center text-xs font-semibold text-slate-500">
                                  Courses:
                                </p>
                                <div
                                  className={`grid gap-1.5 ${
                                    subCourses.length >= 4 ? 'grid-cols-2' : 'grid-cols-1'
                                  }`}
                                >
                                  {subCourses.map((sub) => (
                                    <div
                                      key={sub}
                                      className="rounded-lg border border-sky-100 bg-white px-2.5 py-1.5 text-center text-xs font-semibold text-sky-700"
                                    >
                                      {sub}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono-tabular text-xl font-extrabold text-indigo-700">
                                {course.price === 0 ? 'Free' : `৳${course.price}`}
                              </span>
                              {course.originalPrice > course.price && (
                                <span className="font-mono-tabular text-sm text-slate-400 line-through">
                                  ৳{course.originalPrice}
                                </span>
                              )}
                              {pricing.baseDiscountPercent > 0 && course.price > 0 && (
                                <span className="font-mono-tabular text-xs font-bold text-emerald-700">
                                  {pricing.baseDiscountPercent}% OFF
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => navigate(`/course/${course.slug}`)}
                              className="rounded-xl bg-[#062436] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-600"
                            >
                              View Details
                            </button>
                          </div>
                          {renderAdminControls(course)}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* INDIVIDUAL COURSES SECTION */}
            {regular.length > 0 && (
              <section aria-labelledby="regular-courses-heading">
                <div className="mb-5 flex items-center justify-between">
                  <h2
                    id="regular-courses-heading"
                    className="text-xl font-extrabold text-slate-900"
                  >
                    {combos.length > 0 ? 'All Individual Courses' : 'Courses'}
                  </h2>
                  <span className="font-mono-tabular text-xs font-semibold text-slate-500">
                    {regular.length} course{regular.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {regular.map((course) => {
                    const pricing = calculateDiscountedPrice(course.price, course.originalPrice);
                    return (
                      <article
                        key={course.id}
                        className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div>
                          <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-900">
                            <img
                              src={course.thumbnail}
                              alt={course.title}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" />
                            <span className="absolute right-3 top-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-semibold text-white">
                              {course.levelTag}
                            </span>
                            {course.price === 0 ? (
                              <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">
                                Free
                              </span>
                            ) : (
                              pricing.baseDiscountPercent > 0 && (
                                <span className="font-mono-tabular absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">
                                  {pricing.baseDiscountPercent}% OFF
                                </span>
                              )
                            )}
                          </div>

                          <div className="p-5">
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                              <span>{course.category}</span>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-mono-tabular">
                                <Users className="h-3.5 w-3.5" />
                                {course.enrolledCount.toLocaleString()} enrolled
                              </span>
                            </div>

                            <h3 className="mt-2 line-clamp-2 text-lg font-extrabold text-slate-900">
                              {course.title}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                              {course.subtitle}
                            </p>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono-tabular text-xl font-extrabold text-indigo-700">
                                {course.price === 0 ? 'Free' : `৳${course.price}`}
                              </span>
                              {course.originalPrice > course.price && (
                                <span className="font-mono-tabular text-sm text-slate-400 line-through">
                                  ৳{course.originalPrice}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => navigate(`/course/${course.slug}`)}
                              className="rounded-xl bg-[#062436] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-600"
                            >
                              View Details
                            </button>
                          </div>
                          {renderAdminControls(course)}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <AdminCourseModal
          open={modalOpen}
          course={editingCourse}
          allCourses={sourceCourses}
          branches={bootstrap?.branches ?? []}
          instructors={bootstrap?.instructors ?? []}
          lessons={adminLessons}
          categories={bootstrap?.categories ?? []}
          onClose={() => setModalOpen(false)}
          onSaved={async (msg) => {
            await Promise.all([loadAdminCourses(), refreshBootstrap()]);
            showNotice(msg);
          }}
        />
      )}
    </div>
  );
}
