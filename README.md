# SecureFlow

An intelligent dependency vulnerability dashboard that scans npm projects for security vulnerabilities and visualizes risk using interactive graphs.

## Tech Stack

### Frontend
- React 18, Vite, React Router
- D3.js, Recharts, Framer Motion
- Axios, React Dropzone, jsPDF, html2canvas

### Backend
- Node.js, Express.js
- MongoDB Atlas, Mongoose
- Multer, Helmet, CORS, dotenv

## Folder Structure

```
client/          # React + Vite frontend
server/          # Express + MongoDB backend
.env.example     # Environment variable template
```

## Setup Instructions

### 1. Clone the repository

```bash
git clone <repo-url>
cd secureFlow
```

### 2. Install dependencies

```bash
# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
# Edit .env and set your MONGODB_URI
```

### 4. Run the application

```bash
# In one terminal — start the backend
cd server
npm run dev

# In another terminal — start the frontend
cd client
npm run dev
```

The frontend will be available at `http://localhost:5173` and will proxy API requests to the backend at `http://localhost:5000`.

## Available Scripts

### Client (`client/`)
| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

### Server (`server/`)
| Script | Description |
|---|---|
| `npm run dev` | Start server with nodemon (auto-reload) |
| `npm start` | Start server with node |

## Phase 1 Status

This is **Phase 1 — Project Scaffolding**. All service files, hooks, and utility functions export placeholder/stub implementations. All page components render placeholder cards. Business logic will be implemented in subsequent phases.
