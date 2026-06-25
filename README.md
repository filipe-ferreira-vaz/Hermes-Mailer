# Hermes - Dashboard for Google Calendar Events

**Hermes** is a vibe-coded local web application that automates sending emails to participants of events on **Google Calendar**. 

## Getting started

### 1. Prerequisites
Python 3.7+

### 2. Installation
Install the required packages:

```bash

pip install -r requirements.txt

```
### 3. Google Calendar API Setup

To sync events from Google Calendar, you need to set up OAuth 2.0 Credentials:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Enable the **Google Calendar API** for your project.
4. Go to **APIs & Services** > **OAuth consent screen**. Set it up as **External** and add your own email under test users.
5. Go to **Credentials** > **Create Credentials** > **OAuth client ID**.
	1. Select **Web Application** as the application type.
	2. Name it "Hermes Dashboard".
	3. Under **Authorized redirect URIs**, add exactly: `http://127.0.0.1.nip.io:5000/oauth2callback`
6. Click **Create** and download the client credentials JSON file.
7. Rename the downloaded file to `credentials.json` and place it in this project's root folder (or upload it directly through the dashboard interface under *Settings*).
### 4. Running the Dashboard

Run the Flask server:

```bash

python app.py

```

After starting the server, open your browser and navigate to:

[http://127.0.0.1.nip.io:5000](http://127.0.0.1.nip.io:5000)