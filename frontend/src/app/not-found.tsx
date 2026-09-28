import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono text-2xl font-bold">
          404
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Page Not Found</h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          The page or resource you are looking for doesn't exist or has been moved.
        </p>
        <div>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
