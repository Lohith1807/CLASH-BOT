const mongoose = require('mongoose');
const config = require('../config/config.js');

const mongoURI = config.mongoURI;

let isConnected = false;

async function connectToDatabase() {
    if (isConnected) return;
    try {
        await mongoose.connect(mongoURI);
        isConnected = true;
        console.log("✅ Connected to MongoDB");
    } catch (error) {
        console.error("❌ MongoDB connection error:", error);
    }
}

const clanSchema = new mongoose.Schema({}, { strict: false, timestamps: { createdAt: 'created_at', updatedAt: 'updatedAt' } });

const Clan = mongoose.model('Clan', clanSchema, 'clans');

module.exports = {
    connectToDatabase,
    Clan
};
