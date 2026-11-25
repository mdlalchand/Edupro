@extends('layouts.app')
@section('title', 'Aloms English Center — Online & Branch English Learning Platform')
@section('content')
@php
    $slides = !empty($heroSlides) ? $heroSlides : [[
        'badge' => 'AEC 27',
        'title' => 'FINAL REVISION PREMIUM BATCH',
        'subtitle' => 'SSC & HSC English 1st + 2nd Paper (Complete Syllabus)',
        'cta_text' => 'See All Courses',
        'course_slug' => $courses->first()?->slug ?? '',
    ]];
    $cfg = $homepageConfig ?? [];
@endphp

<section class="bg-gradient-to-b from-[#042133] via-[#062d40] to-[#083c49] py-12 text-white">
    <div class="max-w-7xl mx-auto px-4">
        {{-- Interactive Hero Carousel --}}
        <div id="aec-hero-slider" class="relative rounded-2xl border border-white/15 bg-[#062436] text-center shadow-2xl overflow-hidden">
            @foreach($slides as $idx => $slide)
                <div class="aec-slide relative p-8 sm:p-12 {{ $idx === 0 ? 'block' : 'hidden' }}">
                    @if(!empty($slide['image']))
                        <img src="{{ \Illuminate\Support\Str::startsWith($slide['image'], ['http://', 'https://', '/']) ? $slide['image'] : asset($slide['image']) }}" alt="{{ $slide['title'] ?? 'Slide' }}" class="absolute inset-0 h-full w-full object-cover">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-[#062436]/75 to-slate-950/60"></div>
                    @endif
                    <div class="relative z-10">
                        <span class="inline-block rounded-lg bg-amber-500 text-slate-950 font-extrabold text-xs px-3 py-1">
                            {{ $slide['badge'] ?? 'AEC 27' }}
                        </span>
                        <h1 class="mt-3 text-3xl sm:text-5xl font-extrabold">{{ $slide['title'] ?? 'ALOMS ENGLISH CENTER' }}</h1>
                        <p class="mt-2 text-amber-300 font-semibold">{{ $slide['subtitle'] ?? '' }}</p>
                        <a href="{{ !empty($slide['course_slug']) ? route('courses.show', $slide['course_slug']) : route('courses.index') }}"
                           class="mt-6 inline-block rounded-full bg-white text-[#062436] font-bold px-6 py-2.5 text-sm">
                            {{ $slide['cta_text'] ?? 'See All Courses' }}
                        </a>
                    </div>
                </div>
            @endforeach

            @if(count($slides) > 1)
                <div class="mt-6 flex justify-center gap-2">
                    @foreach($slides as $idx => $slide)
                        <button type="button" onclick="aecShowSlide({{ $idx }})" class="h-2.5 w-6 rounded-full bg-white/40 hover:bg-white"></button>
                    @endforeach
                </div>
                <script>
                    function aecShowSlide(target) {
                        var slides = document.querySelectorAll('#aec-hero-slider .aec-slide');
                        slides.forEach(function(el, i) { el.classList.toggle('hidden', i !== target); });
                    }
                </script>
            @endif
        </div>

        {{-- Featured Batches + Stats Two-Column Cards --}}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-10">
            <div class="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-[#063f43] to-[#04282d] p-7 flex flex-col justify-between">
                <div>
                    <span class="inline-block rounded-full bg-emerald-500/15 border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-300">
                        {{ $cfg['featured_badge'] ?? 'Online & Branch Course' }}
                    </span>
                    <h2 class="mt-3 text-2xl font-extrabold">{{ $cfg['featured_title'] ?? 'Online Batches are ongoing!' }}</h2>
                    <p class="text-emerald-300 mt-1">{{ $cfg['featured_subtitle'] ?? 'Book your seat now!' }}</p>
                    <div class="mt-5 space-y-2.5">
                        @foreach($courses->take(2) as $hc)
                            <a href="{{ route('courses.show', $hc->slug) }}" class="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10">
                                <div>
                                    <p class="font-bold">{{ $hc->title }}</p>
                                    <p class="text-xs text-slate-300">{{ $hc->level_tag }} · ৳{{ number_format($hc->price) }}</p>
                                </div>
                                <span class="text-xs font-bold text-emerald-300">Explore →</span>
                            </a>
                        @endforeach
                    </div>
                </div>
                <a href="{{ route('courses.index') }}" class="mt-6 block text-center rounded-xl bg-emerald-500 text-slate-950 font-bold py-3 text-sm">
                    {{ $cfg['featured_cta'] ?? 'See All Courses' }}
                </a>
            </div>

            <div class="rounded-2xl border border-sky-400/20 bg-gradient-to-br from-[#0a2f50] to-[#062038] p-7 flex flex-col justify-between">
                <div>
                    <span class="inline-block rounded-full bg-sky-500/15 border border-sky-400/30 px-3 py-1 text-xs font-semibold text-sky-300">
                        {{ $cfg['stats_badge'] ?? 'Trusted Platform' }}
                    </span>
                    <h2 class="mt-3 text-2xl font-extrabold">{{ $cfg['stats_title'] ?? 'See the stats!' }}</h2>
                    <p class="text-sky-300 mt-1">{{ $cfg['stats_subtitle'] ?? 'The trust we are building!' }}</p>
                    <div class="grid grid-cols-2 gap-3 mt-5">
                        <div class="rounded-xl bg-white/5 p-4"><p class="text-2xl font-extrabold">{{ number_format($stats['students']) }}</p><p class="text-xs text-slate-300">Students</p></div>
                        <div class="rounded-xl bg-white/5 p-4"><p class="text-2xl font-extrabold">{{ number_format($stats['courses']) }}</p><p class="text-xs text-slate-300">Courses</p></div>
                        <div class="rounded-xl bg-white/5 p-4"><p class="text-2xl font-extrabold">{{ number_format($stats['teachers']) }}</p><p class="text-xs text-slate-300">Teachers</p></div>
                        <div class="rounded-xl bg-white/5 p-4"><p class="text-2xl font-extrabold">{{ number_format($stats['videos']) }}</p><p class="text-xs text-slate-300">Videos</p></div>
                    </div>
                </div>
                <a href="{{ route('courses.index') }}" class="mt-6 block text-center rounded-xl bg-sky-500 text-slate-950 font-bold py-3 text-sm">See All Courses</a>
            </div>
        </div>
    </div>
</section>

{{-- Course Highlights Section --}}
<section class="bg-white py-14">
    <div class="max-w-7xl mx-auto px-4">
        <div class="text-center max-w-2xl mx-auto">
            <h2 class="text-3xl font-extrabold text-[#062436]">{{ $cfg['paths_heading'] ?? 'Choose Your Learning Path' }}</h2>
            <p class="mt-2 text-sm text-slate-600">{{ $cfg['paths_subheading'] ?? 'Structured English programs across academic boards and IELTS.' }}</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
            @foreach($courses as $c)
                <a href="{{ route('courses.show', $c->slug) }}" class="rounded-2xl border border-slate-200 p-5 hover:border-sky-400 transition">
                    <p class="text-xs font-bold text-indigo-600">{{ $c->category }} · {{ $c->level_tag }}</p>
                    <h3 class="mt-1 text-base font-extrabold text-slate-900">{{ $c->title }}</h3>
                    <p class="mt-1 text-xs text-slate-600">{{ $c->subtitle }}</p>
                    <p class="mt-3 text-sm font-extrabold text-[#062436]">৳{{ number_format($c->price) }}</p>
                </a>
            @endforeach
        </div>
    </div>
</section>

{{-- Student Testimonials Section --}}
<section class="bg-slate-50 py-14">
    <div class="max-w-7xl mx-auto px-4">
        <div class="text-center">
            <p class="text-xs font-bold uppercase tracking-wider text-sky-600">Student Reviews</p>
            <h2 class="mt-1 text-3xl font-extrabold text-[#062436]">What Our Students Say</h2>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            @foreach($reviews ?? [] as $rev)
                <div class="rounded-2xl border border-slate-200 bg-white p-5">
                    <p class="text-xs font-bold text-amber-500">{{ str_repeat('★', $rev->rating) }}</p>
                    <p class="mt-2 text-xs text-slate-700 leading-relaxed">{{ $rev->text }}</p>
                    <p class="mt-3 text-xs font-extrabold text-slate-900">{{ $rev->name }}</p>
                    <p class="text-[11px] text-slate-500">{{ $rev->role_label }}</p>
                </div>
            @endforeach
        </div>
    </div>
</section>
@endsection
