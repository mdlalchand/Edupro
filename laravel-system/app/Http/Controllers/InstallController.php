<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use PDO;

class InstallController extends Controller
{
    public function index()
    {
        if (file_exists(storage_path('installed.lock'))) {
            return redirect()->route('home');
        }

        $requirements = [
            'php_version' => version_compare(PHP_VERSION, '8.2.0', '>='),
            'pdo_mysql' => extension_loaded('pdo_mysql'),
            'mbstring' => extension_loaded('mbstring'),
            'openssl' => extension_loaded('openssl'),
            'storage_writable' => is_writable(storage_path()),
        ];

        return view('install.wizard', compact('requirements'));
    }

    public function install(Request $request)
    {
        if (file_exists(storage_path('installed.lock'))) {
            return redirect()->route('home');
        }

        $data = $request->validate([
            'app_name' => 'required|string|max:120',
            'app_url' => 'required|url',
            'db_host' => 'required|string',
            'db_port' => 'required|numeric',
            'db_database' => 'required|string',
            'db_username' => 'required|string',
            'db_password' => 'nullable|string',
            'admin_name' => 'required|string|max:120',
            'admin_email' => 'required|email',
            'admin_password' => 'required|string|min:8',
        ]);

        try {
            $dsn = "mysql:host={$data['db_host']};port={$data['db_port']};dbname={$data['db_database']};charset=utf8mb4";
            new PDO($dsn, $data['db_username'], $data['db_password'] ?? '', [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
        } catch (\Throwable $e) {
            return back()->withInput()->withErrors(['db' => 'Database connection failed: ' . $e->getMessage()]);
        }

        $envContent = implode("\n", [
            'APP_NAME="' . addslashes($data['app_name']) . '"',
            'APP_ENV=production',
            'APP_KEY=base64:' . base64_encode(random_bytes(32)),
            'APP_DEBUG=false',
            'APP_URL=' . $data['app_url'],
            'DB_CONNECTION=mysql',
            'DB_HOST=' . $data['db_host'],
            'DB_PORT=' . $data['db_port'],
            'DB_DATABASE=' . $data['db_database'],
            'DB_USERNAME=' . $data['db_username'],
            'DB_PASSWORD="' . addslashes($data['db_password'] ?? '') . '"',
            'SESSION_DRIVER=database',
        ]);

        file_put_contents(base_path('.env'), $envContent);

        config([
            'database.connections.mysql.host' => $data['db_host'],
            'database.connections.mysql.port' => $data['db_port'],
            'database.connections.mysql.database' => $data['db_database'],
            'database.connections.mysql.username' => $data['db_username'],
            'database.connections.mysql.password' => $data['db_password'] ?? '',
        ]);
        DB::purge('mysql');

        Artisan::call('migrate:fresh', ['--force' => true, '--seed' => true]);

        User::create([
            'name' => $data['admin_name'],
            'email' => $data['admin_email'],
            'role' => 'admin',
            'password' => Hash::make($data['admin_password']),
        ]);

        file_put_contents(storage_path('installed.lock'), 'Installed at ' . now()->toIso8601String());

        return redirect()->route('login')->with('status', 'Aloms English Center installed successfully!');
    }
}
