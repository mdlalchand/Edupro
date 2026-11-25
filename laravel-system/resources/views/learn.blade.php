@extends('layouts.app')
@section('title', 'Classroom — Aloms English Center')
@section('content')
<div class="max-w-6xl mx-auto px-4 py-10 space-y-6">
    <div>
        <h1 class="text-3xl font-extrabold text-slate-900">AEC Live & Recorded Classroom</h1>
        <p class="text-sm text-slate-600 mt-1">Join live interactive classes, watch HD recorded replays, and open lecture sheets.</p>
    </div>
    @forelse($enrollments as $enr)
        <div class="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-lg font-extrabold text-slate-900">{{ $enr->course->title }}</h2>
                <span class="text-xs font-bold uppercase text-emerald-700">{{ $enr->course->lessons->count() }} Classes</span>
            </div>

            @if($enr->course->batches->count())
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    @foreach($enr->course->batches as $bat)
                        <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
                            <p class="font-extrabold text-slate-900">{{ $bat->name }} ({{ $bat->code }})</p>
                            <p class="text-slate-600 mt-0.5">{{ $bat->schedule }} · {{ $bat->mode }}</p>
                        </div>
                    @endforeach
                </div>
            @endif

            <div class="space-y-2.5">
                @foreach($enr->course->lessons as $l)
                    <div class="border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <span class="inline-block rounded px-2 py-0.5 text-[10px] font-extrabold uppercase {{ $l->lesson_type === 'live' ? 'bg-rose-50 text-rose-700' : ($l->lesson_type === 'lecture_sheet' ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-700') }}">
                                {{ str_replace('_', ' ', $l->lesson_type) }}
                            </span>
                            @if($l->batch)
                                <span class="inline-block rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 ml-1">{{ $l->batch->name }}</span>
                            @endif
                            <p class="text-sm font-bold text-slate-900 mt-1">{{ $l->title }}</p>
                            <p class="text-xs text-slate-500">{{ $l->module_name }} · {{ $l->duration }}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            @if($l->lesson_type === 'live' && $l->live_join_url && $l->live_status !== 'ended')
                                <a href="{{ $l->live_join_url }}" target="_blank" rel="noopener noreferrer" class="rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-bold">Join Live</a>
                            @endif
                            @if($l->lecture_sheet_url)
                                <a href="{{ $l->lecture_sheet_url }}" target="_blank" rel="noopener noreferrer" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700">PDF Sheet</a>
                            @endif
                        </div>
                    </div>
                @endforeach
            </div>
        </div>
    @empty
        <div class="rounded-2xl bg-white border p-8 text-center text-slate-600">
            Enroll in a course to access live classes, recorded lectures, and PDF sheets.
        </div>
    @endforelse
</div>
@endsection
