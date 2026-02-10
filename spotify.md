# How to get your Spotify Client ID and Secret

To obtain your Spotify Client ID and Secret, follow these steps:

1. **Create a Spotify Developer Account**:
   - Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/).
   - Log in with your Spotify account or create a new one.
2. **Create an App**:
   - Click on "Create an App".
   - Fill in the required details such as App Name and Description.
   - Enable "Web API"
   - Agree to the terms and conditions, then click "Create".
3. **Set redirect URIs**:
   - After creating the app, go to the "Edit Settings" section.
   - Add `http://127.0.0.1:2402/callback` as a redirect URI.
   - Save the changes by scrolling down and clicking "Save".
4. **Get Client ID and Secret**:
   - In the app details, you will find your **Client ID** and **Client Secret**.
   - Copy these values and paste them into tidal.
