import React from 'react';
import { HydraOneProvider } from '@hydraone/sdk/react';

export const metadata = {
  title: '{{PROJECT_NAME}} - HydraOne Game',
  description: 'Web3 game starter created with create-hydraone-game and Next.js',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#0f172a', color: '#f8fafc' }}>
        <HydraOneProvider>
          {children}
        </HydraOneProvider>
      </body>
    </html>
  );
}
