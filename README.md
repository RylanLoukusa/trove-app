# Trove: Plans & Collections

A clean React Native + TypeScript app for saving plans, ideas, links, media, and notes into flexible shared collections.

## Run

```bash
npm install
npm run start
```

## Supabase (optional cloud sync)

1. Create a project at [supabase.com](https://supabase.com) and apply the migrations in [`supabase/migrations`](supabase/migrations) (`supabase db push`, or paste each file into the SQL Editor in order).
2. Enable **Email** auth under Authentication → Providers (adjust confirmations as you like for dev).
3. Under Authentication → URL configuration, add your app redirect URLs: Expo dev (`exp://127.0.0.1:8081`), the production Universal Link (`https://trovecollections.app/auth/callback`), and the `trove://` scheme as a fallback.
4. Copy **Project URL** and **anon public** key into a root `.env` file (do not commit):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

5. (Optional) To enable native Google login on iOS, add Google OAuth client IDs to your `.env` file:

```bash
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your_ios_oauth_client_id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_web_oauth_client_id.apps.googleusercontent.com
```

6. Restart Expo (`npx expo start`) so env vars load.

### Native Google login

- Install the native Google Sign-In package:

```bash
npx expo install @react-native-google-signin/google-signin
```

- This requires an Expo development build or production build. It will not work fully inside plain Expo Go.
- On iOS you should create an iOS OAuth client ID in Google Cloud.
- If you want browser redirect authentication too, add a Web OAuth client ID and set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

Without these variables, the app stays **local-only** as before. After sign-in, data syncs per user across the `trove_folders`/`trove_items` tables (with `trove_data` kept only for legacy migration) with debounced pushes and pull on session.

npx expo start --tunnel

separate terminal





npx expo run:ios --device

npx expo start --tunnel --clear --scheme trove


npm run ios



