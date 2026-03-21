# Quantum BA LMS - Deployment Guide

## Status
✅ HTML file ready (too large to paste — 50KB+)
✅ Firebase config minimal setup ready
✅ Cloudflare Pages deployment ready

## Next Steps

1. **Save the HTML file you sent** to:
   ```
   C:\Users\Josh\.openclaw\workspace\quantum-ba-lms\index.html
   ```

2. **Update Firebase config in the HTML** (line ~240):
   Replace:
   ```javascript
   const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
   ```
   
   With your actual Firebase config (get from Firebase Console):
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef123456"
   };
   ```

3. **Push to GitHub**:
   ```bash
   cd C:\Users\Josh\.openclaw\workspace\quantum-ba-lms
   git add index.html
   git commit -m "Initial Quantum BA LMS deployment"
   git remote add origin https://github.com/QuantumReti/quantum-ba-lms.git
   git push -u origin main
   ```

4. **Deploy to Cloudflare Pages**:
   - Go to Cloudflare Dashboard → Pages
   - Create Application → Connect to Git
   - Select `QuantumReti/quantum-ba-lms` repo
   - Build command: (leave blank — static HTML)
   - Publish directory: `.` (root)
   - Deploy!

5. **Live URL**: `https://quantum-ba-lms.pages.dev`

---

## Firebase Setup (Quick)

If you don't have a Firebase project:
1. Go to https://console.firebase.google.com
2. Create new project: `quantum-ba-lms`
3. Enable Authentication (Anonymous + Email/Password)
4. Create Firestore Database
5. Copy config from Project Settings
6. Paste into index.html

---

## Gemini API Key

The HTML expects a Gemini API key at line ~245:
```javascript
const apiKey = ""; 
```

Add your Gemini 2.5 Flash API key there.

---

**Ready to deploy?** Send me confirmation and I'll complete the setup.
