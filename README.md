# Astra AI Staff Portal

Astra AI manager application website with:
- A public application form containing the agreed 10 questions
- Server-side application storage
- Optional Discord webhook notifications
- Password-protected staff dashboard
- Accept / Reject / Pending status controls

## Run it locally

1. Install Node.js 20 or newer.
2. Extract this project.
3. In this folder, run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set `SESSION_SECRET` to a long random value.
6. Set `ADMIN_PASSWORD` to a strong, unique password.
7. Optionally add your Discord webhook URL to `DISCORD_WEBHOOK_URL`.
8. Run `npm start`.
9. Open `http://localhost:3000`.

Staff dashboard: `http://localhost:3000/login`

## Connect Discord

In your Discord server, create a private channel for applications. Create a webhook for that channel in its Integrations settings, then put the webhook URL in the server environment as `DISCORD_WEBHOOK_URL`.

Keep the webhook URL secret. Never put it in browser-side HTML or share it publicly. Anyone with the webhook URL may be able to post to that channel.

## Deploying online

Deploy this Node.js project to a host that supports Node.js. Set the environment variables from `.env.example` in the host's settings. Use HTTPS. Make sure the host provides persistent storage for the `data/` folder, because applications are stored in `data/applications.json`.

For a real public launch, use a persistent database and a production session store rather than the simple JSON file and Express in-memory session store used in this starter project. Restrict access to the dashboard password and rotate it if it is ever shared.

## Important limitations

This is a working starter project, not a hosted website. It will not have a public URL until you deploy it. Discord notifications are sent only after you configure a webhook. The dashboard password is configured by the site owner in the server environment; it is not created through the public website.
