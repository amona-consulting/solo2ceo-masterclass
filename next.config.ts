import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  experimental: { agentUpgrade: 'security' },
};
export default config;
