@extends('layouts.app')
@section('title', 'Online Exams — Aloms English Center')
@section('content')
<div class="max-w-5xl mx-auto px-4 py-10 space-y-6">
    <h1 class="text-3xl font-extrabold">Online MCQ Exams</h1>
    @foreach($exams as $ex)
        <form method="POST" action="{{ route('exams.submit', $ex) }}" class="bg-white rounded-2xl border p-6 space-y-4">
            @csrf
            <h2 class="text-lg font-extrabold">{{ $ex->title }}</h2>
            @foreach($ex->questions as $q)
                <div class="border rounded-xl p-4">
                    <p class="font-bold text-sm">{{ $q->prompt }}</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        @foreach($q->options as $idx => $opt)
                            <label class="flex items-center gap-2 text-sm">
                                <input type="radio" name="answers[{{ $q->id }}]" value="{{ $idx }}">
                                <span>{{ $opt }}</span>
                            </label>
                        @endforeach
                    </div>
                </div>
            @endforeach
            <button type="submit" class="rounded-xl bg-[#062436] text-white font-bold px-5 py-2.5 text-sm">Submit Exam</button>
        </form>
    @endforeach
</div>
@endsection
