@extends('layouts.app')
@section('title', 'Products — Aloms English Center')
@section('content')
<div class="max-w-6xl mx-auto px-4 py-10">
    <h1 class="text-3xl font-extrabold">Products & Study Books</h1>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        @foreach($products as $p)
            <div class="bg-white rounded-2xl border p-5">
                <h2 class="font-extrabold">{{ $p->title }}</h2>
                <p class="text-sm text-slate-600 mt-1">{{ $p->description }}</p>
                <p class="text-lg font-extrabold text-indigo-700 mt-3">৳{{ $p->price }}</p>
            </div>
        @endforeach
    </div>
</div>
@endsection
