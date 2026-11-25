<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@yield('title', 'Aloms English Center')</title>
    <link rel="icon" type="image/png" href="{{ asset('images/aec-logo.png') }}">
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen flex flex-col">
    <header class="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-6">
            <a href="{{ route('home') }}" class="flex items-center gap-2.5 shrink-0">
                <span class="h-10 w-10 rounded-full bg-[#062436] p-1 flex items-center justify-center">
                    <img src="{{ asset('images/aec-logo.png') }}" alt="Aloms English Center" class="h-full w-full object-contain">
                </span>
                <span class="font-extrabold text-[#062436] text-lg">Aloms English Center</span>
            </a>
            @php
                $rawMenu = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'header_menu')->value('value');
                $headerMenu = $rawMenu ? (json_decode($rawMenu, true) ?: []) : [];
                if (empty($headerMenu)) {
                    $headerMenu = [
                        ['label' => 'Home', 'path' => route('home'), 'visible' => true],
                        ['label' => 'Courses', 'path' => route('courses.index'), 'visible' => true],
                        ['label' => 'Learn', 'path' => route('learn'), 'visible' => true],
                        ['label' => 'Instructors', 'path' => route('instructors'), 'visible' => true],
                        ['label' => 'Exams', 'path' => route('exams.index'), 'visible' => true],
                        ['label' => 'Products', 'path' => route('products'), 'visible' => true],
                        ['label' => 'E-Books', 'path' => route('ebooks'), 'visible' => true],
                        ['label' => 'Result', 'path' => route('results'), 'visible' => true],
                    ];
                }
            @endphp
            <nav class="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
                @foreach($headerMenu as $m)
                    @if(($m['visible'] ?? true) !== false)
                        <a href="{{ $m['path'] ?? '/' }}" class="inline-flex items-center gap-1 hover:text-sky-600">
                            <span>{{ $m['label'] ?? 'Link' }}</span>
                            @if(!empty($m['badge']))
                                <span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{{ $m['badge'] }}</span>
                            @endif
                        </a>
                    @endif
                @endforeach
            </nav>
            <div>
                @auth
                    <a href="{{ route('portal.index') }}" class="px-4 py-2 rounded-full bg-[#062436] text-white text-sm font-semibold">Unified Portal</a>
                @else
                    <a href="{{ route('login') }}" class="px-5 py-2 rounded-full bg-indigo-50 text-indigo-600 text-sm font-semibold">Login</a>
                @endauth
            </div>
        </div>
    </header>

    <main class="flex-1">
        @if(session('status'))
            <div class="max-w-7xl mx-auto px-4 mt-4">
                <div class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-800">{{ session('status') }}</div>
            </div>
        @endif
        @yield('content')
    </main>

    <footer class="bg-[#051d2b] text-slate-300 py-12 mt-16">
        <div class="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between gap-6 text-sm">
            <div>
                <p class="font-extrabold text-white text-base">Aloms English Center</p>
                <p class="text-slate-400 mt-1">House 42, Road 6/A, Avenue 8, Mirpur DOHS, Dhaka</p>
            </div>
            <p class="text-slate-400">© {{ date('Y') }} Aloms English Center. All Rights Reserved.</p>
        </div>
    </footer>
</body>
</html>
