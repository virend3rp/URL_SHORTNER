// --- IMPORTS ---
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { nanoid } = require('nanoid');
const { createClient } = require('redis');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors'); // <--- IMPORT THE PACKAGE
const amqp = require('amqplib');
const authMiddleware = require('./middleware/authMiddleware');

// --- INITIALIZATION ---
const app = express();
app.use(cors({
  origin: 'http://localhost:5173',  // frontend
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// --- SERVICE CONNECTIONS ---

// 1. PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 2. Redis Client Setup
const redisClient = createClient();
redisClient.on('error', (err) => console.log('Redis Client Error', err));

// 3. RabbitMQ Channel Setup
let rabbitChannel;
async function connectToRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        rabbitChannel = await connection.createChannel();
        await rabbitChannel.assertQueue('clicks', { durable: true });
        console.log('Successfully connected to RabbitMQ');
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
        // In a production app, you might want to exit the process if this fails
        // process.exit(1); 
    }
}

// --- AUTHENTICATION ENDPOINTS ---

app.post('/api/v1/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }
    try {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const query = 'INSERT INTO users(email, password_hash) VALUES($1, $2) RETURNING id, email';
        const result = await pool.query(query, [email, passwordHash]);
        res.status(201).json({ user: result.rows[0] });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Could not register user. The email may already be in use.' });
    }
});

app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        const user = userResult.rows[0];

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const payload = { userId: user.id, email: user.email };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- CORE URL ENDPOINTS ---

// This route is protected. The 'authMiddleware' will run first.
// If the JWT is valid, it will attach the user payload to `req.user`.
app.post('/api/v1/url', authMiddleware, async (req, res) => {
    const { longUrl } = req.body;
    const userId = req.user.userId;

    if (!longUrl) {
        return res.status(400).json({ error: 'longUrl is required' });
    }
    
    try {
        const shortCode = nanoid(8);
        const query = 'INSERT INTO urls(short_code, long_url, user_id) VALUES($1, $2, $3) RETURNING short_code';
        const result = await pool.query(query, [shortCode, longUrl, userId]);
        const newShortUrl = `http://localhost:3000/${result.rows[0].short_code}`;
        return res.status(201).json({ shortUrl: newShortUrl });
    } catch (error) {
        console.error('Error creating short URL:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// This is the public redirect endpoint with caching and analytics.
app.get('/:shortCode', async (req, res) => {
    const { shortCode } = req.params;
    try {
        const cachedUrl = await redisClient.get(shortCode);
        if (cachedUrl) {
            console.log(`CACHE HIT for ${shortCode}`);
            return res.redirect(301, cachedUrl);
        }

        console.log(`CACHE MISS for ${shortCode}`);
        const query = 'SELECT id, long_url FROM urls WHERE short_code = $1';
        const result = await pool.query(query, [shortCode]);
        
        if (result.rows.length === 0) {
            return res.status(404).send('URL not found');
        }
        
        const { id: urlId, long_url: longUrl } = result.rows[0];
        
        if (rabbitChannel) {
            const eventData = { urlId, ipAddress: req.ip, userAgent: req.get('user-agent') };
            rabbitChannel.sendToQueue('clicks', Buffer.from(JSON.stringify(eventData)), { persistent: true });
            console.log(`Sent click event to queue for urlId: ${urlId}`);
        }
        
        await redisClient.set(shortCode, longUrl, { 'EX': 3600 });
        console.log(`SET cache for ${shortCode}`);
        
        return res.redirect(301, longUrl);
    } catch (error) {
        console.error('Error during redirect:', error);
        return res.status(500).send('Internal Server Error');
    }
});

app.get('/api/v1/my-urls', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    try {
        const query = 'SELECT short_code, long_url, created_at FROM urls WHERE user_id = $1 ORDER BY created_at DESC';
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching user's URLs:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  try {
    // We connect to our services *before* the server starts listening for requests.
    // This ensures our app is fully ready before it accepts any traffic.
    await redisClient.connect();
    console.log('Successfully connected to Redis');
    
    await connectToRabbitMQ();

    console.log(`Server is running on port ${PORT}`);
  } catch (error) {
    console.error('Failed to connect to services during startup.', error);
    process.exit(1); // Exit if we can't connect to Redis or RabbitMQ
  }
});

