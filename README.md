Scalable URL Shortener & Analytics Platform

This is a full-stack, production-ready URL shortening service built with a focus on performance, scalability, and modern system design principles. The application features a React/Vite frontend and a Node.js/Express backend, supported by Redis for caching and RabbitMQ for asynchronous analytics processing.

Live Demo: [Link to your deployed frontend will go here]
Core Features

    Secure User Authentication: JWT-based authentication for user registration and login.

    High-Performance Redirects: Utilizes a Redis caching layer to serve popular links from memory, minimizing database latency.

    Asynchronous Analytics: User clicks are processed asynchronously via a RabbitMQ message queue, ensuring redirects are never slowed down by analytics logging.

    Full-Stack Application: A clean and responsive React frontend for user interaction and a robust Node.js backend API.

    Persistent Storage: User and URL data is stored in a PostgreSQL database managed by Supabase.

System Architecture Diagram

This diagram illustrates the flow of data and the interaction between the different services in the application.

(This is where you will embed your architecture diagram image. Create one using a tool like draw.io or Excalidraw and upload it to your repository.)
Tech Stack
Backend

    Runtime: Node.js

    Framework: Express.js

    Database: PostgreSQL (via Supabase)

    Caching: Redis

    Message Queue: RabbitMQ

    Authentication: JSON Web Tokens (JWT)

    Libraries: pg for Postgres, bcryptjs, jsonwebtoken, amqplib, redis

Frontend

    Framework: React (with Vite)

    Styling: Tailwind CSS

    Routing: React Router

    API Client: Axios

Local Setup & Installation

To run this project locally, you will need Node.js, Redis, and RabbitMQ installed on your machine (or running via WSL on Windows).
1. Backend Setup (url-shortener)

# Clone the repository
git clone [your-backend-repo-url]
cd url-shortener

# Install dependencies
npm install

# Create a .env file in the root and add the following variables:
# DATABASE_URL="your_supabase_connection_string"
# JWT_SECRET="your_strong_jwt_secret"

# Ensure Redis and RabbitMQ services are running.

# Start the main API server in one terminal
node index.js

# Start the analytics worker in a second terminal
node worker.js

2. Frontend Setup (url-shortener-ui)

# Clone the repository in a separate directory
git clone [your-frontend-repo-url]
cd url-shortener-ui

# Install dependencies
npm install

# Start the development server
npm run dev

The frontend will be available at http://localhost:5173.
API Endpoints

    POST /api/v1/auth/register: Create a new user account.

    POST /api/v1/auth/login: Log in a user and receive a JWT.

    POST /api/v1/url: (Protected) Shorten a new URL for the logged-in user.

    GET /api/v1/my-urls: (Protected) Get a list of all URLs created by the user.

    GET /:shortCode: Redirect to the original long URL.
