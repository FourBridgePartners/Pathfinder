import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';

function OnboardingModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const seen = localStorage.getItem('onboardingSeen');
      if (!seen) setOpen(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('onboardingSeen', '1');
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Welcome to LP Discovery!</h2>
        <ol className="mb-4 list-decimal list-inside text-gray-700 space-y-2">
          <li>Click <b>Login</b> in the top right (or go to <b>/login</b>).</li>
          <li>Enter your FourBridge credentials.</li>
          <li>Once logged in, you can search, upload, or view history.</li>
        </ol>
        <div className="mb-4 text-gray-600 text-sm">Need help? Contact your admin for credentials.</div>
        <button
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold w-full"
          onClick={handleDismiss}
        >
          Got it!
        </button>
      </div>
    </div>
  );
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <OnboardingModal />
      <Component {...pageProps} />
    </>
  );
}

export default MyApp; 