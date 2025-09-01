// This is a separate application. It needs its own .env, amqplib, and pg imports.
require('dotenv').config();
const amqp = require('amqplib');
const { Pool } = require('pg');

// Create a database connection pool for the worker
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Main function to connect to RabbitMQ and start consuming messages
async function startWorker() {
    console.log('Worker starting...');
    try {
        // Connect to the same RabbitMQ instance as the API server
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        
        // Assert the same queue. This is idempotent, it won't create a new one.
        const queueName = 'clicks';
        await channel.assertQueue(queueName, { durable: true });

        // This tells RabbitMQ not to give more than one message to this worker at a time.
        // It will wait until the worker has acknowledged the previous message.
        channel.prefetch(1);

        console.log(`[*] Waiting for messages in queue: ${queueName}. To exit press CTRL+C`);

        // Start consuming messages from the queue
        channel.consume(queueName, async (msg) => {
            if (msg !== null) {
                try {
                    // 1. Receive the message and parse it from a Buffer to a JSON object
                    const event = JSON.parse(msg.content.toString());
                    console.log(`[x] Received event for urlId: ${event.urlId}`);

                    // 2. Save the analytics data to the PostgreSQL database
                    const query = 'INSERT INTO clicks(url_id, ip_address, user_agent) VALUES ($1, $2, $3)';
                    await pool.query(query, [event.urlId, event.ipAddress, event.userAgent]);
                    console.log(`[x] Saved click data for urlId: ${event.urlId}`);

                    // 3. Acknowledge the message was processed successfully
                    // This removes the message from the queue.
                    channel.ack(msg);
                } catch (error) {
                    console.error('Error processing message:', error);
                    // In a real production system, you might want to requeue the message
                    // or send it to a "dead-letter queue" for later inspection.
                    // For now, we'll just acknowledge it to prevent it from being re-processed in a loop.
                    channel.ack(msg);
                }
            }
        });

    } catch (error) {
        console.error('Failed to start worker:', error);
    }
}

startWorker();
