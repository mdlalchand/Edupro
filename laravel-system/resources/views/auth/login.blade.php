@extends('layouts.app')
@section('title', 'Login — Aloms English Center')
@section('content')
<div class="max-w-md mx-auto px-4 py-14">
    <div class="bg-white rounded-2xl border border-slate-200 p-7 shadow-sm">
        <h1 class="text-2xl font-extrabold text-center text-slate-900">Sign In to Unified Portal</h1>
        @if($errors->any())
            <div class="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{{ $errors->first() }}</div>
        @endif
        <form method="POST" action="{{ route('login.post') }}" class="mt-5 space-y-4">
            @csrf
            <input type="email" name="email" required placeholder="Email Address" class="w-full rounded-xl border px-3.5 py-2.5 text-sm">
            <input type="password" name="password" required placeholder="Password" class="w-full rounded-xl border px-3.5 py-2.5 text-sm">
            <button type="submit" class="w-full rounded-xl bg-[#062436] text-white font-bold py-3 text-sm">Sign In</button>
        </form>
    </div>
</div>
@endsection
