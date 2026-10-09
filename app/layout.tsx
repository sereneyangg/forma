import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Forma — A little guidance for your drawing',
  description: 'A quiet space to practice. Get live camera feedback or a fresh perspective on a finished drawing. Private, in-browser image analysis.',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
