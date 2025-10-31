#!/bin/bash

echo "🚀 Starting Custom CDN Deployment..."

# Step 1: Ensure .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create .env with your credentials"
    exit 1
fi

# Step 2: Build with production environment
echo "📦 Building for production..."
npm run build

# Step 3: Check build was successful
if [ ! -d dist ]; then
    echo "❌ Build failed! dist/ folder not found"
    exit 1
fi

echo "✅ Build successful!"
echo ""
echo "📂 Your built files are in: ./dist/"
echo ""
echo "📤 Next steps:"
echo "1. Upload everything in ./dist/ to your CDN"
echo "2. Make sure to upload ALL files including:"
echo "   - index.html"
echo "   - assets/ folder (all files)"
echo "   - manifest.webmanifest"
echo "   - Any other files in dist/"
echo ""
echo "🌐 Common CDN upload methods:"
echo "   - AWS S3 + CloudFront: aws s3 sync dist/ s3://your-bucket"
echo "   - Cloudflare Pages: git push (auto-deploys)"
echo "   - FTP/SFTP: Upload dist/ folder contents"
echo ""

# Optional: Open dist folder
echo "📂 Opening dist folder..."
open dist/ 2>/dev/null || echo "Can't open folder automatically"
