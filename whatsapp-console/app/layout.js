import './globals.css';

export const metadata = {
  title: 'Outbound WhatsApp Console',
  description: 'Send and receive WhatsApp via Meta Cloud API from a web dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
