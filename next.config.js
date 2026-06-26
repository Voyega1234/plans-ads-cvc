/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
    // Tree-shake heavy icon/chart libs — cuts main-app.js bundle significantly
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      '@radix-ui/react-accordion',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
    ],
  },
}

module.exports = nextConfig
