import type { Metadata } from 'next';
import { Montserrat, Lato } from 'next/font/google';
import './globals.css';
import './account.css';
const heading = Montserrat({ subsets: ['latin'], variable: '--font-heading', display: 'swap' });
const body = Lato({ subsets: ['latin'], weight: ['400','700'], variable: '--font-body', display: 'swap' });
export const metadata: Metadata = { title: 'Solo2CEO Masterclass | Amona Consulting', description: 'Build clarity, strategy and systems for your business. Your Solo2CEO learning space.' };
export default function Layout({children}: {children: React.ReactNode}) { return <html lang="en"><body className={`${heading.variable} ${body.variable}`}>{children}</body></html>; }
