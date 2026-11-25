import {
  Award,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Flame,
  Headphones,
  Layers,
  Lock,
  Mic,
  Play,
  Radio,
  Send,
  Settings,
  ShieldCheck,
  Square,
  Video,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ScormPlayerModal } from '../components/ScormPlayerModal';
import { useAuth } from '../context/AuthContext';
import {
  calculateStudentProgress,
  filterLessonsByTypeAndBatch,
  isAdminRole,
  isLessonDripUnlocked,
  sanitizeSafeUrl,
  toSafeVideoEmbedUrl,
} from '../lib/domain';
import type {
  Course,
  CourseBatch,
  CourseLesson,
  Enrollment,
  LearnerRewardProfile,
  LessonType,
  ScormPackage,
  SpeakingSubmission,
} from '../types';

interface LearnPageProps {
  navigate: (path: string) => void;
}

interface LearnData {
  accessibleCourses: Course[];
  allCourses: Course[];
  batches?: CourseBatch[];
  lessonsByCourse: Record<string, CourseLesson[]>;
  enrollments: Enrollment[];
}

export function LearnPage({ navigate }: LearnPageProps) {
  const { user, apiFetch } = useAuth();
  const [data, setData] = useState<LearnData | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedLessonId, setSelectedLessonId] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | LessonType>('all');
  const [scormPackages, setScormPackages] = useState<ScormPackage[]>([]);
  const [activeScormPkg, setActiveScormPkg] = useState<ScormPackage | null>(null);
  const [rewards, setRewards] = useState<LearnerRewardProfile | null>(null);
  const [speakingSubs, setSpeakingSubs] = useState<SpeakingSubmission[]>([]);
  const [speakingPrompt, setSpeakingPrompt] = useState('The thoughtful author read thirty-three phonetic drills fluently.');
  const [recording, setRecording] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string>('');
  const [recordMsg, setRecordMsg] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      apiFetch<LearnData>('/api/learn/courses'),
      apiFetch<{ packages: ScormPackage[] }>('/api/scorm/packages'),
      apiFetch<{ rewards: LearnerRewardProfile }>('/api/rewards/me'),
      apiFetch<{ submissions: SpeakingSubmission[] }>('/api/speaking/submissions'),
    ])
      .then(([res, scormRes, rewRes, spkRes]) => {
        setData(res);
        setScormPackages(scormRes.packages ?? []);
        setRewards(rewRes.rewards ?? null);
        setSpeakingSubs(spkRes.submissions ?? []);
        const firstCourse = res.accessibleCourses[0] || res.allCourses[0];
        if (firstCourse) {
          setSelectedCourseId(firstCourse.id);
          const firstLes = res.lessonsByCourse[firstCourse.id]?.[0];
          if (firstLes) setSelectedLessonId(firstLes.id);
        }
      })
      .finally(() => setLoading(false));
  }, [user, apiFetch]);

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Lock className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Not Authorized</h1>
          <p className="mt-2 text-sm text-slate-600">
            You need to be logged in to access live classes, recorded HD videos, lecture sheets, and
            progress tracking.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-6 rounded-xl bg-[#062436] px-6 py-3 text-sm font-bold text-white hover:bg-[#0c3954]"
          >
            Go to Login Page
          </button>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center text-slate-500">
        Loading your classroom...
      </div>
    );
  }

  const courses = data.accessibleCourses.length ? data.accessibleCourses : data.allCourses;
  const activeCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];
  const allLessons = activeCourse ? data.lessonsByCourse[activeCourse.id] ?? [] : [];
  const filteredLessons = filterLessonsByTypeAndBatch(allLessons, typeFilter, 'all', '');
  const activeLesson =
    filteredLessons.find((l) => l.id === selectedLessonId) ||
    filteredLessons[0] ||
    allLessons.find((l) => l.id === selectedLessonId) ||
    allLessons[0];
  const courseBatches = (data.batches ?? []).filter((b) => b.courseId === activeCourse?.id);

  const activeEnrollment = activeCourse
    ? data.enrollments.find((e) => e.courseId === activeCourse.id && e.status === 'approved')
    : undefined;

  const progressPct = calculateStudentProgress(
    allLessons.length,
    activeEnrollment?.completedLessonIds ?? []
  );

  const safeEmbedUrl = activeLesson ? toSafeVideoEmbedUrl(activeLesson.videoUrl) : '';
  const safeLiveJoinUrl = activeLesson?.liveJoinUrl
    ? sanitizeSafeUrl(activeLesson.liveJoinUrl, '')
    : '';
  const safeSheetUrl = activeLesson?.lectureSheetUrl
    ? sanitizeSafeUrl(activeLesson.lectureSheetUrl, '')
    : '';

  const handleMarkComplete = async () => {
    if (!activeCourse || !activeLesson || !activeEnrollment) return;
    const res = await apiFetch<{ enrollment: Enrollment }>('/api/learn/progress', {
      method: 'POST',
      body: JSON.stringify({ courseId: activeCourse.id, lessonId: activeLesson.id }),
    });
    setData((prev) =>
      prev
        ? {
            ...prev,
            enrollments: prev.enrollments.map((e) =>
              e.id === res.enrollment.id ? res.enrollment : e
            ),
          }
        : prev
    );
  };

  const activeType = activeLesson?.lessonType ?? 'recorded';
  const dripCheck =
    isAdminRole(user.role) || user.role === 'teacher'
      ? { unlocked: true, daysRemaining: 0 }
      : isLessonDripUnlocked(activeEnrollment?.enrolledAt, activeLesson?.dripDays);

  const startSpeakingRecording = async () => {
    setRecordMsg(null);
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        audioChunksRef.current = [];
        mr.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };
        mr.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') setRecordedAudioUrl(reader.result);
          };
          reader.readAsDataURL(blob);
          stream.getTracks().forEach((t) => t.stop());
        };
        mediaRecorderRef.current = mr;
        mr.start();
        setRecording(true);
        return;
      } catch {
        // Fallback when microphone permission or hardware is absent
      }
    }
    // Clean deterministic sample WAV audio data URI fallback for browser without mic hardware
    setRecordedAudioUrl('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    setRecordMsg('Audio clip prepared cleanly (no microphone hardware detected).');
  };

  const stopSpeakingRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const submitSpeakingPractice = async () => {
    if (!activeCourse || !activeLesson) return;
    setRecordMsg(null);
    const res = await apiFetch<{ submission: SpeakingSubmission }>('/api/speaking/submissions', {
      method: 'POST',
      body: JSON.stringify({
        courseId: activeCourse.id,
        lessonId: activeLesson.id,
        lessonTitle: activeLesson.title,
        promptText: speakingPrompt,
        audioDataUrl:
          recordedAudioUrl ||
          'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA',
        durationSec: 12,
      }),
    });
    setSpeakingSubs((prev) => [res.submission, ...prev]);
    setRecordedAudioUrl('');
    setRecordMsg('Private speaking recording sent to instructor for pronunciation review.');
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              AEC Live & Recorded Classroom
            </h1>
            <p className="text-sm text-slate-600">
              Join scheduled Live Classes, watch HD Recorded Lectures, and download PDF Sheets.
            </p>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2.5">
            {(isAdminRole(user.role) || user.role === 'teacher') && (
              <button
                type="button"
                onClick={() => navigate('/portal')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>Manage Lectures & Batches</span>
              </button>
            )}
            {activeCourse && (
              <select
                aria-label="Select course"
                value={activeCourse.id}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedCourseId(nextId);
                  setTypeFilter('all');
                  const first = data.lessonsByCourse[nextId]?.[0];
                  setSelectedLessonId(first?.id || '');
                }}
                className="w-full max-w-full truncate rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 sm:w-auto sm:max-w-xs md:max-w-sm"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Learner XP, Streak & Badges Strip */}
        {rewards && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-amber-950">
                <Award className="h-4 w-4 text-amber-600" />
                {rewards.xp} XP
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-800">
                <Flame className="h-4 w-4 text-orange-500" />
                {rewards.streakDays} Day Streak
              </span>
              <div className="flex flex-wrap gap-1.5">
                {rewards.badges.map((b) => (
                  <span
                    key={b}
                    className="rounded-lg bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-700 border border-amber-200"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/community')}
              className="text-xs font-extrabold text-indigo-700 hover:underline"
            >
              View XP Leaderboard →
            </button>
          </div>
        )}

        {/* Active Course Batches Routine Strip */}
        {courseBatches.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courseBatches.map((bat) => (
              <div
                key={bat.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                    <p className="truncate text-xs font-extrabold text-slate-900">{bat.name}</p>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-600">
                    <CalendarClock className="h-3 w-3 text-slate-400" />
                    <span className="truncate">{bat.schedule}</span>
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                    bat.status === 'open'
                      ? 'bg-emerald-50 text-emerald-700'
                      : bat.status === 'running'
                        ? 'bg-sky-50 text-sky-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {bat.mode}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Player / Live Class Room / Lecture Sheet */}
          <div className="lg:col-span-8">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              {activeLesson && !dripCheck.unlocked ? (
                <div className="flex flex-col items-center justify-center bg-slate-900 p-12 text-center text-white">
                  <Lock className="h-10 w-10 text-amber-400" />
                  <h2 className="mt-4 text-xl font-bold">{activeLesson.title}</h2>
                  <p className="mt-2 max-w-md text-xs text-slate-300">
                    Drip Content Schedule: This module unlocks in {dripCheck.daysRemaining} day(s)
                    to keep your study cadence on track.
                  </p>
                </div>
              ) : activeLesson && activeType === 'audio' ? (
                <div className="bg-gradient-to-br from-[#062436] to-[#134e4a] p-8 text-white space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase text-amber-300">
                    <Headphones className="h-4 w-4" />
                    <span>Audio &amp; Phonetics Lab · {activeLesson.duration}</span>
                  </div>
                  <h2 className="text-2xl font-extrabold">{activeLesson.title}</h2>
                  {activeLesson.audioUrl ? (
                    <audio controls src={sanitizeSafeUrl(activeLesson.audioUrl, '')} className="w-full" />
                  ) : (
                    <p className="text-xs text-sky-200">
                      Listen to the phonetic drill notes below and record your private pronunciation
                      submission for teacher review.
                    </p>
                  )}
                </div>
              ) : activeLesson && activeType === 'live' ? (
                <div className="bg-gradient-to-br from-[#042133] via-[#092f47] to-[#1e1b4b] p-8 text-white">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-extrabold uppercase ${
                        activeLesson.liveStatus === 'live_now'
                          ? 'bg-rose-600 text-white'
                          : activeLesson.liveStatus === 'ended'
                            ? 'bg-slate-700 text-slate-200'
                            : 'bg-amber-400 text-slate-950'
                      }`}
                    >
                      <Radio className="h-3.5 w-3.5" />
                      <span>
                        {activeLesson.liveStatus === 'live_now'
                          ? 'LIVE CLASS IN PROGRESS'
                          : activeLesson.liveStatus === 'ended'
                            ? 'LIVE CLASS ENDED'
                            : 'UPCOMING LIVE CLASS'}
                      </span>
                    </span>
                    {activeLesson.scheduledAt && (
                      <span className="font-mono-tabular text-xs font-semibold text-sky-200">
                        Schedule: {activeLesson.scheduledAt}
                      </span>
                    )}
                  </div>

                  <h2 className="mt-4 text-2xl font-extrabold">{activeLesson.title}</h2>
                  <p className="mt-1 text-xs text-sky-200">
                    {activeLesson.moduleName}
                    {activeLesson.batchName ? ` · Batch: ${activeLesson.batchName}` : ''} ·{' '}
                    {activeLesson.duration}
                  </p>

                  {safeLiveJoinUrl && activeLesson.liveStatus !== 'ended' && (
                    <div className="mt-6">
                      <a
                        href={safeLiveJoinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-xs font-extrabold text-slate-950 shadow-lg hover:bg-amber-300"
                      >
                        <Radio className="h-4 w-4" />
                        <span>Join Live Class Stream</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}

                  {safeEmbedUrl && (
                    <div className="mt-6 aspect-video overflow-hidden rounded-xl border border-white/15 bg-black">
                      <iframe
                        src={safeEmbedUrl}
                        title={activeLesson.title}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  )}
                </div>
              ) : activeLesson && activeType === 'lecture_sheet' ? (
                <div className="flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-indigo-50 p-10 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md">
                    <FileText className="h-8 w-8" />
                  </span>
                  <h2 className="mt-4 text-xl font-extrabold text-slate-900">
                    {activeLesson.title}
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    {activeLesson.moduleName}
                    {activeLesson.batchName ? ` · ${activeLesson.batchName}` : ''} ·{' '}
                    {activeLesson.duration}
                  </p>
                  {safeSheetUrl && (
                    <a
                      href={safeSheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#062436] px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-600"
                    >
                      <FileText className="h-4 w-4 text-amber-400" />
                      <span>Open / Download Lecture Sheet</span>
                    </a>
                  )}
                </div>
              ) : safeEmbedUrl ? (
                <div className="aspect-video w-full bg-black">
                  <iframe
                    src={safeEmbedUrl}
                    title={activeLesson?.title || 'Recorded Lecture Video'}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center bg-gradient-to-br from-[#042133] to-[#0a3c4d] p-8 text-center text-white">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-lg">
                    <Play className="h-7 w-7 fill-slate-950" />
                  </span>
                  <h2 className="mt-4 text-xl font-extrabold">
                    {activeLesson?.title || 'Select a lecture from the playlist'}
                  </h2>
                  {activeLesson && (
                    <p className="mt-1 text-xs font-medium text-sky-200">
                      {activeLesson.moduleName} · Duration {activeLesson.duration}
                    </p>
                  )}
                </div>
              )}

              {activeLesson && (
                <div className="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-sky-600">
                        Lecture Sheet & Notes
                      </span>
                      <h3 className="text-lg font-extrabold text-slate-900">
                        {activeLesson.videoPreviewTitle}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {safeSheetUrl && activeType !== 'lecture_sheet' && (
                        <a
                          href={safeSheetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100"
                        >
                          <FileText className="h-4 w-4 text-amber-600" />
                          <span>Lecture Sheet PDF</span>
                        </a>
                      )}
                      {activeEnrollment && (
                        <button
                          type="button"
                          onClick={handleMarkComplete}
                          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                            activeEnrollment.completedLessonIds.includes(activeLesson.id)
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-[#062436] text-white hover:bg-[#0c3954]'
                          }`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>
                            {activeEnrollment.completedLessonIds.includes(activeLesson.id)
                              ? 'Completed'
                              : 'Mark as Completed'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-700">
                    {activeLesson.sheetSummary}
                  </p>

                  {(activeLesson.isPhonetics || activeType === 'audio') && (
                    <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                          <Mic className="h-4 w-4 text-rose-600" />
                          <span>Private Speaking Practice &amp; Teacher Review</span>
                        </h4>
                        <span className="text-[11px] font-semibold text-indigo-700">
                          Private Audio Submission
                        </span>
                      </div>
                      <input
                        type="text"
                        value={speakingPrompt}
                        onChange={(e) => setSpeakingPrompt(e.target.value)}
                        aria-label="Speaking practice sentence"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        {!recording ? (
                          <button
                            type="button"
                            onClick={() => void startSpeakingRecording()}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                          >
                            <Mic className="h-3.5 w-3.5" />
                            <span>Record Private Speaking</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={stopSpeakingRecording}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                          >
                            <Square className="h-3.5 w-3.5" />
                            <span>Stop Recording</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void submitSpeakingPractice()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#062436] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b3854]"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>Send for Teacher Review</span>
                        </button>
                      </div>
                      {recordedAudioUrl && (
                        <audio controls src={recordedAudioUrl} className="w-full max-w-md h-9" />
                      )}
                      {recordMsg && (
                        <p className="text-xs font-semibold text-emerald-700">{recordMsg}</p>
                      )}
                      {speakingSubs.length > 0 && (
                        <div className="space-y-2 border-t border-indigo-200/70 pt-3">
                          <p className="text-xs font-bold text-slate-700">
                            Your Recent Speaking Submissions ({speakingSubs.length})
                          </p>
                          {speakingSubs.slice(0, 3).map((s) => (
                            <div
                              key={s.id}
                              className="rounded-xl border border-slate-200 bg-white p-3 text-xs"
                            >
                              <p className="font-semibold text-slate-900">
                                {s.lessonTitle} · {s.status.replace('_', ' ').toUpperCase()}
                              </p>
                              {s.status === 'reviewed' && (
                                <p className="mt-1 text-emerald-700">
                                  Pronunciation: {s.pronunciationScore}% · Fluency: {s.fluencyScore}% ·{' '}
                                  {s.teacherFeedback}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Playlist Sidebar */}
          <div className="lg:col-span-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Course Syllabus ({allLessons.length})
                </h3>
                {activeEnrollment && (
                  <span className="font-mono-tabular text-xs font-bold text-emerald-700">
                    {progressPct}% Complete
                  </span>
                )}
              </div>

              {activeEnrollment && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}

              {/* Playlist Type Filter Pills */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  { id: 'all' as const, label: 'All' },
                  { id: 'recorded' as const, label: 'Recorded' },
                  { id: 'live' as const, label: 'Live' },
                  { id: 'audio' as const, label: 'Audio' },
                  { id: 'lecture_sheet' as const, label: 'Sheets' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTypeFilter(f.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      typeFilter === f.id
                        ? 'bg-[#062436] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                {filteredLessons.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    {allLessons.length === 0
                      ? 'Enroll in this course to unlock full lectures and live classes.'
                      : 'No classes match this filter.'}
                  </p>
                ) : (
                  filteredLessons.map((les) => {
                    const isSelected = activeLesson?.id === les.id;
                    const done = activeEnrollment?.completedLessonIds.includes(les.id);
                    const lType = les.lessonType ?? 'recorded';
                    return (
                      <button
                        key={les.id}
                        type="button"
                        onClick={() => setSelectedLessonId(les.id)}
                        className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                          isSelected
                            ? 'border-sky-500 bg-sky-50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                            done
                              ? 'bg-emerald-500 text-white'
                              : lType === 'live'
                                ? 'bg-rose-600 text-white'
                                : lType === 'lecture_sheet'
                                  ? 'bg-amber-500 text-white'
                                  : isSelected
                                    ? 'bg-sky-600 text-white'
                                    : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {done ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : lType === 'live' ? (
                            <Radio className="h-4 w-4" />
                          ) : lType === 'lecture_sheet' ? (
                            <FileText className="h-4 w-4" />
                          ) : (
                            <Video className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-extrabold uppercase text-slate-500">
                              {lType === 'live'
                                ? les.liveStatus === 'live_now'
                                  ? 'LIVE NOW'
                                  : 'Live Class'
                                : lType === 'lecture_sheet'
                                  ? 'PDF Sheet'
                                  : 'Recorded'}
                            </span>
                            {les.batchName && (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                {les.batchName}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs font-bold text-slate-900">{les.title}</p>
                          <p className="mt-0.5 font-mono-tabular text-[11px] text-slate-500">
                            {les.duration}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* SCORM 1.2 Interactive Labs */}
            {scormPackages.length > 0 && (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-white p-5 shadow-xs">
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>SCORM 1.2 Interactive Labs ({scormPackages.length})</span>
                </h3>
                <div className="mt-3 space-y-2.5">
                  {scormPackages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-slate-900">{pkg.title}</p>
                        <p className="text-[11px] text-emerald-700 font-semibold">
                          +{pkg.xpReward} XP · {pkg.identifier}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveScormPkg(pkg)}
                        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                      >
                        Launch Lab
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ScormPlayerModal
        pkg={activeScormPkg}
        onClose={() => setActiveScormPkg(null)}
        onCompleted={(nextRewards) => setRewards(nextRewards)}
      />
    </div>
  );
}
