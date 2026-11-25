import { Image as ImageIcon, Loader2, Upload } from 'lucide-react';
import { useId, useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}

export function ImageUploadField({
  label,
  value,
  onChange,
  placeholder = '/uploads/... or https://...',
}: ImageUploadFieldProps) {
  const { apiFetch } = useAuth();
  const inputId = useId();
  const fileId = useId();
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(null);
    if (file.size > 5 * 1024 * 1024) {
      setErr('Image must be 5 MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read selected file.'));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ url: string }>('/api/portal/upload-image', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      onChange(res.url);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {value ? (
          <img
            src={value}
            alt={label}
            className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover bg-slate-50"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400">
            <ImageIcon className="h-4 w-4" />
          </div>
        )}
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
        />
        <label
          htmlFor={fileId}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 border border-sky-200 hover:bg-sky-100 shrink-0"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          <span>{uploading ? 'Uploading' : 'Upload'}</span>
          <input
            id={fileId}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>
      </div>
      {err && <p className="text-[11px] font-medium text-rose-600">{err}</p>}
    </div>
  );
}
