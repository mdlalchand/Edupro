<?php

namespace Database\Seeders;

use App\Models\Batch;
use App\Models\Branch;
use App\Models\CenterResult;
use App\Models\Coupon;
use App\Models\Course;
use App\Models\Ebook;
use App\Models\Enrollment;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\Lesson;
use App\Models\Product;
use App\Models\Review;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $mirpur = Branch::create([
            'name' => 'Mirpur DOHS Main Campus',
            'code' => 'AEC-MPR',
            'city' => 'Dhaka',
            'address' => 'House 42, Road 6/A, Avenue 8, Mirpur DOHS, Dhaka',
            'phone' => '09617331133',
            'manager_name' => 'Tariqul Islam',
            'active_students' => 1420,
        ]);

        $uttara = Branch::create([
            'name' => 'Uttara Sector 7 Campus',
            'code' => 'AEC-UTR',
            'city' => 'Dhaka',
            'address' => 'Level 4, Plot 18, Road 12, Sector 7, Uttara, Dhaka',
            'phone' => '01711002233',
            'manager_name' => 'Nusrat Jahan',
            'active_students' => 980,
        ]);

        $manager = User::create([
            'name' => 'Tariqul Islam',
            'email' => 'manager@alomsenglish.com',
            'phone' => '01710000002',
            'role' => 'branch_manager',
            'branch_id' => $mirpur->id,
            'password' => Hash::make('Aloms@2026'),
        ]);

        $teacher = User::create([
            'name' => 'Mahmudul Hasan',
            'email' => 'teacher@alomsenglish.com',
            'phone' => '01710000003',
            'role' => 'teacher',
            'branch_id' => $mirpur->id,
            'password' => Hash::make('Aloms@2026'),
        ]);

        $student = User::create([
            'name' => 'Arafat Rahman',
            'email' => 'student@alomsenglish.com',
            'phone' => '01710000004',
            'role' => 'student',
            'branch_id' => $mirpur->id,
            'roll_number' => 'AEC-2026-101',
            'password' => Hash::make('Aloms@2026'),
        ]);

        $guardian = User::create([
            'name' => 'Kamrul Hasan',
            'email' => 'guardian@alomsenglish.com',
            'phone' => '01710000005',
            'role' => 'guardian',
            'branch_id' => $mirpur->id,
            'password' => Hash::make('Aloms@2026'),
        ]);

        DB::table('guardian_student')->insert([
            'guardian_id' => $guardian->id,
            'student_id' => $student->id,
        ]);

        $sscCourse = Course::create([
            'slug' => 'ssc-english-final-revision',
            'title' => 'Final Revision Premium Batch for SSC-27 (English 1st & 2nd)',
            'subtitle' => 'Complete SSC Board Grammar, Writing & CQ/MCQ Mastery',
            'category' => 'SSC English',
            'level_tag' => 'SSC 27',
            'is_combo' => false,
            'price' => 2490,
            'original_price' => 3800,
            'enrolled_count' => 8920,
            'description' => 'Complete syllabus coverage for SSC English 1st and 2nd Paper with weekly MCQ exams and printable sheets.',
            'demo_video_title' => 'SSC English 2nd Paper: Completing Sentence Tricks',
        ]);

        $hscCombo = Course::create([
            'slug' => 'hsc-english-complete-combo',
            'title' => 'HSC 27-28 English 1st & 2nd Paper + Spoken Combo',
            'subtitle' => 'All-in-One Academic & Fluency Bundle for College Students',
            'category' => 'Combo Packs',
            'level_tag' => 'HSC 27',
            'is_combo' => true,
            'included_courses' => ['HSC 1st Paper Mastery', 'HSC 2nd Paper Grammar Pro', 'Freehand Writing Lab'],
            'price' => 3490,
            'original_price' => 5200,
            'enrolled_count' => 6410,
            'description' => 'Complete academic and spoken English combo bundle for HSC learners.',
            'demo_video_title' => 'HSC Modifiers & Connectors in 20 Minutes',
        ]);

        $batchMirpur = Batch::create([
            'course_id' => $sscCourse->id,
            'name' => 'SSC-27 Mirpur Morning Batch A',
            'code' => 'SSC-27-MPR-01',
            'branch_id' => $mirpur->id,
            'instructor_name' => 'Alomgir Hossain',
            'schedule' => 'Sat · Mon · Wed (4:00 PM)',
            'start_date' => '2026-04-20',
            'seat_limit' => 80,
            'enrolled_seats' => 64,
            'mode' => 'Hybrid',
            'status' => 'open',
        ]);

        $batchOnline = Batch::create([
            'course_id' => $sscCourse->id,
            'name' => 'SSC-27 Online Live Evening Batch',
            'code' => 'SSC-27-ONL-02',
            'branch_id' => $mirpur->id,
            'instructor_name' => 'Nadia Sultana',
            'schedule' => 'Sun · Tue · Thu (8:00 PM)',
            'start_date' => '2026-04-25',
            'seat_limit' => 250,
            'enrolled_seats' => 190,
            'mode' => 'Online Live',
            'status' => 'running',
        ]);

        Lesson::create([
            'course_id' => $sscCourse->id,
            'batch_id' => $batchMirpur->id,
            'lesson_type' => 'recorded',
            'title' => '01. Right Form of Verbs — 12 Golden Board Rules',
            'module_name' => 'Module 1: Core Grammar',
            'duration' => '42:15',
            'video_url' => 'https://www.youtube.com/embed/M7lc1UVf-VE',
            'sheet_summary' => 'Subject-verb agreement, conditionals, and board question drills.',
            'is_free_preview' => true,
            'order_index' => 1,
        ]);

        Lesson::create([
            'course_id' => $sscCourse->id,
            'batch_id' => $batchOnline->id,
            'lesson_type' => 'live',
            'title' => '02. Live Q&A — Transformation & Modifiers Marathon',
            'module_name' => 'Module 1: Core Grammar',
            'duration' => '60:00 Live',
            'live_join_url' => 'https://zoom.us/j/98541236000',
            'live_status' => 'live_now',
            'scheduled_at' => 'Today · 8:00 PM BST',
            'sheet_summary' => 'Interactive Zoom session solving Dhaka & Rajshahi Board 2025 questions.',
            'is_free_preview' => true,
            'order_index' => 2,
        ]);

        Lesson::create([
            'course_id' => $sscCourse->id,
            'batch_id' => $batchMirpur->id,
            'lesson_type' => 'lecture_sheet',
            'title' => '03. SSC-27 Board Suggestion & Grammar Formula Sheet (PDF)',
            'module_name' => 'Module 2: Exam Pack',
            'duration' => 'PDF · 24 Pages',
            'lecture_sheet_url' => '/downloads/aloms-english-center-laravel.zip',
            'sheet_summary' => 'Printable board suggestion and grammar rules pack.',
            'is_free_preview' => false,
            'order_index' => 3,
        ]);

        Enrollment::create([
            'user_id' => $student->id,
            'course_id' => $sscCourse->id,
            'branch_id' => $mirpur->id,
            'payment_method' => 'bKash',
            'amount_paid' => 2490,
            'status' => 'approved',
            'completed_lesson_ids' => [1],
        ]);

        $exam = Exam::create([
            'title' => 'SSC English Grammar Diagnostic Quiz',
            'course_id' => $sscCourse->id,
            'category' => 'SSC English',
            'duration_minutes' => 10,
            'visibility' => 'public',
            'teacher_id' => $teacher->id,
        ]);

        ExamQuestion::create([
            'exam_id' => $exam->id,
            'prompt' => 'It is high time we _____ our study habits before the board exam.',
            'options' => ['change', 'changed', 'changing', 'will change'],
            'correct_index' => 1,
            'explanation' => 'It is high time + subject takes past simple (V2).',
            'marks' => 2,
        ]);

        Product::create([
            'title' => 'AEC English Grammar Masterbook',
            'category' => 'Books',
            'price' => 490,
            'original_price' => 690,
            'stock' => 120,
            'description' => '420-page hardcover grammar & writing manual.',
        ]);

        Ebook::create([
            'title' => 'SSC 2026-27 English 2nd Paper Final Suggestion',
            'level' => 'SSC 27',
            'is_free' => true,
            'price' => 0,
            'original_price' => 0,
            'author' => 'Alomgir Hossain',
            'pages_count' => 48,
            'summary' => 'Paragraph, Formal Letter, Email, Composition & Grammar Suggestion.',
        ]);

        Coupon::create(['code' => 'AEC20', 'discount_percent' => 20, 'active' => true]);

        CenterResult::create([
            'roll_number' => 'AEC-2026-101',
            'student_name' => 'Arafat Rahman',
            'batch_name' => 'SSC-27 Final Revision Batch',
            'branch_name' => $mirpur->name,
            'exam_name' => 'Grand English Model Test 01',
            'mcq_score' => 28,
            'written_score' => 64,
            'total_score' => 92,
            'grade' => 'A+ (5.00)',
            'merit_position' => 3,
        ]);

        $reviewsSeed = [
            ['name' => 'Tasannun Tarin', 'role_label' => 'Verified Student · SSC Batch', 'text' => 'Aloms English Center grammar rules help me solve board questions effortlessly.', 'rating' => 5, 'row' => 1],
            ['name' => 'Shamim Shohan', 'role_label' => 'Verified Student · HSC 27', 'text' => 'Scored 56+ out of 60 in English 2nd Paper after finishing the Modifiers & Connectors batch.', 'rating' => 5, 'row' => 1],
            ['name' => 'Borhan Uddin', 'role_label' => 'Verified Student · IELTS', 'text' => 'Improved from Band 5.5 to 7.5 in IELTS Writing Task 2 with personal feedback.', 'rating' => 5, 'row' => 2],
            ['name' => 'Kamrul Hasan', 'role_label' => 'Guardian · Mirpur Branch', 'text' => 'From the Guardian Portal I track my son attendance, marks, and monthly fees clearly.', 'rating' => 5, 'row' => 2],
        ];
        foreach ($reviewsSeed as $rev) {
            Review::create($rev);
        }

        $defaultSlides = [
            [
                'badge' => 'AEC 27',
                'title' => 'FINAL REVISION PREMIUM BATCH',
                'subtitle' => 'SSC & HSC English 1st + 2nd Paper (Complete Syllabus)',
                'cta_text' => 'Explore SSC Batch',
                'course_slug' => 'ssc-english-final-revision',
            ],
            [
                'badge' => 'HSC 27-28',
                'title' => 'ENGLISH BASIC TO PRO COMBO',
                'subtitle' => 'Grammar, Freehand Writing & Weekly Board Exams',
                'cta_text' => 'Join HSC Combo',
                'course_slug' => 'hsc-english-complete-combo',
            ],
        ];

        $defaultConfig = [
            'featured_badge' => 'Online & Branch Course',
            'featured_title' => 'Online Batches are ongoing!',
            'featured_subtitle' => 'Book your seat now!',
            'featured_cta' => 'See All Courses',
            'stats_mode' => 'auto',
            'stats_badge' => 'Trusted Platform',
            'stats_title' => 'See the stats!',
            'stats_subtitle' => 'The trust we are building!',
            'custom_students' => 340241,
            'custom_courses' => 70,
            'custom_teachers' => 30,
            'custom_videos' => 6476,
            'paths_heading' => 'Choose Your Learning Path',
            'paths_subheading' => 'Discover structured English programs across academic boards, university admission, spoken fluency, and IELTS mastery.',
        ];

        DB::table('settings')->updateOrInsert(['key' => 'homepage_slides'], ['value' => json_encode($defaultSlides)]);
        DB::table('settings')->updateOrInsert(['key' => 'homepage_config'], ['value' => json_encode($defaultConfig)]);
    }
}
