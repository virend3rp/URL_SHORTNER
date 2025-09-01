require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const amqp = require('amqplib');
const authMiddleware = require('./middleware/authMiddleware');
const { createClient } = require('redis');


const app = express();
let rabbitChannel;


const redisClient = createClient({
    url: process.env.REDIS_URL
});


redisClient.on('error', (err) => console.error('Redis Client Error', err));


const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://url-shortner-tawny-tau.vercel.app"
  ],
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Handle preflight
app.use(express.json());


async function connectToServices() {
    try {
        await redisClient.connect();
        console.log('Successfully connected to Redis');
    } catch (error) {
        console.error('Failed to connect to Redis:', error);
    }

    try {
        const connection = await amqp.connect(process.env.AMQP_SERVER_URL);
        rabbitChannel = await connection.createChannel();
        await rabbitChannel.assertQueue('clicks', { durable: true });
        console.log('Successfully connected to RabbitMQ');
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
    }
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
app.post('/api/v1/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    try {
        const query = 'INSERT INTO users(email, password_hash) VALUES($1, $2) RETURNING id, email';
        const result = await pool.query(query, [email, passwordHash]);
        res.status(201).json({ user: result.rows[0] });
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ error: 'Could not register user.' });
    }
});

app.post('/api/v1/auth/login', async (req, res) => {
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
});

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
        const newShortUrl = `${req.protocol}://${req.get('host')}/${result.rows[0].short_code}`;
        return res.status(201).json({ shortUrl: newShortUrl });
    } catch (error) {
        console.error('Error creating short URL:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
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
            const eventData = { urlId, ipAddress: req.ip, userAgent: req.get('user-agent'), timestamp: new Date() };
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", async () => {
  try {
    await connectToServices(); // your Redis + RabbitMQ connect
    console.log(`Server is running on port ${PORT}`);
  } catch (err) {
    console.error("Service connection failed:", err);
    process.exit(1);
  }
});
