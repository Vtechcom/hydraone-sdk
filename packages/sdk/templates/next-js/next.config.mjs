const hostOrigin = process.env.NEXT_PUBLIC_HYDRA_HOST_ORIGIN || 'https://alpha.hydraone.app';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Let the HydraOne web client (and localhost during development) embed this game in an iframe.
    const ancestors = ["'self'", hostOrigin, 'http://localhost:*', 'http://127.0.0.1:*'];
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: `frame-ancestors ${ancestors.join(' ')}` },
        ],
      },
    ];
  },
};

export default nextConfig;
