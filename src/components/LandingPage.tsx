import React from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  BookOpen,
  BadgeCheck,
  FileBarChart,
  History,
  ShieldCheck,
  ArrowRight,
  Fuel,
} from 'lucide-react';

const features = [
  {
    icon: BookOpen,
    title: 'Customer Ledgers',
    description:
      'Maintain a running ledger for every customer and supplier account with automatic balance calculation on each entry.',
  },
  {
    icon: BadgeCheck,
    title: 'Paid / Unpaid Tracking',
    description:
      'See at a glance which accounts are fully paid, partially paid, or unpaid, with remaining-due amounts tracked in real time.',
  },
  {
    icon: FileBarChart,
    title: 'Reports & Statements',
    description:
      'Generate account statements, balance summaries, and period reports whenever you need them, ready to print or export.',
  },
  {
    icon: History,
    title: 'Audit Trail',
    description:
      'Every account and transaction change is recorded with who made it and when, so your books stay accountable.',
  },
];

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Nav */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded bg-slate-900 flex items-center justify-center text-white shadow-xs">
              <Building2 className="w-4.5 h-4.5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">LedgerOne</span>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs"
          >
            Login
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 pt-16 pb-14 md:pt-24 md:pb-20">
        <div className="max-w-3xl">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium mb-6">
            <Fuel className="w-3.5 h-3.5" />
            <span>Built for petrol pumps in Pakistan</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
            Ledger &amp; accounting software made for your petrol pump
          </h1>
          <p className="mt-5 text-lg text-slate-600 leading-relaxed">
            LedgerOne replaces the paper khata with a proper digital ledger — customer accounts, paid/unpaid
            tracking, statements, and a full audit trail, all in one place, built specifically for how petrol
            pumps in Pakistan run their books.
          </p>
          <div className="mt-8 flex items-center space-x-3">
            <Link
              to="/login"
              className="inline-flex items-center px-5 py-2.5 text-sm font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs"
            >
              Login to your account
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 py-14 md:py-20 border-t border-slate-200">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
          Everything your pump's accounts need
        </h2>
        <p className="mt-3 text-slate-600 max-w-2xl">
          A focused set of tools for daily ledger entry, account tracking, and financial reporting — no
          unnecessary complexity.
        </p>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="p-6 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors"
              >
                <div className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-slate-700" />
                </div>
                <h3 className="font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{f.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Trust strip */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 py-10 border-t border-slate-200">
        <div className="flex items-center space-x-3 text-slate-500 text-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Each pump's data is kept fully separate and secured behind its own account login.</span>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <span>&copy; {new Date().getFullYear()} LedgerOne. All rights reserved.</span>
          <Link to="/login" className="text-slate-700 font-medium hover:text-slate-900">
            Login &rarr;
          </Link>
        </div>
      </footer>
    </div>
  );
};
