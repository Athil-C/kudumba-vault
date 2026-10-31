# Kudumba Vault — Deployment Guide
## Architecture: Backend on Render + Frontend on Vercel

This guide walks you through deploying Kudumba Vault with:
- **Backend (Express + Node.js + MongoDB + Background Workers)** on [Render](https://render.com)
- **Frontend (React + Vite + Tailwind CSS SPA)** on [Vercel](https://vercel.com)

---

## 1. Push Your Code to GitHub

Open PowerShell or terminal in the project directory (`c:\Users\athil\Downloads\pocket`):

```bash
# 1. Initialize git (if not already done)
git init

# 2. Add all files
git add .

# 3. Commit
git commit -m "feat: complete Kudumba Vault production build"

# 4. Create a new repository on GitHub (e.g. 'kudumba-vault'), then link and push:
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPOSITORY_NAME>.git
git push -u origin main
```

---

## 2. Deploy Backend on Render (Web Service)

1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** → **Web Service**.
3. Select your GitHub repository (`kudumba-vault`).
4. Configure the settings:
   - **Name**: `kudumba-vault-api`
   - **Region**: Singapore (`Singapore`) or Frankfurt (choose closest to India/GCC users).
   - **Branch**: `main`
   - **Root Directory**: Leave blank (uses repository root).
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start`
   - **Instance Type**: `Free`
5. Click **Advanced** → **Add Environment Variables**:

| Variable | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production mode |
| `PORT` | `10000` | Render default port |
| `TRUST_PROXY` | `1` | Enables secure reverse proxy header forwarding |
| `MONGODB_URI` | `mongodb+srv://...` | Your MongoDB Atlas connection URI |
| `JWT_SECRET` | `64-char-random-hex` | Generated secret for JWT token signing |
| `JWT_EXPIRES_IN` | `7d` | Token expiry duration |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` | Supabase server-side service role key |
| `SUPABASE_STORAGE_BUCKET` | `kudumba-vault-documents` | Private document storage bucket |
| `ENCRYPTION_MASTER_KEY` | `64-char-hex-key` | 32-byte AES-256-GCM encryption key |
| `CORS_ORIGIN` | `*` (or your Vercel URL) | Allowed frontend origins (Vercel `.vercel.app` is pre-allowed) |
| `GEMINI_API_KEY` | `AIzaSy...` | Google Gemini API key for OCR/document indexing |
| `GMAIL_USER` | `your-email@gmail.com` | Gmail address for automated expiry notifications |
| `GMAIL_APP_PASSWORD` | `16-char-app-password` | Gmail 16-character App Password |

6. Click **Create Web Service**.
7. Wait 2-3 minutes for Render to build and start.
8. Once live, Render will provide your backend URL:
   `https://kudumba-vault-api.onrender.com`

> **Note:** Verify backend readiness by visiting `https://kudumba-vault-api.onrender.com/api/health` in your browser. It should return `{"status":"ok",...}`.

---

## 3. Deploy Frontend on Vercel

1. Log in to [vercel.com](https://vercel.com).
2. Click **Add New...** → **Project**.
3. Import your GitHub repository (`kudumba-vault`).
4. In the Project Setup screen:
   - **Framework Preset**: `Vite` (auto-detected)
   - **Root Directory**: `./` (leave default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Expand **Environment Variables** and add:

| Variable | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://kudumba-vault-api.onrender.com` | **Your Render backend URL from Step 2** (no trailing slash) |
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Supabase public anon key |
| `VITE_DEFAULT_LOCALE` | `ml` | Default UI locale (`ml` or `en`) |
| `VITE_WHATSAPP_SUPPORT_NUMBER`| `919061264525` | Support WhatsApp contact |

6. Click **Deploy**.
7. Vercel will build the frontend in ~45 seconds and give you your production URL:
   `https://kudumba-vault.vercel.app`

---

## 4. Verification Checklist

1. Open your Vercel URL in your browser.
2. Sign in or register an account.
3. Verify that requests route smoothly to your Render backend API.
4. Navigate through:
   - `/welcome` (Marketing Landing Page)
   - `/app` (Dashboard & Document Vault)
   - `/settings` (Profile, Storage & Payments Dashboard)
   - `/plans` (Plan Comparison Modal)
5. Refresh any page directly to confirm SPA client-side routing works cleanly without 404s (powered by `vercel.json`).
