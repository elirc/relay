/** @type {import('next').NextConfig} */
const nextConfig = {
  // The monorepo's root ESLint (flat config) handles linting; don't run next lint during build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
