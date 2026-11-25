@extends('layouts.app')
@section('title', 'Results — Aloms English Center')
@section('content')
<div class="max-w-3xl mx-auto px-4 py-12">
    <h1 class="text-3xl font-extrabold text-center">Center & Board Results</h1>
    <form method="POST" action="{{ route('results.lookup') }}" class="mt-6 flex gap-3">
        @csrf
        <input type="text" name="roll" value="{{ $roll ?? 'AEC-2026-101' }}" required class="flex-1 rounded-xl border px-4 py-2.5 text-sm">
        <button type="submit" class="rounded-xl bg-[#062436] text-white font-bold px-6 py-2.5 text-sm">Search</button>
    </form>
    @if($record)
        <div class="mt-6 rounded-2xl bg-emerald-50 border border-emerald-200 p-6">
            <h2 class="text-xl font-extrabold">{{ $record->student_name }}</h2>
            <p class="text-sm text-slate-700">{{ $record->exam_name }} · Score: {{ $record->total_score }} · {{ $record->grade }} (Merit #{{ $record->merit_position }})</p>
        </div>
    @endif
</div>
@endsection
