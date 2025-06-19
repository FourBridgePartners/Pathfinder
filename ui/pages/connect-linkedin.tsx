import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface ConnectLinkedInProps {
  // Add any props if needed
}

const ConnectLinkedIn: React.FC<ConnectLinkedInProps> = () => {
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check if we're returning from OAuth callback
  useEffect(() => {
    const { success: oauthSuccess, error: oauthError } = router.query;
    
    if (oauthSuccess === 'true') {
      setSuccess(true);
      setError(null);
    } else if (oauthError) {
      setError(oauthError as string);
      setSuccess(false);
    }
  }, [router.query]);

  const handleConnectLinkedIn = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // Generate state parameter for security
      const state = Math.random().toString(36).substring(2, 15);
      
      // Store state in sessionStorage for verification
      sessionStorage.setItem('linkedin_oauth_state', state);

      // Build OAuth URL
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID || '',
        redirect_uri: process.env.NEXT_PUBLIC_LINKEDIN_REDIRECT_URI || 'http://localhost:3000/api/linkedin/oauth/callback',
        scope: 'r_liteprofile r_emailaddress w_member_social r_organization_social',
        state: state
      });

      const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
      
      // Redirect to LinkedIn OAuth
      window.location.href = authUrl;

    } catch (err) {
      console.error('Error initiating LinkedIn OAuth:', err);
      setError('Failed to connect to LinkedIn. Please try again.');
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    // TODO: Implement disconnect functionality
    // This would involve calling an API to remove the stored token
    console.log('Disconnect functionality not yet implemented');
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="mt-2 text-sm font-medium text-gray-900">LinkedIn Connected!</h3>
              <p className="mt-1 text-sm text-gray-500">
                Your LinkedIn account has been successfully connected. We can now find mutual connections to help with introductions.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => router.push('/')}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Continue to Search
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
              <svg className="h-6 w-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </div>
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
              Connect Your LinkedIn
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Connect your LinkedIn account to find mutual connections and warm introductions
            </p>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Connection Failed
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    {error}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">
                      What we'll access
                    </h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Your basic profile information</li>
                        <li>Your LinkedIn connections</li>
                        <li>Permission to help with introductions</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleConnectLinkedIn}
                disabled={isConnecting}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? (
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Connecting...
                  </div>
                ) : (
                  'Connect LinkedIn Account'
                )}
              </button>

              <div className="text-center">
                <button
                  onClick={() => router.push('/')}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Why connect LinkedIn?</span>
              </div>
            </div>
            <div className="mt-4 text-sm text-gray-600 space-y-2">
              <p>• Find warm introductions through mutual connections</p>
              <p>• Discover shared professional networks</p>
              <p>• Get better pathfinding results in your searches</p>
              <p>• Help others find connections through your network</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectLinkedIn; 