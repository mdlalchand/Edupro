@extends('layouts.app')
@section('title', 'E-Books — Aloms English Center')
@section('content')
<div class="max-w-6xl mx-auto px-4 py-10">
    <h1 class="text-3xl font-extrabold">E-Books Library</h1>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        @foreach($ebooks as $e)
            <div class="bg-white rounded-2xl border p-5">
                <h2 class="font-extrabold">{{ $e->title }}</h2>
                <p class="text-sm text-slate-600 mt-1">{{ $e->summary }}</p>
                <p class="text-sm font-bold text-emerald-700 mt-3">{{ $e->is_free ? 'Free' : '৳' . $e->price }}</p>
            </div>
        @endforeach
    </div>
</div>
@endsection
