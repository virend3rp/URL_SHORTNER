require('dotenv').config();
const amqp = require('amqplib');
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function processClicks() {
    console.log('Worker is starting...');
    try {
        const connection = await amqp.connect(process.env.AMQP_SERVER_URL);
        const channel = await connection.createChannel();
        await channel.assertQueue('clicks', { durable: true });
        console.log('[*] Waiting for messages in queue: clicks...');
        channel.consume('clicks', async (msg) => {
            if (msg !== null) {
                try {
                    const event = JSON.parse(msg.content.toString());
                    console.log(`[x] Received event for urlId: ${event.urlId}`);
                    const query = 'INSERT INTO clicks(url_id, ip_address, user_agent, created_at) VALUES ($1, $2, $3, $4)';
                    await pool.query(query, [event.urlId, event.ipAddress, event.userAgent, event.timestamp]);
                    
                    console.log(`[+] Successfully processed and saved click for urlId: ${event.urlId}`);
                    channel.ack(msg); 
                } catch (err) {
                    console.error('Error processing message:', err);
                    channel.ack(msg); 
                }
            }
        });
    } catch (error) {
        console.error('Worker failed to connect or start:', error);
        process.exit(1);
    }
}
processClicks();
