# Kshitij Vivan React landing page

A React + Vite landing page with the original page creatives, numbered enquiry forms, and a same-origin Node.js lead API.

## Local development

Install Node.js 20 or newer, then open a terminal in this folder:

```sh
npm install
```

Start the API in one terminal:

```sh
npm start
```

Start Vite in a second terminal:

```sh
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). Vite forwards `/api` requests to the API on port 3000.

## Production build

```sh
npm install
npm run build
npm start
```

The Node server hosts the compiled React app from `dist` and accepts enquiries at `/api/leads` on the same domain. Set `PORT` if your host assigns a port. Deploy the entire project, including `dist` after building, `server.cjs`, and `package.json`, to a Node.js hosting provider.

## Lead data

Submissions are appended to `data/leads.jsonl` on the server. Each record includes a unique ID, timestamp, form number and name (Form 1–Form 5), name, mobile number, offer, learning mode, enquiry goal and available UTM campaign values. Keep the data folder private and make backups. The app also prepares a WhatsApp message after a submission has been saved.

For an authenticated CSV export, set a strong `ADMIN_TOKEN` secret in your hosting dashboard. Send it in the `X-Admin-Token` request header to `/admin/leads.csv` (for example, with `curl -H "X-Admin-Token: YOUR_TOKEN" -OJ https://your-domain.example/admin/leads.csv`). Never put this token in frontend code or a URL. The export contains personal information; restrict access and retention accordingly.

## Hosting note

Use a Node.js host with persistent writable storage for `data/leads.jsonl`. Ephemeral serverless filesystems can discard leads after restarts. For multiple server instances or higher traffic, replace the JSONL store with a managed database such as PostgreSQL.
