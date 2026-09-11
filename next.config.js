// Set NEXT_BASE_PATH (e.g. "/my-repo") when deploying to a GitHub Pages
// project page without a custom domain. Leave unset for a custom domain
// (public/CNAME) or a username.github.io root repo.
const basePath = process.env.NEXT_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: basePath || undefined,
  images: {
    unoptimized: true,
  },
  // Without root, Turbopack walks up and finds a stray parent lockfile.
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
