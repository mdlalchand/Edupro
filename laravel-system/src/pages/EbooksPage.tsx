import { BookOpen, CheckCircle2, FileDown, Lock, Search, ShoppingBag, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FourStepPaymentModal } from '../components/FourStepPaymentModal';
import { useAuth } from '../context/AuthContext';
import { canClaimEbookFree } from '../lib/domain';
import type { Ebook } from '../types';

interface EbooksPageProps {
  navigate: (path: string) => void;
}

export function EbooksPage({ navigate }: EbooksPageProps) {
  const { user, bootstrap, apiFetch, refreshBootstrap } = useAuth();
  const [levelFilter, setLevelFilter] = useState<string>('All E-Books');
  const [priceFilter, setPriceFilter] = useState<'All' | 'Free' | 'Premium' | 'My E-Books'>(
    'All'
  );
  const [search, setSearch] = useState('');
  const [claimedIds, setClaimedIds] = useState<string[]>([]);
  const [readingBook, setReadingBook] = useState<Ebook | null>(null);
  const [checkoutBook, setCheckoutBook] = useState<Ebook | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadOwned = useCallback(async () => {
    if (!user) {
      setClaimedIds([]);
      return;
    }
    try {
      const res = await apiFetch<{ claimedEbookIds: string[] }>('/api/enrollments/my');
      setClaimedIds(res.claimedEbookIds);
    } catch {
      // ignore if session unavailable
    }
  }, [user, apiFetch]);

  useEffect(() => {
    void loadOwned();
  }, [loadOwned]);

  const ebooks = bootstrap?.ebooks ?? [];
  const levels = useMemo(() => {
    const base = ['All E-Books', 'HSC 27', 'SSC 27', 'IELTS', 'Class 9'];
    const dynamic = ebooks.map((e) => e.level).filter(Boolean);
    const catDynamic = (bootstrap?.categories ?? [])
      .filter((c) => c.type === 'ebook' && c.active)
      .map((c) => c.name);
    return Array.from(new Set([...base, ...dynamic, ...catDynamic]));
  }, [ebooks, bootstrap?.categories]);

  const filtered = ebooks.filter((eb) => {
    if (
      levelFilter !== 'All E-Books' &&
      eb.level !== levelFilter &&
      eb.category !== levelFilter
    ) {
      return false;
    }
    const isFree = canClaimEbookFree(eb);
    if (priceFilter === 'Free' && !isFree) return false;
    if (priceFilter === 'Premium' && isFree) return false;
    if (priceFilter === 'My E-Books' && !claimedIds.includes(eb.id)) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      return (
        eb.title.toLowerCase().includes(q) ||
        eb.author.toLowerCase().includes(q) ||
        eb.summary.toLowerCase().includes(q) ||
        eb.level.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleAction = async (book: Ebook) => {
    setErrorMsg(null);
    setStatusNotice(null);
    if (claimedIds.includes(book.id)) {
      setReadingBook(book);
      return;
    }
    if (!user) {
      navigate('/login');
      return;
    }
    if (!canClaimEbookFree(book)) {
      setCheckoutBook(book);
      return;
    }
    try {
      const res = await apiFetch<{ claimedEbookIds: string[] }>('/api/ebooks/claim', {
        method: 'POST',
        body: JSON.stringify({ ebookId: book.id }),
      });
      setClaimedIds(res.claimedEbookIds);
      setReadingBook(book);
      setStatusNotice(`Unlocked "${book.title}" in your digital library.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to claim E-Book.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/90 via-slate-50 to-white pb-16 pt-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Digital E-Books &amp; PDF Library
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Concise bilingual grammar short-notes, board suggestions, and IELTS speaking guides with instant PDF access.
          </p>

          <div className="mx-auto mt-5 max-w-md relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search E-Book title, author, HSC/IELTS..."
              aria-label="Search e-books"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Level & Category Tabs */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {levels.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
                  levelFilter === lvl
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Price / Owned Filter */}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {(['All', 'Free', 'Premium', 'My E-Books'] as const).map((pf) => (
              <button
                key={pf}
                type="button"
                onClick={() => setPriceFilter(pf)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  priceFilter === pf
                    ? 'bg-[#062436] text-white'
                    : 'bg-slate-200/70 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {pf}
              </button>
            ))}
          </div>
        </div>

        {statusNotice && (
          <div className="mx-auto mt-6 flex max-w-3xl items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{statusNotice}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
            {errorMsg}
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              No E-Books matched your current filter.
            </div>
          ) : (
            filtered.map((book) => {
              const owned = claimedIds.includes(book.id);
              const isFree = canClaimEbookFree(book);
              const discountPct =
                !isFree && book.originalPrice > book.price
                  ? Math.round(((book.originalPrice - book.price) / book.originalPrice) * 100)
                  : 0;
              return (
                <div
                  key={book.id}
                  className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
                >
                  <div>
                    {book.coverImage && (
                      <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
                        <img
                          src={book.coverImage}
                          alt={book.title}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span
                          className={`absolute left-3 top-3 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase ${
                            owned
                              ? 'bg-emerald-600 text-white'
                              : isFree
                                ? 'bg-emerald-600 text-white'
                                : 'bg-indigo-600 text-white'
                          }`}
                        >
                          {owned ? 'UNLOCKED' : isFree ? 'FREE PDF' : discountPct > 0 ? `-${discountPct}% OFF` : 'PREMIUM PDF'}
                        </span>
                      </div>
                    )}
                    <div className="p-6">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-indigo-700">
                          {book.category || book.level}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {book.level} · {book.pagesCount} pages
                        </span>
                      </div>

                      <h2 className="mt-2.5 text-lg font-extrabold text-slate-900">{book.title}</h2>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        By {book.author}
                        {(book.salesCount ?? 0) > 0 ? ` · ${book.salesCount} readers` : ''}
                      </p>
                      <p className="mt-3 text-sm leading-relaxed text-slate-600">{book.summary}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
                    <div>
                      {isFree ? (
                        <span className="text-base font-extrabold text-emerald-700">Free</span>
                      ) : (
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono tabular-nums text-lg font-extrabold text-indigo-700">
                            ৳{book.price}
                          </span>
                          {book.originalPrice > book.price && (
                            <span className="font-mono tabular-nums text-xs text-slate-400 line-through">
                              ৳{book.originalPrice}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAction(book)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition-colors ${
                        owned
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : isFree
                            ? 'bg-[#062436] hover:bg-indigo-600'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      {owned ? (
                        <BookOpen className="h-3.5 w-3.5" />
                      ) : isFree ? (
                        <BookOpen className="h-3.5 w-3.5" />
                      ) : (
                        <ShoppingBag className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {owned
                          ? 'Read & PDF'
                          : isFree
                            ? 'Get Free'
                            : `Buy E-Book · ৳${book.price}`}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Paid E-Book 4-Step Checkout */}
      {checkoutBook && (
        <FourStepPaymentModal
          open={Boolean(checkoutBook)}
          onClose={() => setCheckoutBook(null)}
          referenceType="ebook"
          itemTitle={checkoutBook.title}
          baseAmount={checkoutBook.price}
          ebookId={checkoutBook.id}
          onSuccess={async ({ transaction }) => {
            await Promise.all([loadOwned(), refreshBootstrap()]);
            if (transaction.status === 'completed') {
              setStatusNotice(
                `Payment verified (${transaction.invoiceNo})! "${checkoutBook.title}" is now unlocked in your library.`
              );
              setReadingBook(checkoutBook);
            } else {
              setStatusNotice(
                `Invoice ${transaction.invoiceNo} submitted for verification. "${checkoutBook.title}" will unlock automatically once approved.`
              );
            }
            setCheckoutBook(null);
          }}
        />
      )}

      {/* E-Book Reader & PDF Download Modal */}
      {readingBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div
            role="dialog"
            aria-label={readingBook.title}
            className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-sky-600">
                  {readingBook.level} Digital &amp; PDF Reader
                </span>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                  {readingBook.title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  By {readingBook.author} · {readingBook.pagesCount} pages
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReadingBook(null)}
                aria-label="Close e-book reader"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {readingBook.pdfUrl ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div>
                  <p className="text-xs font-extrabold text-emerald-900">Full PDF Edition Ready</p>
                  <p className="text-[11px] text-emerald-700">
                    Download or open the complete printable PDF file directly.
                  </p>
                </div>
                <a
                  href={readingBook.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <FileDown className="h-4 w-4" />
                  <span>Open / Download PDF</span>
                </a>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <Lock className="h-3.5 w-3.5 text-indigo-600" />
                <span>Interactive browser reader chapters unlocked below.</span>
              </div>
            )}

            <div className="mt-5 space-y-4">
              {readingBook.sampleContent.map((para, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800"
                >
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                    Section {idx + 1}
                  </p>
                  {para}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
