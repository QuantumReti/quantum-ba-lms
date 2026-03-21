# Firebase Setup for Quantum BA LMS

## Quick Setup (5 minutes)

### Step 1: Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click "Create a new project"
3. Name: `quantum-ba-lms`
4. Uncheck "Enable Google Analytics" (optional)
5. Click "Create project"
6. Wait for provisioning (~1 min)

### Step 2: Enable Services

**Authentication:**
1. Left sidebar → Authentication
2. Click "Get Started"
3. Enable providers:
   - Email/Password (for admin login)
   - Anonymous (for demo access)
4. Click "Enable"

**Firestore Database:**
1. Left sidebar → Firestore Database
2. Click "Create Database"
3. Start in "Production mode"
4. Location: `us-central1` (or closest to you)
5. Click "Create"

**Firestore Security Rules:**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Public trainee data (read by all, write by owner)
    match /artifacts/{appId}/public/data/trainees/{userId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == userId || isAdmin();
    }
    
    // Module content (read by all, write by admin)
    match /artifacts/{appId}/public/data/course/{document=**} {
      allow read: if true;
      allow write: if isAdmin();
    }
    
    // Helper function
    function isAdmin() {
      return exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }
  }
}
```

### Step 3: Get Firebase Config

1. Go to Project Settings (gear icon, top right)
2. Scroll to "Your apps" section
3. Click "Web" app (or create if needed)
4. Copy the config object that looks like:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "quantum-ba-lms.firebaseapp.com",
  projectId: "quantum-ba-lms",
  storageBucket: "quantum-ba-lms.appspot.com",
  messagingSenderId: "123456789...",
  appId: "1:123456789...:web:abc..."
};
```

### Step 4: Update index.html

In the deployed index.html, find this section (line ~235):

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyANu3BzN_K4r7vN_K9pQ8rS_T0u_V1wX2y",
  ...
};
```

Replace with your **actual** Firebase config from Step 3.

### Step 5: Set Master Admin Account

1. Go to Firebase Console → Authentication
2. Click "Add user"
3. Email: `josh@quantumbuyersagents.com`
4. Password: `Quantum123!`
5. Click "Add user"

Then in Firestore:
1. Click "Start collection"
2. Collection ID: `admins`
3. Document ID: (auto-generated)
4. Add field: `uid` = `<the uid from step 5>`
5. Click "Save"

### Step 6: Deploy Updated HTML

1. Update the HTML file with real Firebase config
2. Commit to GitHub:
   ```bash
   cd C:\Users\Josh\.openclaw\workspace\quantum-ba-lms
   git add index.html
   git commit -m "Add real Firebase config"
   git push
   ```
3. Cloudflare auto-redeploys

---

## What This Gives You

✅ **Multi-user login** (Email + Anonymous)
✅ **Admin dashboard** (view all trainee progress)
✅ **Cloud data sync** (user progress saved)
✅ **Module management** (edit content in-app)
✅ **Analytics** (completion %, exam scores, login history)
✅ **Secure** (Firestore rules enforce access control)

---

## Admin Login

After deployment:
1. Go to `https://quantum-ba-lms.pages.dev`
2. Email: `josh@quantumbuyersagents.com`
3. Password: `Quantum123!`
4. You'll see "Admin 🛡️" tab in sidebar
5. Full analytics + user management

---

## Trainees

They can:
1. Register with any email
2. Complete modules (saves to cloud)
3. Take exams (scores stored)
4. See progress dashboard
5. All data syncs across devices

---

**Estimated setup time: 5-10 minutes**
**Cost: FREE tier (generous limits)**
