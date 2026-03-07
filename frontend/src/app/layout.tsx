import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MedGuardian - Privacy-Preserving Health Data Simulation',
  description: 'Real-time simulation of AI-powered patient agents, Chainlink CRE workflows, and privacy-preserving health data management',
  keywords: ['healthcare', 'privacy', 'blockchain', 'chainlink', 'AI', 'medical'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
