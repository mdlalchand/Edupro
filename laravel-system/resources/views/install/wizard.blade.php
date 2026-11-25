<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Install — Aloms English Center</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#042133] min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-8">
        <div class="flex items-center gap-3 border-b border-slate-200 pb-4">
            <img src="{{ asset('images/aec-logo.png') }}" alt="AEC" class="h-12 w-12 rounded-full bg-[#062436] p-1 object-contain">
            <div>
                <h1 class="text-2xl font-extrabold text-slate-900">Aloms English Center — Ready-to-Install Setup</h1>
                <p class="text-xs text-slate-500">One-click database migration, seeder & Super Admin provisioning</p>
            </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 my-5 text-xs">
            @foreach($requirements as $label => $ok)
                <div class="rounded-lg p-2.5 text-center {{ $ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800' }}">
                    <p class="font-bold">{{ strtoupper(str_replace('_', ' ', $label)) }}</p>
                    <p>{{ $ok ? 'OK' : 'FAIL' }}</p>
                </div>
            @endforeach
        </div>

        @if($errors->any())
            <div class="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                {{ $errors->first() }}
            </div>
        @endif

        <form method="POST" action="{{ route('install.run') }}" class="space-y-4">
            @csrf
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" name="app_name" value="Aloms English Center" required class="rounded-xl border px-3 py-2 text-sm" placeholder="Site Name">
                <input type="url" name="app_url" value="{{ url('/') }}" required class="rounded-xl border px-3 py-2 text-sm" placeholder="App URL">
                <input type="text" name="db_host" value="127.0.0.1" required class="rounded-xl border px-3 py-2 text-sm" placeholder="DB Host">
                <input type="number" name="db_port" value="3306" required class="rounded-xl border px-3 py-2 text-sm" placeholder="DB Port">
                <input type="text" name="db_database" value="aloms_english_center" required class="rounded-xl border px-3 py-2 text-sm" placeholder="Database Name">
                <input type="text" name="db_username" value="root" required class="rounded-xl border px-3 py-2 text-sm" placeholder="Database User">
                <input type="password" name="db_password" class="rounded-xl border px-3 py-2 text-sm sm:col-span-2" placeholder="Database Password">
            </div>

            <hr class="my-4">
            <h2 class="text-sm font-extrabold text-slate-900">Super Admin Account</h2>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input type="text" name="admin_name" value="Alomgir Hossain" required class="rounded-xl border px-3 py-2 text-sm" placeholder="Admin Name">
                <input type="email" name="admin_email" value="admin@alomsenglish.com" required class="rounded-xl border px-3 py-2 text-sm" placeholder="Admin Email">
                <input type="password" name="admin_password" required minlength="8" class="rounded-xl border px-3 py-2 text-sm" placeholder="Password (8+ chars)">
            </div>

            <button type="submit" class="w-full rounded-xl bg-[#062436] text-white font-bold py-3 text-sm hover:bg-indigo-600">
                Install & Launch Aloms English Center
            </button>
        </form>
    </div>
</body>
</html>
