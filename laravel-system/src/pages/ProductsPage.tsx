import { Search, ShoppingBag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export function ProductsPage() {
  const { bootstrap } = useAuth();
  const { addToCart } = useCart();
  const [selectedCategory, setSelectedCategory] = useState('All Products');
  const [search, setSearch] = useState('');

  const products = useMemo(
    () => (bootstrap?.products ?? []).filter((p) => p.active !== false),
    [bootstrap?.products]
  );

  const categories = useMemo(() => {
    const fromProducts = products.map((p) => p.category).filter(Boolean);
    const fromAdmin = (bootstrap?.categories ?? [])
      .filter((c) => c.type === 'product' && c.active)
      .map((c) => c.name);
    return ['All Products', ...Array.from(new Set(['Books', 'Study Kits', 'Merchandise', ...fromProducts, ...fromAdmin]))];
  }, [products, bootstrap?.categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'All Products' && p.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategory, search]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/90 via-slate-50 to-white pb-16 pt-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
              Home / Products · SHOP
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Books &amp; Study Store
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Printed grammar masterbooks, IELTS kits, and Aloms English Center study merchandise.
              Choose Home Delivery or Free Active-Branch Pickup.
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search books, kits..."
              aria-label="Search store products"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Category Filter Bar */}
        <div className="mt-6 flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
                selectedCategory === cat
                  ? 'bg-[#062436] text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
              No active products matched your filter.
            </div>
          ) : (
            filtered.map((prod) => {
              const savings = Math.max(0, prod.originalPrice - prod.price);
              const outOfStock = prod.stock <= 0;
              return (
                <div
                  key={prod.id}
                  className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
                >
                  <div>
                    <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                      <img
                        src={prod.image}
                        alt={prod.title}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      {savings > 0 && (
                        <span className="font-mono tabular-nums absolute left-3 top-3 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">
                          SAVE ৳{savings}
                        </span>
                      )}
                      {outOfStock && (
                        <span className="absolute right-3 top-3 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white">
                          STOCK OUT
                        </span>
                      )}
                    </div>
                    <div className="p-5">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <span>{prod.category}</span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {outOfStock ? '0 left' : `${prod.stock} in stock`}
                        </span>
                      </div>
                      <h2 className="mt-1 text-base font-extrabold text-slate-900">{prod.title}</h2>
                      <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">
                        {prod.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono tabular-nums text-lg font-extrabold text-slate-900">
                        ৳{prod.price}
                      </span>
                      {prod.originalPrice > prod.price && (
                        <span className="font-mono tabular-nums text-xs text-slate-400 line-through">
                          ৳{prod.originalPrice}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addToCart(prod)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#062436] px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <ShoppingBag className="h-3.5 w-3.5" />
                      <span>{outOfStock ? 'Unavailable' : 'Add to Cart'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
