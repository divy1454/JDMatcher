'use client';

import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Printer,
  Download,
  Check,
  Copy,
  QrCode,
  ShieldCheck,
  Building2,
  Calendar,
  CreditCard,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

export interface InvoiceDetails {
  id: string;
  invoiceNumber: string;
  billingMonth: string;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  dueDate: string;
  status: 'draft' | 'pending' | 'generated' | 'paid' | 'overdue' | 'void';
  isGenerated: boolean;
  totalEvaluations: number;
  totalTokens: number;
  subtotalUsd: number;
  taxUsd: number;
  totalAmountUsd: number;
  exchangeRateInr: number;
  totalAmountInr: number;
  upiId: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  lineItems: Array<{
    id: string;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    unitPriceUsd: number;
    totalUsd: number;
  }>;
  notes?: string | null;
  paidAt?: string | null;
  organizationName?: string;
  organizationSlug?: string;
}

interface BusinessInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: InvoiceDetails | null;
}

export function BusinessInvoiceModal({ isOpen, onClose, invoice }: BusinessInvoiceModalProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  // Generate UPI QR Code whenever invoice data updates
  useEffect(() => {
    if (!invoice) return;

    const upiId = invoice.upiId || '8999911999-2@ybl';
    const payeeName = invoice.ownerName || 'Divy Patel';
    const amountInr = (invoice.totalAmountInr || 0).toFixed(2);
    const invoiceNumber = invoice.invoiceNumber || 'INV-001';

    // Standard NPCI / UPI Deep Link URI
    // When scanned by GPay, PhonePe, Paytm, BHIM, it auto-fills UPI ID, Name, Amount, and Note!
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amountInr)}&cu=INR&tn=${encodeURIComponent('JDMatcher Invoice ' + invoiceNumber)}`;

    QRCode.toDataURL(upiUri, {
      width: 260,
      margin: 2,
      color: {
        dark: '#0f172a', // Deep slate for razor sharp contrast
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error('Failed to generate UPI QR code:', err));
  }, [invoice]);

  if (!isOpen || !invoice) return null;

  const isPaid = invoice.status === 'paid';
  const amountInr = (invoice.totalAmountInr || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(invoice.upiId || '8999911999-2@ybl');
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleCopyAmount = () => {
    navigator.clipboard.writeText((invoice.totalAmountInr || 0).toFixed(2));
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const upiDeepLink = `upi://pay?pa=${encodeURIComponent(invoice.upiId || '8999911999-2@ybl')}&pn=${encodeURIComponent(invoice.ownerName || 'Divy Patel')}&am=${encodeURIComponent((invoice.totalAmountInr || 0).toFixed(2))}&cu=INR&tn=${encodeURIComponent('JDMatcher Invoice ' + invoice.invoiceNumber)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-md print:p-0 print:bg-white">
      {/* Container */}
      <div className="relative my-8 flex w-full max-w-4xl flex-col rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl print:border-none print:shadow-none print:my-0 print:max-w-none print:bg-white">
        
        {/* Action Header Bar (Hidden in Print) */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 print:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Business Tax Invoice • {invoice.invoiceNumber}
            </h2>
            <span className="ml-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-violet-300">
              UPI Integrated
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500 transition active:scale-95"
            >
              <Printer className="h-4 w-4" />
              <span>Print / Save as PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition active:scale-95 shadow-sm"
              title="Close Invoice"
            >
              <X className="h-4 w-4" />
              <span>Close Invoice</span>
            </button>
          </div>
        </div>

        {/* Printable Invoice Document Body */}
        <div
          ref={invoiceRef}
          id="printable-invoice"
          className="p-8 sm:p-12 text-slate-900 bg-white rounded-b-3xl print:rounded-none print:p-10 font-sans"
        >
          {/* Header Row: Brand & Invoice Meta */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between border-b border-slate-200 pb-8 gap-6">
            <div>
              {/* Brand Logo & Name */}
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 text-white font-black text-xl shadow-md">
                  JD
                </div>
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-slate-900 leading-none">
                    JDMatcher <span className="text-violet-600">Enterprise</span>
                  </h1>
                  <p className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase mt-0.5">
                    AI Automated Recruiting Platform
                  </p>
                </div>
              </div>

              {/* Owner / Service Provider Details (Required by user!) */}
              <div className="mt-4 text-xs text-slate-600 space-y-1">
                <p className="font-bold text-slate-800 text-sm">{invoice.ownerName}</p>
                <p className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-400">Phone:</span> {invoice.ownerPhone}
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-400">Email:</span> {invoice.ownerEmail}
                </p>
                <p className="flex items-center gap-1.5 font-mono text-[11px] text-violet-700 bg-violet-50 px-2 py-0.5 rounded w-fit mt-1">
                  <span className="font-sans font-medium text-slate-400">UPI ID:</span> {invoice.upiId}
                </p>
              </div>
            </div>

            {/* Invoice Meta Card */}
            <div className="sm:text-right flex flex-col sm:items-end">
              <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Tax Invoice
              </div>
              <p className="text-2xl font-black tracking-tight text-slate-900 font-mono">
                {invoice.invoiceNumber}
              </p>

              <div className="mt-3 text-xs text-slate-600 space-y-1 sm:text-right">
                <p>
                  <span className="text-slate-400">Issue Date:</span>{' '}
                  <span className="font-medium text-slate-800">
                    {formatDate(invoice.issueDate)}
                  </span>
                </p>
                <p>
                  <span className="text-slate-400">Due Date:</span>{' '}
                  <span className="font-medium text-slate-800">
                    {formatDate(invoice.dueDate)}
                  </span>
                </p>
                <p>
                  <span className="text-slate-400">Billing Month:</span>{' '}
                  <span className="font-bold text-violet-700">
                    {invoice.billingMonth}
                  </span>
                </p>
                
                {/* Status Stamp */}
                <div className="pt-2">
                  {isPaid ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-300">
                      <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" />
                      PAID IN FULL
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-300">
                      PAYMENT DUE
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Client Details & Summary Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-slate-200">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Billed To (Agency)
              </p>
              <h3 className="text-base font-bold text-slate-900">
                {invoice.organizationName || 'Client Agency'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Organization Slug: <span className="font-mono text-slate-700">{invoice.organizationSlug || 'agency'}</span>
              </p>
              <p className="text-xs text-slate-500">
                Billing Period: {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
              </p>
            </div>

            <div className="sm:text-right flex flex-col sm:items-end justify-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Total Amount Due
              </p>
              <div className="flex items-baseline gap-2 sm:justify-end">
                <span className="text-3xl font-black text-slate-900 font-mono">
                  ₹{amountInr}
                </span>
                <span className="text-sm font-semibold text-slate-500">
                  (${invoice.totalAmountUsd.toFixed(2)} USD)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Exchange Rate: 1 USD = ₹{invoice.exchangeRateInr.toFixed(2)} INR
              </p>
            </div>
          </div>

          {/* Itemized Services Table */}
          <div className="py-6">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Itemized Usage Breakdown
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                    <th className="pb-2.5">Description</th>
                    <th className="pb-2.5 text-center">Category</th>
                    <th className="pb-2.5 text-right">Quantity</th>
                    <th className="pb-2.5 text-right">Rate (USD)</th>
                    <th className="pb-2.5 text-right">Amount (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.lineItems.map((item) => (
                    <tr key={item.id} className="text-slate-800">
                      <td className="py-3 font-medium">
                        {item.description}
                      </td>
                      <td className="py-3 text-center text-slate-500">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono text-slate-600">
                        {item.quantity.toLocaleString()} {item.unit}
                      </td>
                      <td className="py-3 text-right font-mono text-slate-600">
                        {item.unit === 'tokens'
                          ? `$${(item.unitPriceUsd * 1_000_000).toFixed(2)} / 1M`
                          : `$${item.unitPriceUsd < 0.001 ? item.unitPriceUsd.toFixed(6) : item.unitPriceUsd.toFixed(4)}`}
                      </td>
                      <td className="py-3 text-right font-bold text-slate-900 font-mono">
                        ${item.totalUsd.toFixed(2)}
                      </td>
                    </tr>
                  ))}

                  {/* Fallback line item if none in database */}
                  {invoice.lineItems.length === 0 && (
                    <tr className="text-slate-800">
                      <td className="py-3 font-medium">
                        Candidate Evaluation API Engine & Enterprise Token Inference
                      </td>
                      <td className="py-3 text-center text-slate-500">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium">
                          AI Matching
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono text-slate-600">
                        {invoice.totalEvaluations.toLocaleString()} evaluations
                      </td>
                      <td className="py-3 text-right font-mono text-slate-600">
                        $0.0500
                      </td>
                      <td className="py-3 text-right font-bold text-slate-900 font-mono">
                        ${invoice.totalAmountUsd.toFixed(2)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Calculations & Totals Row */}
            <div className="mt-6 flex flex-col sm:flex-row justify-between items-start gap-6 border-t border-slate-200 pt-6">
              
              {/* Payment Instructions & Notes */}
              <div className="text-xs text-slate-500 max-w-md space-y-1.5">
                <p className="font-bold text-slate-700">Payment Terms & Notes:</p>
                <p>
                  {invoice.notes || 'Please remit payment within 15 days of invoice date.'}
                </p>
                <p className="text-[11px] text-slate-400">
                  Total evaluations: <span className="font-bold text-slate-600">{invoice.totalEvaluations.toLocaleString()}</span> • Tokens consumed: <span className="font-bold text-slate-600">{invoice.totalTokens.toLocaleString()}</span>
                </p>
                {invoice.paidAt && (
                  <p className="text-[11px] text-emerald-700 font-medium">
                    Settled & verified on: {formatDate(invoice.paidAt)}
                  </p>
                )}
              </div>

              {/* Subtotal & Final INR Summary */}
              <div className="w-full sm:w-72 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal (USD):</span>
                  <span className="font-mono font-medium">${invoice.subtotalUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Tax / Platform Fee:</span>
                  <span className="font-mono font-medium">${invoice.taxUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900">
                  <span>Total Amount (USD):</span>
                  <span className="font-mono text-sm">${invoice.totalAmountUsd.toFixed(2)}</span>
                </div>
                
                {/* Converted INR Total Highlight */}
                <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-3 mt-3">
                  <div className="flex justify-between text-[11px] text-violet-700 font-medium mb-1">
                    <span>INR Conversion (1 USD = ₹{invoice.exchangeRateInr.toFixed(2)}):</span>
                  </div>
                  <div className="flex justify-between items-baseline font-black text-slate-900">
                    <span className="text-xs uppercase tracking-wider text-violet-900">Total Payable:</span>
                    <span className="text-xl font-mono text-violet-950">₹{amountInr}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* UPI QR Code Payment Card Section (Real-Life Business Integration) */}
          <div className="mt-8 rounded-2xl border-2 border-dashed border-violet-300 bg-gradient-to-br from-violet-50/50 via-slate-50 to-indigo-50/40 p-6 print:border-solid print:border-slate-300">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              
              {/* Left Column: QR Code Instructions */}
              <div className="space-y-3 max-w-lg text-center md:text-left">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 text-white px-3 py-1 text-xs font-bold tracking-tight">
                  <QrCode className="h-3.5 w-3.5" />
                  Instant UPI QR Payment
                </div>
                
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  Scan to Pay ₹{amountInr} via UPI
                </h3>
                
                <p className="text-xs text-slate-600 leading-relaxed">
                  Scan this QR code with any UPI application (<span className="font-semibold text-slate-800">Google Pay, PhonePe, Paytm, BHIM, Cred</span>).
                  The UPI ID <span className="font-mono font-bold text-violet-700">{invoice.upiId}</span> and total converted amount of <span className="font-bold text-slate-900">₹{amountInr}</span> will automatically auto-fill upon scan!
                </p>

                {/* Copy Buttons Row */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-400 transition"
                  >
                    {copiedUpi ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                    <span>{copiedUpi ? 'Copied UPI ID!' : `Copy: ${invoice.upiId}`}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyAmount}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-400 transition"
                  >
                    {copiedAmount ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                    <span>{copiedAmount ? 'Copied Amount!' : `Copy: ₹${(invoice.totalAmountInr || 0).toFixed(2)}`}</span>
                  </button>

                  <a
                    href={upiDeepLink}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700 transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open in UPI App</span>
                  </a>
                </div>

                <div className="text-[10px] text-slate-400 flex items-center justify-center md:justify-start gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-600" />
                  <span>Beneficiary: {invoice.ownerName} • Transaction Ref: {invoice.invoiceNumber}</span>
                </div>
              </div>

              {/* Right Column: High-Res Scannable QR Code Canvas */}
              <div className="flex flex-col items-center">
                <div className="rounded-2xl border-2 border-slate-800 bg-white p-3 shadow-lg">
                  {qrCodeUrl ? (
                    <img
                      src={qrCodeUrl}
                      alt={`UPI Payment QR for ${invoice.invoiceNumber}`}
                      className="h-44 w-44 object-contain rounded-lg"
                    />
                  ) : (
                    <div className="flex h-44 w-44 items-center justify-center bg-slate-100 text-xs text-slate-400">
                      Generating QR...
                    </div>
                  )}
                  <div className="mt-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    NPCI • UPI Auto-Fill
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Signoff */}
          <div className="mt-8 border-t border-slate-200 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <p className="text-center sm:text-left">
              JDMatcher Enterprise AI Platform • Automated Job Description & Candidate Evaluation
            </p>
            <p className="font-semibold text-slate-700 text-center sm:text-right">
              Questions? Reach out to {invoice.ownerEmail} or {invoice.ownerPhone}
            </p>
          </div>

          {/* Bottom Action Bar (Close Invoice & Print PDF) */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 pt-6 gap-4 print:hidden">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-400">Invoice:</span>
              <span className="font-mono font-bold text-slate-800">{invoice.invoiceNumber}</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500">Pure Token Billing</span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition active:scale-95 shadow-sm"
              >
                <X className="h-4 w-4 text-slate-500" />
                <span>Close Invoice</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500 transition active:scale-95"
              >
                <Printer className="h-4 w-4" />
                <span>Print / Save as PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
