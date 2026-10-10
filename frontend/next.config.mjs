/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async redirects() {
    return [
      // Opening the site root always lands on the login page.
      { source: '/', destination: '/login', permanent: false },
    ];
  },
};
export default nextConfig;
