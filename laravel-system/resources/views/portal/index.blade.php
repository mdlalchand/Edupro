@extends('layouts.app')
@section('title', 'Unified Portal — Aloms English Center')
@section('content')
<div class="max-w-7xl mx-auto px-4 py-10 space-y-6">
    @if(session('status'))
        <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
            {{ session('status') }}
        </div>
    @endif

    <div class="rounded-2xl bg-white border border-slate-200 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
            <p class="text-xs font-bold uppercase text-sky-600">Unified Multi-Role Portal · {{ strtoupper($user->role) }}</p>
            <h1 class="text-2xl font-extrabold text-slate-900">Welcome, {{ $user->name }}</h1>
        </div>
        <form method="POST" action="{{ route('logout') }}">
            @csrf
            <button type="submit" class="rounded-xl bg-rose-50 text-rose-700 font-bold px-4 py-2 text-xs">Sign Out</button>
        </form>
    </div>

    @if($user->role === 'admin')
        @php
            $dynamicCourseCats = collect($categories ?? [])->where('type', 'course')->where('active', true)->pluck('name')->all();
            $courseCategoryOptions = array_values(array_unique(array_merge(['HSC English', 'SSC English', 'IELTS & Spoken', 'Grammar Pro', 'Admission', 'Combo Packs'], $dynamicCourseCats)));
        @endphp
        <div id="categories-studio" class="rounded-2xl bg-white border border-slate-200 p-6 mb-6">
            <h2 class="text-lg font-extrabold text-slate-900">Course Categories Manager ({{ collect($categories ?? [])->where('type', 'course')->count() }})</h2>
            <p class="text-xs text-slate-500 mb-4">Create new course categories here — active categories immediately appear in Course Creation, Editing, and Public Filtering.</p>
            <form method="POST" action="{{ route('portal.categories.store') }}" class="flex flex-wrap items-center gap-3 mb-4">
                @csrf
                <input type="hidden" name="type" value="course">
                <input type="text" name="name" required placeholder="New Category Name (e.g. BCS Special)" class="flex-1 min-w-[220px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <button type="submit" class="rounded-xl bg-indigo-600 text-white px-4 py-2 text-xs font-bold">+ Add Course Category</button>
            </form>
            <div class="flex flex-wrap gap-2">
                @foreach(collect($categories ?? [])->where('type', 'course') as $cat)
                    <div class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
                        <span class="font-bold text-slate-800">{{ $cat->name }}</span>
                        <form method="POST" action="{{ route('portal.categories.toggle', $cat) }}" class="inline">
                            @csrf @method('PATCH')
                            <button type="submit" class="font-bold {{ $cat->active ? 'text-emerald-700' : 'text-slate-500' }}">{{ $cat->active ? 'Active' : 'Hidden' }}</button>
                        </form>
                        <form method="POST" action="{{ route('portal.categories.delete', $cat) }}" class="inline">
                            @csrf @method('DELETE')
                            <button type="submit" class="text-rose-600 font-bold">×</button>
                        </form>
                    </div>
                @endforeach
            </div>
        </div>

        <div id="courses-studio" class="rounded-2xl bg-white border border-slate-200 p-6">
            <div class="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                    <h2 class="text-lg font-extrabold text-slate-900">Advanced Course & Combo Studio ({{ $courses->count() }})</h2>
                    <p class="text-xs text-slate-500">Add, modify, toggle active/draft status, duplicate, or delete courses & combo bundles.</p>
                </div>
                <a href="{{ route('courses.index') }}" class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700">View Live /courses</a>
            </div>

            {{-- Create Course Form --}}
            <form method="POST" action="{{ route('portal.courses.store') }}" class="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-6 space-y-3">
                @csrf
                <h3 class="text-sm font-extrabold text-slate-900">+ Add New Course / Combo</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input type="text" name="title" required placeholder="Course Title" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <input type="text" name="subtitle" required placeholder="Subtitle" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <select name="category" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                        @foreach($courseCategoryOptions as $catOpt)
                            <option value="{{ $catOpt }}">{{ $catOpt }}</option>
                        @endforeach
                    </select>
                    <input type="text" name="level_tag" required value="HSC 27" placeholder="Level Tag (e.g. HSC 27)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <input type="number" name="price" required value="1990" min="0" placeholder="Sale Price (৳)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <input type="number" name="original_price" required value="3000" min="0" placeholder="Original Price (৳)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <select name="status" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                        <option value="active">Active (Published)</option>
                        <option value="draft">Draft (Hidden)</option>
                    </select>
                    <label class="flex items-center gap-2 text-xs font-bold text-slate-700 px-2">
                        <input type="checkbox" name="is_combo" value="1">
                        <span>Bundle as Combo Pack</span>
                    </label>
                    <label class="flex items-center gap-2 text-xs font-bold text-slate-700 px-2">
                        <input type="checkbox" name="exam_system_included" value="1" checked>
                        <span>Include Exam System</span>
                    </label>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <textarea name="description" required rows="2" placeholder="Full Course Description" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"></textarea>
                    <textarea name="included_courses_text" rows="2" placeholder="Included courses for Combo (one per line)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"></textarea>
                </div>
                <button type="submit" class="rounded-xl bg-indigo-600 text-white px-5 py-2 text-xs font-bold">Publish Course</button>
            </form>

            {{-- Courses Table with Inline Modify / Toggle Status / Duplicate / Delete --}}
            <div class="space-y-3">
                @foreach($courses as $c)
                    <details class="rounded-xl border border-slate-200 p-4">
                        <summary class="flex flex-wrap items-center justify-between gap-3 cursor-pointer list-none">
                            <div>
                                <p class="font-bold text-sm text-slate-900">{{ $c->title }}</p>
                                <p class="text-xs text-slate-500">{{ $c->category }} · {{ $c->level_tag }} · ৳{{ $c->price }} (Reg: ৳{{ $c->original_price }}) · {{ strtoupper($c->status) }}</p>
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">Modify Details</span>
                                <form method="POST" action="{{ route('portal.courses.status', $c) }}" class="inline">
                                    @csrf @method('PATCH')
                                    <button type="submit" class="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">
                                        {{ $c->status === 'active' ? 'Move to Draft' : 'Publish Active' }}
                                    </button>
                                </form>
                                <form method="POST" action="{{ route('portal.courses.duplicate', $c) }}" class="inline">
                                    @csrf
                                    <button type="submit" class="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">Duplicate</button>
                                </form>
                                <form method="POST" action="{{ route('portal.courses.delete', $c) }}" class="inline">
                                    @csrf @method('DELETE')
                                    <button type="submit" class="rounded-lg bg-rose-50 text-rose-700 px-2.5 py-1 text-xs font-bold">Delete</button>
                                </form>
                            </div>
                        </summary>

                        <form method="POST" action="{{ route('portal.courses.update', $c) }}" class="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                            @csrf @method('PUT')
                            <input type="text" name="title" required value="{{ $c->title }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="text" name="subtitle" required value="{{ $c->subtitle }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <select name="category" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                                @foreach(array_values(array_unique(array_merge($courseCategoryOptions, [$c->category]))) as $catOpt)
                                    <option value="{{ $catOpt }}" @selected($c->category === $catOpt)>{{ $catOpt }}</option>
                                @endforeach
                            </select>
                            <input type="text" name="level_tag" required value="{{ $c->level_tag }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="number" name="price" required value="{{ $c->price }}" min="0" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="number" name="original_price" required value="{{ $c->original_price }}" min="0" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <select name="status" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                                <option value="active" @selected($c->status === 'active')>Active</option>
                                <option value="draft" @selected($c->status === 'draft')>Draft</option>
                            </select>
                            <label class="flex items-center gap-2 text-xs font-bold text-slate-700 px-2">
                                <input type="checkbox" name="is_combo" value="1" @checked($c->is_combo)>
                                <span>Combo Pack</span>
                            </label>
                            <label class="flex items-center gap-2 text-xs font-bold text-slate-700 px-2">
                                <input type="checkbox" name="exam_system_included" value="1" @checked($c->exam_system_included)>
                                <span>Exam System</span>
                            </label>
                            <textarea name="description" required rows="2" class="md:col-span-2 rounded-xl border border-slate-300 px-3 py-2 text-xs">{{ $c->description }}</textarea>
                            <textarea name="included_courses_text" rows="2" placeholder="Combo included courses (one per line)" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">{{ implode("\n", $c->included_courses ?? []) }}</textarea>
                            <div class="md:col-span-3">
                                <button type="submit" class="rounded-xl bg-[#062436] text-white px-4 py-2 text-xs font-bold">Save Changes</button>
                            </div>
                        </form>
                    </details>
                @endforeach
            </div>
        </div>
    @endif

    @if(in_array($user->role, ['admin', 'teacher', 'branch_manager']) && isset($batches))
        <div id="batches-studio" class="rounded-2xl bg-white border border-slate-200 p-6">
            <h2 class="text-lg font-extrabold text-slate-900 mb-1">Course Batches & Class Routine Studio ({{ $batches->count() }})</h2>
            <p class="text-xs text-slate-500 mb-4">Create, edit, toggle admission status, or delete course batches.</p>

            <form method="POST" action="{{ route('portal.batches.store') }}" class="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                @csrf
                <select name="course_id" required class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    @foreach($courses as $c)
                        <option value="{{ $c->id }}">{{ $c->title }}</option>
                    @endforeach
                </select>
                <input type="text" name="name" required placeholder="Batch Name (e.g. Mirpur Morning A)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="code" required placeholder="Batch Code (SSC-27-MPR-02)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs uppercase">
                <select name="branch_id" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    @foreach($branches as $b)
                        <option value="{{ $b->id }}">{{ $b->name }}</option>
                    @endforeach
                </select>
                <input type="text" name="instructor_name" placeholder="Lead Instructor Name" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="schedule" required placeholder="Routine (Sat · Mon · Wed 4:00 PM)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="start_date" value="2026-05-05" placeholder="Start Date" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="number" name="seat_limit" value="60" min="1" placeholder="Seat Limit" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <div class="grid grid-cols-2 gap-2">
                    <select name="mode" class="rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs">
                        <option value="Hybrid">Hybrid</option>
                        <option value="Online Live">Online Live</option>
                        <option value="Offline Branch">Offline Branch</option>
                    </select>
                    <select name="status" class="rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs">
                        <option value="open">Open</option>
                        <option value="running">Running</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>
                <div class="md:col-span-3">
                    <button type="submit" class="rounded-xl bg-indigo-600 text-white px-5 py-2 text-xs font-bold">+ Create Course Batch</button>
                </div>
            </form>

            <div class="space-y-2.5">
                @foreach($batches as $bat)
                    <details class="rounded-xl border border-slate-200 p-4">
                        <summary class="flex flex-wrap items-center justify-between gap-2 cursor-pointer list-none">
                            <div>
                                <p class="text-sm font-bold text-slate-900">{{ $bat->name }} <span class="text-xs text-indigo-700">({{ $bat->code }})</span></p>
                                <p class="text-xs text-slate-500">{{ $bat->course?->title }} · {{ $bat->schedule }} · {{ $bat->mode }} · {{ strtoupper($bat->status) }}</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Edit Batch</span>
                                <form method="POST" action="{{ route('portal.batches.delete', $bat) }}" class="inline">
                                    @csrf @method('DELETE')
                                    <button type="submit" class="rounded-lg bg-rose-50 text-rose-700 px-2.5 py-1 text-xs font-bold">Delete</button>
                                </form>
                            </div>
                        </summary>
                        <form method="POST" action="{{ route('portal.batches.update', $bat) }}" class="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                            @csrf @method('PUT')
                            <input type="hidden" name="course_id" value="{{ $bat->course_id }}">
                            <input type="text" name="name" required value="{{ $bat->name }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="text" name="code" required value="{{ $bat->code }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs uppercase">
                            <input type="text" name="schedule" required value="{{ $bat->schedule }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="number" name="seat_limit" required value="{{ $bat->seat_limit }}" min="1" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <select name="mode" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                                @foreach(['Hybrid', 'Online Live', 'Offline Branch'] as $mOpt)
                                    <option value="{{ $mOpt }}" @selected($bat->mode === $mOpt)>{{ $mOpt }}</option>
                                @endforeach
                            </select>
                            <select name="status" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                                @foreach(['open', 'running', 'closed'] as $sOpt)
                                    <option value="{{ $sOpt }}" @selected($bat->status === $sOpt)>{{ strtoupper($sOpt) }}</option>
                                @endforeach
                            </select>
                            <div class="md:col-span-3">
                                <button type="submit" class="rounded-xl bg-[#062436] text-white px-4 py-2 text-xs font-bold">Save Batch Changes</button>
                            </div>
                        </form>
                    </details>
                @endforeach
            </div>
        </div>
    @endif

    @if(in_array($user->role, ['admin', 'teacher']) && isset($lessons))
        <div id="lessons-studio" class="rounded-2xl bg-white border border-slate-200 p-6">
            <h2 class="text-lg font-extrabold text-slate-900 mb-1">Lecture, Live Class & Recorded Video Studio ({{ $lessons->count() }})</h2>
            <p class="text-xs text-slate-500 mb-4">Publish recorded videos, Zoom/YouTube Live sessions, and downloadable PDF lecture sheets.</p>

            <form method="POST" action="{{ route('portal.lessons.store') }}" class="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                @csrf
                <select name="course_id" required class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    @foreach($courses as $c)
                        <option value="{{ $c->id }}">{{ $c->title }}</option>
                    @endforeach
                </select>
                <select name="batch_id" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <option value="">All Batches (General)</option>
                    @foreach($batches ?? [] as $bat)
                        <option value="{{ $bat->id }}">{{ $bat->name }} ({{ $bat->code }})</option>
                    @endforeach
                </select>
                <select name="lesson_type" required class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold">
                    <option value="recorded">Recorded Video</option>
                    <option value="live">Live Class</option>
                    <option value="lecture_sheet">Lecture Sheet (PDF)</option>
                </select>
                <input type="text" name="title" required placeholder="Lecture / Live / Video Title" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs md:col-span-2">
                <input type="text" name="duration" required value="40:00" placeholder="Duration (e.g. 40:00)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="module_name" required value="Module 1: Core Grammar" placeholder="Module Name" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="url" name="video_url" placeholder="Recorded Video / Replay URL (YouTube)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="url" name="live_join_url" placeholder="Live Class Join URL (Zoom / Meet)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="lecture_sheet_url" placeholder="Lecture Sheet PDF URL" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="scheduled_at" placeholder="Live Schedule (e.g. 2026-04-28 08:00 PM)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <select name="live_status" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <option value="scheduled">Live: Scheduled</option>
                    <option value="live_now">Live: LIVE NOW</option>
                    <option value="ended">Live: Ended</option>
                </select>
                <textarea name="sheet_summary" rows="2" placeholder="Lecture Sheet Notes & Summary" class="md:col-span-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"></textarea>
                <div class="md:col-span-3 flex items-center justify-between">
                    <label class="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <input type="checkbox" name="is_free_preview" value="1">
                        <span>Unlock Free Public Preview</span>
                    </label>
                    <button type="submit" class="rounded-xl bg-indigo-600 text-white px-5 py-2 text-xs font-bold">+ Publish Class</button>
                </div>
            </form>

            <div class="space-y-2.5">
                @foreach($lessons as $les)
                    <details class="rounded-xl border border-slate-200 p-4">
                        <summary class="flex flex-wrap items-center justify-between gap-2 cursor-pointer list-none">
                            <div>
                                <p class="text-sm font-bold text-slate-900">
                                    <span class="uppercase text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 mr-1.5">{{ $les->lesson_type }}</span>
                                    {{ $les->title }}
                                </p>
                                <p class="text-xs text-slate-500">{{ $les->course?->title }} · {{ $les->module_name }} · {{ $les->duration }} @if($les->batch) · Batch: {{ $les->batch->name }} @endif</p>
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                                @if($les->lesson_type === 'live')
                                    <form method="POST" action="{{ route('portal.lessons.live_status', $les) }}" class="inline">
                                        @csrf @method('PATCH')
                                        <input type="hidden" name="live_status" value="{{ $les->live_status === 'live_now' ? 'ended' : 'live_now' }}">
                                        <button type="submit" class="rounded-lg bg-rose-600 text-white px-2.5 py-1 text-xs font-bold">
                                            {{ $les->live_status === 'live_now' ? 'End Live' : 'Go Live' }}
                                        </button>
                                    </form>
                                @endif
                                <form method="POST" action="{{ route('portal.lessons.duplicate', $les) }}" class="inline">
                                    @csrf
                                    <button type="submit" class="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">Duplicate</button>
                                </form>
                                <form method="POST" action="{{ route('portal.lessons.delete', $les) }}" class="inline">
                                    @csrf @method('DELETE')
                                    <button type="submit" class="rounded-lg bg-rose-50 text-rose-700 px-2.5 py-1 text-xs font-bold">Delete</button>
                                </form>
                            </div>
                        </summary>
                        <form method="POST" action="{{ route('portal.lessons.update', $les) }}" class="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                            @csrf @method('PUT')
                            <input type="hidden" name="course_id" value="{{ $les->course_id }}">
                            <input type="hidden" name="lesson_type" value="{{ $les->lesson_type }}">
                            <input type="text" name="title" required value="{{ $les->title }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs md:col-span-2">
                            <input type="text" name="duration" required value="{{ $les->duration }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="text" name="module_name" required value="{{ $les->module_name }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="text" name="video_url" value="{{ $les->video_url }}" placeholder="Video URL" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="text" name="live_join_url" value="{{ $les->live_join_url }}" placeholder="Live Join URL" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <textarea name="sheet_summary" rows="2" class="md:col-span-3 rounded-xl border border-slate-300 px-3 py-2 text-xs">{{ $les->sheet_summary }}</textarea>
                            <div class="md:col-span-3">
                                <button type="submit" class="rounded-xl bg-[#062436] text-white px-4 py-2 text-xs font-bold">Save Lecture Changes</button>
                            </div>
                        </form>
                    </details>
                @endforeach
            </div>
        </div>
    @endif

    @if(in_array($user->role, ['admin', 'branch_manager']))
        <div class="rounded-2xl bg-white border border-slate-200 p-6">
            <h2 class="text-lg font-extrabold mb-4">Enrollments & Fee Approvals</h2>
            <div class="space-y-2">
                @foreach($enrollments as $enr)
                    <div class="flex items-center justify-between border rounded-xl p-3 text-sm">
                        <div><strong>{{ $enr->user->name }}</strong> — {{ $enr->course->title }} (৳{{ $enr->amount_paid }})</div>
                        <div class="flex items-center gap-2">
                            <span class="uppercase text-xs font-bold">{{ $enr->status }}</span>
                            @if($enr->status === 'pending')
                                <form method="POST" action="{{ route('portal.enrollments.decide', $enr) }}">
                                    @csrf @method('PATCH')
                                    <input type="hidden" name="status" value="approved">
                                    <button class="rounded-lg bg-emerald-600 text-white px-3 py-1 text-xs font-bold">Approve</button>
                                </form>
                            @endif
                        </div>
                    </div>
                @endforeach
            </div>
        </div>
    @endif

    @if($user->role === 'admin')
        <div class="rounded-2xl bg-white border border-slate-200 p-6 space-y-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 class="text-lg font-extrabold text-slate-900">Homepage Visual CMS Studio</h2>
                    <p class="text-xs text-slate-500">Manage Hero Slider banners, Featured Course Highlights, Statistics counters, and Testimonials without coding.</p>
                </div>
                <a href="{{ route('home') }}" target="_blank" class="rounded-xl bg-[#062436] text-white px-4 py-2 text-xs font-bold">Preview Homepage</a>
            </div>

            {{-- Hero Slider Create + List --}}
            <div class="border-t border-slate-100 pt-5">
                <h3 class="text-sm font-extrabold text-slate-900 mb-3">Hero Carousel Slides</h3>
                <form method="POST" action="{{ route('portal.homepage.slides.store') }}" enctype="multipart/form-data" class="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                    @csrf
                    <input type="text" name="badge" required placeholder="Badge (e.g. AEC 27)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <input type="text" name="title" required placeholder="Slide Title" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs md:col-span-2">
                    <input type="text" name="subtitle" placeholder="Subtitle" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs md:col-span-2">
                    <input type="text" name="cta_text" required value="Explore Batch" placeholder="CTA Text" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <select name="course_slug" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                        @foreach($courses as $c)
                            <option value="{{ $c->slug }}">{{ $c->title }}</option>
                        @endforeach
                    </select>
                    <input type="file" name="banner_image" accept="image/png,image/jpeg,image/webp,image/gif" class="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs">
                    <input type="text" name="image_url" placeholder="Or Image URL (optional)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <button type="submit" class="rounded-xl bg-indigo-600 text-white px-4 py-2 text-xs font-bold md:col-span-3">+ Add Hero Slide (With Custom Picture)</button>
                </form>

                <div class="space-y-2">
                    @foreach($heroSlides ?? [] as $idx => $sl)
                        <div class="flex items-center justify-between gap-3 border border-slate-200 rounded-xl p-3 text-xs">
                            <div class="flex items-center gap-3">
                                @if(!empty($sl['image']))
                                    <img src="{{ \Illuminate\Support\Str::startsWith($sl['image'], ['http://', 'https://', '/']) ? $sl['image'] : asset($sl['image']) }}" alt="{{ $sl['title'] ?? 'Slide' }}" class="h-12 w-20 rounded-lg object-cover border border-slate-200">
                                @endif
                                <div>
                                    <span class="font-bold text-amber-700 mr-2">{{ $sl['badge'] ?? 'AEC' }}</span>
                                    <strong class="text-slate-900">{{ $sl['title'] ?? '' }}</strong>
                                    <span class="text-slate-500 ml-2">(/course/{{ $sl['course_slug'] ?? '' }})</span>
                                </div>
                            </div>
                            <form method="POST" action="{{ route('portal.homepage.slides.delete', $idx) }}">
                                @csrf @method('DELETE')
                                <button type="submit" class="rounded-lg bg-rose-50 text-rose-700 px-2.5 py-1 font-bold">Delete</button>
                            </form>
                        </div>
                    @endforeach
                </div>
            </div>

            {{-- Highlights & Statistics Config --}}
            <form method="POST" action="{{ route('portal.homepage.config') }}" class="border-t border-slate-100 pt-5 space-y-4">
                @csrf
                <h3 class="text-sm font-extrabold text-slate-900">Featured Course Highlights & Statistics Control</h3>
                @php $hc = $homepageConfig ?? []; @endphp
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input type="text" name="featured_badge" value="{{ $hc['featured_badge'] ?? 'Online & Branch Course' }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs" placeholder="Featured Card Badge">
                    <input type="text" name="featured_title" value="{{ $hc['featured_title'] ?? 'Online Batches are ongoing!' }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs" placeholder="Featured Card Title">
                    <input type="text" name="featured_subtitle" value="{{ $hc['featured_subtitle'] ?? 'Book your seat now!' }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs" placeholder="Featured Subtitle">
                    <input type="text" name="featured_cta" value="{{ $hc['featured_cta'] ?? 'See All Courses' }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs" placeholder="Featured Button Text">
                    <input type="text" name="paths_heading" value="{{ $hc['paths_heading'] ?? 'Choose Your Learning Path' }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs" placeholder="Highlights Grid Heading">
                    <input type="text" name="paths_subheading" value="{{ $hc['paths_subheading'] ?? 'Structured English programs across academic boards and IELTS.' }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs" placeholder="Highlights Grid Subheading">
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <select name="stats_mode" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold">
                        <option value="auto" {{ ($hc['stats_mode'] ?? 'auto') === 'auto' ? 'selected' : '' }}>Stats Mode: Auto Live DB</option>
                        <option value="custom" {{ ($hc['stats_mode'] ?? 'auto') === 'custom' ? 'selected' : '' }}>Stats Mode: Custom Numbers</option>
                    </select>
                    <input type="text" name="stats_badge" value="{{ $hc['stats_badge'] ?? 'Trusted Platform' }}" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs" placeholder="Stats Badge">
                    <input type="text" name="stats_title" value="{{ $hc['stats_title'] ?? 'See the stats!' }}" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs" placeholder="Stats Title">
                    <input type="hidden" name="stats_subtitle" value="{{ $hc['stats_subtitle'] ?? 'The trust we are building!' }}">
                    <input type="number" name="custom_students" value="{{ $hc['custom_students'] ?? 340241 }}" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs" placeholder="Students Count">
                    <input type="number" name="custom_courses" value="{{ $hc['custom_courses'] ?? 70 }}" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs" placeholder="Courses Count">
                    <input type="number" name="custom_teachers" value="{{ $hc['custom_teachers'] ?? 30 }}" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs" placeholder="Teachers Count">
                    <input type="number" name="custom_videos" value="{{ $hc['custom_videos'] ?? 6476 }}" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs" placeholder="Videos Count">
                    <button type="submit" class="rounded-xl bg-[#062436] text-white px-4 py-2 text-xs font-bold md:col-span-2">Save Highlights & Statistics</button>
                </div>
            </form>

            {{-- Testimonials CRUD --}}
            <div class="border-t border-slate-100 pt-5">
                <h3 class="text-sm font-extrabold text-slate-900 mb-3">Testimonials & Student Reviews Studio</h3>
                <form method="POST" action="{{ route('portal.reviews.store') }}" class="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                    @csrf
                    <input type="text" name="name" required placeholder="Student / Guardian Name" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <input type="text" name="role_label" required placeholder="Role / Batch Label" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <select name="rating" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold">
                        <option value="5">5 Stars</option>
                        <option value="4">4 Stars</option>
                    </select>
                    <select name="row" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold">
                        <option value="1">Row 1</option>
                        <option value="2">Row 2</option>
                    </select>
                    <textarea name="text" rows="2" required placeholder="Student feedback text..." class="md:col-span-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"></textarea>
                    <button type="submit" class="rounded-xl bg-indigo-600 text-white px-4 py-2 text-xs font-bold">+ Add Testimonial</button>
                </form>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    @foreach($reviews ?? [] as $rev)
                        <div class="border border-slate-200 rounded-xl p-3 flex items-start justify-between gap-3 text-xs">
                            <div>
                                <p class="font-bold text-slate-900">{{ $rev->name }} <span class="text-slate-500 font-normal">· {{ $rev->role_label }}</span></p>
                                <p class="text-slate-600 mt-1">{{ $rev->text }}</p>
                            </div>
                            <form method="POST" action="{{ route('portal.reviews.delete', $rev) }}">
                                @csrf @method('DELETE')
                                <button type="submit" class="rounded-lg bg-rose-50 text-rose-700 px-2.5 py-1 font-bold">Delete</button>
                            </form>
                        </div>
                    @endforeach
                </div>
            </div>
        </div>
    @endif

    @if(in_array($user->role, ['admin', 'teacher']) && isset($questionBank))
        <div class="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
            <h2 class="text-lg font-extrabold text-slate-900">Bulk Subject-Wise Question Bank ({{ $questionBank->count() }})</h2>
            <form method="POST" action="{{ route('portal.question_bank.bulk') }}" class="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                @csrf
                <input type="text" name="subject" required placeholder="Subject (e.g. HSC English 2nd Paper)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="chapter" required placeholder="Chapter" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <select name="difficulty" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <option value="Easy">Easy</option>
                    <option value="Medium" selected>Medium</option>
                    <option value="Hard">Hard</option>
                </select>
                <textarea name="raw_text" rows="3" required placeholder="Question | OptA | OptB | OptC | OptD | CorrectIdx(0-3) | Explanation | Marks" class="md:col-span-3 rounded-xl border border-slate-300 bg-white p-3 text-xs font-mono"></textarea>
                <button type="submit" class="rounded-xl bg-[#062436] text-white px-4 py-2 text-xs font-bold">Bulk Import MCQs</button>
            </form>
            <form method="POST" action="{{ route('portal.exams.from_bank') }}" class="grid grid-cols-1 md:grid-cols-4 gap-3 bg-indigo-50 p-4 rounded-xl border border-indigo-200">
                @csrf
                <input type="text" name="title" required placeholder="New Exam Title from Bank" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs md:col-span-2">
                <input type="text" name="category" required value="HSC English" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="number" name="count" value="5" min="1" placeholder="Questions" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="hidden" name="duration_minutes" value="20">
                <button type="submit" class="rounded-xl bg-indigo-600 text-white px-4 py-2 text-xs font-bold md:col-span-4">Publish Exam from Question Bank</button>
            </form>
        </div>
    @endif

    @if($user->role === 'admin')
        <div class="rounded-2xl bg-white border border-slate-200 p-6 space-y-5">
            <h2 class="text-lg font-extrabold text-slate-900">Coupons, Verified Recovery Backups & Recycle Bin</h2>
            <form method="POST" action="{{ route('portal.coupons.store') }}" class="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                @csrf
                <input type="text" name="code" required placeholder="CODE (e.g. ALOMS25)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs uppercase">
                <input type="number" name="discount_percent" required value="15" min="1" max="90" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <select name="applies_to" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <option value="all">All</option>
                    <option value="courses">Courses</option>
                    <option value="products">Products</option>
                </select>
                <button type="submit" class="rounded-xl bg-indigo-600 text-white px-4 py-2 text-xs font-bold">Save Coupon</button>
            </form>

            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p class="text-xs text-slate-600">SHA-256 Backups: {{ ($backups ?? collect())->count() }} | Recycle Bin: {{ ($recycleBin ?? collect())->count() }}</p>
                <div class="flex items-center gap-2">
                    <a href="{{ route('portal.index') }}#recycle-bin" class="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">Refresh Recycle Bin</a>
                    <form method="POST" action="{{ route('portal.backups.store') }}">
                        @csrf
                        <button type="submit" class="rounded-xl bg-[#062436] text-white px-4 py-2 text-xs font-bold">Create SHA-256 Backup Snapshot</button>
                    </form>
                </div>
            </div>

            <div id="recycle-bin" class="space-y-2 border-t border-slate-100 pt-4">
                <h3 class="text-sm font-extrabold text-slate-900">Recycle Bin — Soft-Deleted Items ({{ ($recycleBin ?? collect())->count() }})</h3>
                @forelse(($recycleBin ?? collect()) as $binItem)
                    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs">
                        <span><strong class="uppercase text-indigo-700">{{ $binItem->entity_type }}</strong> · {{ $binItem->label }} (by {{ $binItem->deleted_by }})</span>
                        <div class="flex items-center gap-2">
                            <form method="POST" action="{{ route('portal.recycle.restore', $binItem) }}">
                                @csrf
                                <button type="submit" class="rounded-lg bg-emerald-600 text-white px-2.5 py-1 font-bold">Restore</button>
                            </form>
                            <form method="POST" action="{{ route('portal.recycle.purge', $binItem) }}">
                                @csrf
                                @method('DELETE')
                                <button type="submit" class="rounded-lg bg-rose-50 text-rose-700 px-2.5 py-1 font-bold">Purge</button>
                            </form>
                        </div>
                    </div>
                @empty
                    <p class="text-xs text-slate-500">Recycle Bin is empty.</p>
                @endforelse
            </div>

            <form method="POST" action="{{ route('portal.menu.update') }}" class="space-y-3 border-t border-slate-100 pt-4">
                @csrf
                <h3 class="text-sm font-extrabold text-slate-900">Custom Header Navigation Menu</h3>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input type="text" name="labels[]" value="Home" class="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold">
                    <input type="text" name="paths[]" value="/" class="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs">
                    <input type="text" name="badges[]" placeholder="Badge" class="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs">
                    <label class="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" name="visibles[]" value="0" checked> Visible</label>
                    <input type="text" name="labels[]" value="Courses" class="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold">
                    <input type="text" name="paths[]" value="/courses" class="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs">
                    <input type="text" name="badges[]" placeholder="Badge" class="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs">
                    <label class="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" name="visibles[]" value="1" checked> Visible</label>
                </div>
                <button type="submit" class="rounded-xl bg-indigo-600 text-white px-4 py-2 text-xs font-bold">Save Custom Menu</button>
            </form>
        </div>

        {{-- Branches Management Studio (Add, Edit/Update, Activate/Deactivate, Soft-Delete) --}}
        <div id="branches-studio" class="rounded-2xl bg-white border border-slate-200 p-6 space-y-5">
            <div>
                <h2 class="text-lg font-extrabold text-slate-900">Branch Campuses Management ({{ $branches->count() }})</h2>
                <p class="text-xs text-slate-500">Add, edit, activate/deactivate, or soft-delete center branches. Inactive branches are hidden from student checkout.</p>
            </div>
            <form method="POST" action="{{ route('portal.branches.store') }}" class="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                @csrf
                <input type="text" name="name" required placeholder="Branch Name (e.g. Dhanmondi Campus)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="code" required placeholder="Code (AEC-DMD)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs uppercase">
                <input type="text" name="city" required value="Dhaka" placeholder="City" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="phone" placeholder="Hotline Phone" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="address" required placeholder="Full Campus Address" class="md:col-span-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="manager_name" placeholder="Branch Manager Name" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <select name="status" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </select>
                <div class="md:col-span-4">
                    <button type="submit" class="rounded-xl bg-indigo-600 text-white px-5 py-2 text-xs font-bold">+ Add Branch Campus</button>
                </div>
            </form>
            <div class="space-y-2.5">
                @foreach($branches as $br)
                    <details class="rounded-xl border border-slate-200 p-4">
                        <summary class="flex flex-wrap items-center justify-between gap-2 cursor-pointer list-none">
                            <div>
                                <p class="text-sm font-bold text-slate-900">
                                    {{ $br->name }}
                                    <span class="text-xs text-indigo-700 font-mono">({{ $br->code }})</span>
                                    <span class="ml-2 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase {{ $br->status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600' }}">{{ $br->status }}</span>
                                </p>
                                <p class="text-xs text-slate-500">{{ $br->city }} · {{ $br->address }} · Manager: {{ $br->manager_name ?? 'N/A' }}</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Edit Branch</span>
                                <form method="POST" action="{{ route('portal.branches.status', $br) }}" class="inline">
                                    @csrf @method('PATCH')
                                    <button type="submit" class="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold {{ $br->status === 'active' ? 'text-amber-700' : 'text-emerald-700' }}">
                                        {{ $br->status === 'active' ? 'Deactivate' : 'Activate' }}
                                    </button>
                                </form>
                                <form method="POST" action="{{ route('portal.branches.delete', $br) }}" class="inline">
                                    @csrf @method('DELETE')
                                    <button type="submit" class="rounded-lg bg-rose-50 text-rose-700 px-2.5 py-1 text-xs font-bold">Delete</button>
                                </form>
                            </div>
                        </summary>
                        <form method="POST" action="{{ route('portal.branches.update', $br) }}" class="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                            @csrf @method('PUT')
                            <input type="text" name="name" required value="{{ $br->name }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="text" name="code" required value="{{ $br->code }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs uppercase">
                            <input type="text" name="city" required value="{{ $br->city }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="text" name="address" required value="{{ $br->address }}" class="md:col-span-2 rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="text" name="phone" value="{{ $br->phone }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="text" name="manager_name" value="{{ $br->manager_name }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="number" name="active_students" value="{{ $br->active_students }}" min="0" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <select name="status" class="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">
                                <option value="active" @selected($br->status === 'active')>Active</option>
                                <option value="inactive" @selected($br->status === 'inactive')>Inactive</option>
                            </select>
                            <div class="md:col-span-3">
                                <button type="submit" class="rounded-xl bg-[#062436] text-white px-4 py-2 text-xs font-bold">Save Branch Update</button>
                            </div>
                        </form>
                    </details>
                @endforeach
            </div>
        </div>

        {{-- Dedicated Payment System & Gateways Studio (Separated from API Connectors) --}}
        <div id="payment-system-studio" class="rounded-2xl bg-white border border-slate-200 p-6 space-y-5">
            <div>
                <h2 class="text-lg font-extrabold text-slate-900">Dedicated Payment System & Gateways ({{ count($paymentGateways ?? []) }})</h2>
                <p class="text-xs text-slate-500">Manage bKash, Nagad, Rocket, SSLCommerz Card, and Manual/Branch Cash checkout options separately from external API connectors.</p>
            </div>
            <form method="POST" action="{{ route('portal.gateways.store') }}" class="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                @csrf
                <input type="text" name="name" required placeholder="Gateway Name (e.g. bKash Merchant)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <select name="provider_type" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <option value="mfs">MFS (bKash/Nagad/Rocket)</option>
                    <option value="online">Online Card / SSL</option>
                    <option value="manual">Manual Bank Transfer</option>
                    <option value="cash">Branch Cash</option>
                </select>
                <select name="mode" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <option value="sandbox">Sandbox</option>
                    <option value="live">Live Production</option>
                </select>
                <input type="text" name="merchant_account" required placeholder="Merchant Number / Account" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="number" name="fee_percent" step="0.1" min="0" max="25" value="0" placeholder="Fee %" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="password" name="api_key" placeholder="App Key / Secret (optional)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="instructions" placeholder="Student Checkout Instructions" class="md:col-span-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <div class="md:col-span-4 flex items-center justify-between">
                    <label class="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" name="active" value="1"> Activate Immediately</label>
                    <button type="submit" class="rounded-xl bg-indigo-600 text-white px-5 py-2 text-xs font-bold">+ Add Payment Gateway</button>
                </div>
            </form>
            <div class="space-y-2.5">
                @foreach($paymentGateways ?? [] as $gw)
                    <details class="rounded-xl border border-slate-200 p-4">
                        <summary class="flex flex-wrap items-center justify-between gap-2 cursor-pointer list-none">
                            <div>
                                <p class="text-sm font-bold text-slate-900">
                                    {{ $gw['name'] }}
                                    <span class="ml-2 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase {{ !empty($gw['active']) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600' }}">{{ !empty($gw['active']) ? 'Active' : 'Inactive' }}</span>
                                    <span class="ml-1 text-[11px] font-mono text-slate-500">{{ strtoupper($gw['mode'] ?? 'sandbox') }} · Fee {{ $gw['fee_percent'] ?? 0 }}%</span>
                                </p>
                                <p class="text-xs text-slate-500">Account: {{ $gw['merchant_account'] ?? '' }} · Key: {{ $gw['api_key_masked'] ?? 'Unconfigured' }}</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Edit Gateway</span>
                                <form method="POST" action="{{ route('portal.gateways.status', $gw['id']) }}" class="inline">
                                    @csrf @method('PATCH')
                                    <button type="submit" class="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold {{ !empty($gw['active']) ? 'text-amber-700' : 'text-emerald-700' }}">
                                        {{ !empty($gw['active']) ? 'Deactivate' : 'Activate' }}
                                    </button>
                                </form>
                                <form method="POST" action="{{ route('portal.gateways.delete', $gw['id']) }}" class="inline">
                                    @csrf @method('DELETE')
                                    <button type="submit" class="rounded-lg bg-rose-50 text-rose-700 px-2.5 py-1 text-xs font-bold">Delete</button>
                                </form>
                            </div>
                        </summary>
                        <form method="POST" action="{{ route('portal.gateways.update', $gw['id']) }}" class="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                            @csrf @method('PUT')
                            <input type="text" name="name" required value="{{ $gw['name'] }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <select name="provider_type" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                                @foreach(['mfs', 'online', 'manual', 'cash'] as $pt)
                                    <option value="{{ $pt }}" @selected(($gw['provider_type'] ?? 'online') === $pt)>{{ strtoupper($pt) }}</option>
                                @endforeach
                            </select>
                            <select name="mode" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                                <option value="sandbox" @selected(($gw['mode'] ?? '') === 'sandbox')>Sandbox</option>
                                <option value="live" @selected(($gw['mode'] ?? '') === 'live')>Live</option>
                            </select>
                            <input type="text" name="merchant_account" required value="{{ $gw['merchant_account'] ?? '' }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="number" name="fee_percent" step="0.1" value="{{ $gw['fee_percent'] ?? 0 }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="password" name="api_key" placeholder="Replace Secret Key (optional)" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="text" name="instructions" value="{{ $gw['instructions'] ?? '' }}" class="md:col-span-3 rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <div class="md:col-span-3">
                                <button type="submit" class="rounded-xl bg-[#062436] text-white px-4 py-2 text-xs font-bold">Update Payment Gateway</button>
                            </div>
                        </form>
                    </details>
                @endforeach
            </div>
        </div>

        {{-- Official API Connectors Studio (Configurable Endpoints, Keys, Active/Inactive, Soft-Delete) --}}
        <div id="api-connectors-studio" class="rounded-2xl bg-white border border-slate-200 p-6 space-y-5">
            <div>
                <h2 class="text-lg font-extrabold text-slate-900">API Connectors & Integrations ({{ count($apiConnectors ?? []) }})</h2>
                <p class="text-xs text-slate-500">External integrations stay inactive until configured with API keys & endpoints. Edit, activate/deactivate, or delete anytime.</p>
            </div>
            <form method="POST" action="{{ route('portal.connectors.store') }}" class="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                @csrf
                <input type="text" name="name" required placeholder="Connector Name (e.g. BulkSMS BD)" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="category" required value="SMS & Messaging" placeholder="Category" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <select name="environment" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                    <option value="sandbox">Sandbox</option>
                    <option value="production">Production</option>
                </select>
                <input type="url" name="endpoint_url" placeholder="API Endpoint URL" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs md:col-span-2">
                <input type="password" name="api_key" placeholder="API Key / Bearer Token" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs">
                <input type="text" name="description" placeholder="Short Purpose Description" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs md:col-span-2">
                <div class="flex items-center justify-between">
                    <label class="flex items-center gap-1.5 text-xs font-bold text-slate-700"><input type="checkbox" name="active" value="1"> Active</label>
                    <button type="submit" class="rounded-xl bg-indigo-600 text-white px-4 py-2 text-xs font-bold">+ Add API Connector</button>
                </div>
            </form>
            <div class="space-y-2.5">
                @foreach($apiConnectors ?? [] as $conn)
                    <details class="rounded-xl border border-slate-200 p-4">
                        <summary class="flex flex-wrap items-center justify-between gap-2 cursor-pointer list-none">
                            <div>
                                <p class="text-sm font-bold text-slate-900">
                                    {{ $conn['name'] }}
                                    <span class="ml-2 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase {{ !empty($conn['active']) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600' }}">{{ !empty($conn['active']) ? 'Active' : 'Inactive' }}</span>
                                    <span class="ml-1 text-[11px] text-slate-500">{{ $conn['category'] }} · {{ strtoupper($conn['environment'] ?? 'sandbox') }}</span>
                                </p>
                                <p class="text-xs text-slate-500 font-mono">Endpoint: {{ $conn['endpoint_url'] ?: 'Not set' }} · API Key: {{ $conn['api_key_masked'] ?? 'Not Configured' }}</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Edit API</span>
                                <form method="POST" action="{{ route('portal.connectors.status', $conn['id']) }}" class="inline">
                                    @csrf @method('PATCH')
                                    <button type="submit" class="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold {{ !empty($conn['active']) ? 'text-amber-700' : 'text-emerald-700' }}">
                                        {{ !empty($conn['active']) ? 'Deactivate' : 'Activate' }}
                                    </button>
                                </form>
                                <form method="POST" action="{{ route('portal.connectors.delete', $conn['id']) }}" class="inline">
                                    @csrf @method('DELETE')
                                    <button type="submit" class="rounded-lg bg-rose-50 text-rose-700 px-2.5 py-1 text-xs font-bold">Delete</button>
                                </form>
                            </div>
                        </summary>
                        <form method="POST" action="{{ route('portal.connectors.update', $conn['id']) }}" class="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                            @csrf @method('PUT')
                            <input type="text" name="name" required value="{{ $conn['name'] }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="text" name="category" required value="{{ $conn['category'] }}" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <select name="environment" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                                <option value="sandbox" @selected(($conn['environment'] ?? 'sandbox') === 'sandbox')>Sandbox</option>
                                <option value="production" @selected(($conn['environment'] ?? '') === 'production')>Production</option>
                            </select>
                            <input type="text" name="endpoint_url" value="{{ $conn['endpoint_url'] ?? '' }}" placeholder="Endpoint URL" class="md:col-span-2 rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="password" name="api_key" placeholder="Update API Key (optional)" class="rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <input type="text" name="description" value="{{ $conn['description'] ?? '' }}" class="md:col-span-3 rounded-xl border border-slate-300 px-3 py-2 text-xs">
                            <div class="md:col-span-3">
                                <button type="submit" class="rounded-xl bg-[#062436] text-white px-4 py-2 text-xs font-bold">Update API Connector</button>
                            </div>
                        </form>
                    </details>
                @endforeach
            </div>
        </div>
    @endif

    @if($user->role === 'student' && isset($reward))
        <div class="rounded-2xl bg-amber-50 border border-amber-200 p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
                <p class="text-xs font-bold uppercase text-amber-800">Learning Rewards & Streak</p>
                <p class="text-lg font-extrabold text-slate-900">{{ $reward->xp }} XP · {{ $reward->streak_days }}d Streak</p>
            </div>
            <form method="POST" action="{{ route('portal.rewards.privacy') }}">
                @csrf
                <button type="submit" class="rounded-xl bg-slate-900 text-white px-4 py-2 text-xs font-bold">
                    {{ $reward->show_on_leaderboard ? 'Leaderboard: Public (Click to Mask)' : 'Leaderboard: Masked (Click to Show)' }}
                </button>
            </form>
        </div>
    @endif

    @if($user->role === 'guardian')
        <div class="rounded-2xl bg-white border border-slate-200 p-6">
            <h2 class="text-lg font-extrabold mb-4">Linked Children Progress & Exam Results</h2>
            @foreach($children as $child)
                <div class="border rounded-xl p-4 mb-3">
                    <h3 class="font-bold">{{ $child->name }} ({{ $child->roll_number }})</h3>
                    <p class="text-xs text-slate-600 mt-1">Enrolled Courses: {{ $child->enrollments->count() }} | Exams Attempted: {{ $child->examAttempts->count() }}</p>
                </div>
            @endforeach
        </div>
    @endif
</div>
@endsection
