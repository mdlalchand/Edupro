<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function showLogin()
    {
        $branches = Branch::where('status', 'active')->get();
        return view('auth.login', compact('branches'));
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        if (Auth::attempt($credentials, $request->boolean('remember'))) {
            $request->session()->regenerate();
            return redirect()->intended(route('portal.index'));
        }

        return back()->withErrors(['email' => 'Invalid email or password.'])->onlyInput('email');
    }

    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|unique:users,email',
            'phone' => 'required|string|max:30',
            'role' => 'required|in:student,guardian',
            'branch_id' => 'required|exists:branches,id',
            'student_roll_link' => 'nullable|string',
            'password' => 'required|string|min:6',
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'],
            'role' => $data['role'],
            'branch_id' => $data['branch_id'],
            'roll_number' => $data['role'] === 'student' ? 'AEC-2026-' . rand(200, 999) : null,
            'password' => Hash::make($data['password']),
        ]);

        if ($data['role'] === 'guardian' && !empty($data['student_roll_link'])) {
            $student = User::where('role', 'student')->where('roll_number', strtoupper($data['student_roll_link']))->first();
            if ($student) {
                DB::table('guardian_student')->insert([
                    'guardian_id' => $user->id,
                    'student_id' => $student->id,
                ]);
            }
        }

        Auth::login($user);
        $request->session()->regenerate();
        return redirect()->route('portal.index');
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return redirect()->route('home');
    }
}
