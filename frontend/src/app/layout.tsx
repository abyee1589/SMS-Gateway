import './globals.css';
import { Toaster } from 'react-hot-toast';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}

        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              maxWidth: 'calc(100vw - 2rem)',
              borderRadius: '12px',
              background: '#111827',
              color: '#fff',
              padding: '12px 14px',
              fontSize: '14px',
            },
            success: {
              style: {
                background: '#065f46',
                color: '#fff',
              },
            },
            error: {
              style: {
                background: '#991b1b',
                color: '#fff',
              },
            },
          }}
        />
      </body>
    </html>
  );
}