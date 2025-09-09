# Auto Call Center OpenAI Realtime

A full-stack project for a real-time, AI-powered call center using OpenAI, Node.js backend, and a modern React (Vite) frontend.

## Features

- Real-time audio streaming and transcription
- AI agent routing and intent recognition
- RAG (Retrieval-Augmented Generation) tools
- Multi-language support (i18n)
- Modular frontend and backend structure

---

## Prerequisites

- Node.js (v18+ recommended)
- npm (v9+ recommended)
- (Optional) PM2 for backend process management

---

## Project Structure

```
backend-node/      # Node.js backend (Fastify, WebSocket, Azure, LangChain)
frontend/          # React + Vite frontend (TypeScript, TailwindCSS)
```

---

## 1. Setup Instructions

### 1.1. Clone the Repository

```sh
git clone <your-repo-url>
cd auto-call-center-openai-realtime
```

### 1.2. Install Dependencies

#### Backend

```sh
cd backend-node
npm install
```

#### Frontend

```sh
cd ../frontend
npm install
```

---

## 2. Environment Variables

### Backend

Create a `.env` file in `backend-node/` with the following (example):

```
OPENAI_API_KEY=your_openai_api_key
AZURE_SEARCH_KEY=your_azure_search_key
AZURE_SEARCH_ENDPOINT=your_azure_search_endpoint
# Add other required environment variables as needed
```

---

## 3. Running the Application

### 3.1. Start Backend

```sh
cd backend-node
npm run dev
```

### 3.2. Start Frontend

```sh
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173` (default Vite port).

---

## 4. Build for Production

### Backend

```sh
cd backend-node
# (Add build steps if needed)
```

### Frontend

```sh
cd frontend
npm run build
```

---

## 5. Project Details

### Backend

- Fastify server with WebSocket support
- Integrates with Azure Search and OpenAI
- Modular agent routing (see `backend-node/agents/`)
- RAG tools in `backend-node/ragtools.js`

### Frontend

- React + Vite + TypeScript
- TailwindCSS for styling
- Audio recording and playback components
- i18n support (see `frontend/locales/`)

---

## 6. Customization & Extending

- Add new agents: `backend-node/agents/`
- Add new prompts: `backend-node/knowledge/prompts/`
- Add new retrievers: `backend-node/knowledge/retrievers/`
- Customize UI: `frontend/src/components/`

---

## 7. Troubleshooting

- Ensure all environment variables are set correctly
- Check backend logs for errors
- If ports are in use, update the port in backend or frontend configs

---

## 8. License

MIT License

---

## 9. Credits

- OpenAI
- Azure Cognitive Search
- LangChain
- Vite, React, TailwindCSS

---

For more details, see code comments and individual module documentation.
