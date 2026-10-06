import './globals.css';
export const metadata = { title: 'PMS India | Project Management', description: 'AI-assisted project management system' };
export default function RootLayout({ children }) {
  return (<html lang="en"><body className="share-tech-regular min-h-screen antialiased">{children}</body></html>);
}
