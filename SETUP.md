# Hoot & Howl Firebase Setup Guide

## Step 1: Get Firebase Service Account Key
1. Go to the Firebase Console: https://console.firebase.google.com/
2. Select your project (hhadmin)
3. Go to **Project Settings > Service Accounts**
4. Click **Generate New Private Key**
5. Save the downloaded JSON file as `serviceAccountKey.json` in the `server/` directory

## Step 2: Configure Server Environment
1. Copy `server/.env.example` to `server/.env`
2. Ensure `FIREBASE_PROJECT_ID` is set to `hhadmin` (already in the example)

## Step 3: Firestore Database Structure
Make sure your Firestore has the following structure:

```
admins/
  {user-uid}/
    branch: "branch1" | "branch2" | "super"
    name: "Admin Name"
    isSuper: true | false (optional)

branch1_students/
  {student-id}/
    ... (student data)
branch1_invoices/
  {invoice-id}/
    ... (invoice data)
branch1_attendance/
  {date}/
    students/
      {student-id}/
        ... (attendance data)

branch2_students/
  ...
branch2_invoices/
  ...
branch2_attendance/
  ...
```

## Step 4: Enable Firebase Authentication
1. In Firebase Console, go to **Authentication > Sign-in method**
2. Enable **Email/Password** provider

## Step 5: Start the Server
```bash
cd server
npm install
npm start
```

## Step 6: Open the App
Open `index.html` in your browser, or serve it locally with a simple HTTP server:
```bash
# From project root
npx serve .
```
Then login with your Firebase Auth email and password!
