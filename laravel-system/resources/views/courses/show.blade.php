@extends('layouts.app')
@section('title', $course->title)
@section('content')
<div class="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
    <div class="lg:col-span-8 bg-white rounded-2xl border p-6 space-y-6">
        <div>
            <h1 class="text-2xl font-extrabold">{{ $course->title }}</h1>
            <p class="text-sm text-slate-600 mt-2">{{ $course->description }}</p>
        </div>

        @if($course->batches->count())
            <div>
                <h2 class="text-base font-extrabold">Active Batches & Schedules ({{ $course->batches->count() }})</h2>
                <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    @foreach($course->batches as $bat)
                        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-indigo-700">{{ $bat->code }}</span>
                                <span class="uppercase font-bold text-emerald-700">{{ $bat->status }}</span>
                            </div>
                            <p class="font-extrabold text-sm text-slate-900 mt-1">{{ $bat->name }}</p>
                            <p class="text-slate-600 mt-1">{{ $bat->schedule }} · {{ $bat->mode }}</p>
                            <p class="text-slate-500 mt-0.5">{{ max(0, $bat->seat_limit - $bat->enrolled_seats) }} seats available</p>
                        </div>
                    @endforeach
                </div>
            </div>
        @endif

        <div>
            <h2 class="text-base font-extrabold">Curriculum ({{ $course->lessons->count() }} Lectures & Videos)</h2>
            <div class="mt-3 space-y-2">
                @foreach($course->lessons as $l)
                    <div class="border rounded-xl p-3 text-sm flex items-center justify-between gap-2">
                        <div>
                            <span class="inline-block rounded px-2 py-0.5 text-[10px] font-extrabold uppercase bg-sky-50 text-sky-700 mr-1.5">{{ str_replace('_', ' ', $l->lesson_type) }}</span>
                            <span class="font-semibold">{{ $l->title }}</span>
                            <span class="text-xs text-slate-500 ml-1">({{ $l->duration }})</span>
                        </div>
                        @if($l->is_free_preview)
                            <span class="text-xs font-bold text-emerald-700">Free Preview</span>
                        @endif
                    </div>
                @endforeach
            </div>
        </div>
    </div>
    <div class="lg:col-span-4 bg-white rounded-2xl border p-6 h-fit">
        <p class="text-3xl font-extrabold text-indigo-600">৳{{ $course->price }}</p>
        <form method="POST" action="{{ route('courses.enroll', $course) }}" class="mt-4 space-y-3">
            @csrf
            <select name="branch_id" class="w-full rounded-xl border px-3 py-2 text-sm">
                @foreach($branches as $b)
                    <option value="{{ $b->id }}">{{ $b->name }}</option>
                @endforeach
            </select>
            <select name="payment_method" class="w-full rounded-xl border px-3 py-2 text-sm">
                @forelse($activeGateways ?? [] as $gw)
                    <option value="{{ $gw['name'] }}">{{ $gw['name'] }} ({{ strtoupper($gw['provider_type'] ?? 'online') }})</option>
                @empty
                    <option value="" disabled>No Active Payment Gateways Configured</option>
                @endforelse
            </select>
            <input type="text" name="coupon_code" placeholder="Coupon Code (AEC20)" class="w-full rounded-xl border px-3 py-2 text-sm">
            <button type="submit" class="w-full rounded-xl bg-indigo-600 text-white font-bold py-3 text-sm">Enroll Now</button>
        </form>
    </div>
</div>
@endsection
