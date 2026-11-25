@extends('layouts.app')
@section('title', 'Instructors — Aloms English Center')
@section('content')
<div class="max-w-6xl mx-auto px-4 py-10">
    <h1 class="text-3xl font-extrabold text-center">Our Expert Instructors</h1>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        @foreach($teachers as $t)
            <div class="bg-white rounded-2xl border p-6 text-center">
                <h2 class="text-lg font-extrabold">{{ $t->name }}</h2>
                <p class="text-xs font-semibold text-sky-600 mt-1">{{ $t->branch->name ?? 'Main Campus' }}</p>
            </div>
        @endforeach
    </div>
</div>
@endsection
