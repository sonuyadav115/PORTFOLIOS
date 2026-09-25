# YOURSPACE Portfolio

## Run locally

1. Install Node.js 18 or newer.
2. From this folder run: `npm start`
3. Open `http://localhost:3000`

## Personalize

- Replace `YOUR NAME`, email, phone number, and social URLs in `public/index.html`.
- Replace the five sample projects, their labels, and their links in `public/script.js`.
- Put your CV at `public/resume.pdf` to enable the resume button.
- Add or remove items from the `skills` list in `public/script.js`.

## Visitor analytics

Each visit is saved in `data/visitors.json`. The protected endpoint is `GET /api/analytics` using an `Authorization: Bearer <ADMIN_TOKEN>` header. Before deploying, set an `ADMIN_TOKEN` environment variable. For production, move visitor storage to a proper database (such as PostgreSQL or MongoDB) and add real user authentication before storing private notes.
