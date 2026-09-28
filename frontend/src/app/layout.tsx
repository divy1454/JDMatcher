import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/authContext';

export const metadata: Metadata = {
  title: 'JDMatcher Enterprise - B2B IT Bench Sales Intelligence',
  description: 'High-performance AI candidate-to-JD evaluation platform for US IT bench sales and staffing agencies.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/favicon.ico',
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased min-h-screen bg-slate-950 text-slate-50 selection:bg-indigo-500 selection:text-white">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
