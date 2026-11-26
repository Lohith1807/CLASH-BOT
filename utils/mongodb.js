const dns = require('dns');
const mongoose = require('mongoose');
const config = require('../config/config.js');

const mongoURI = config.mongoURI;

let isConnected = false;

mongoose.connection.on('connected', () => {
    isConnected = true;
});
mongoose.connection.on('reconnected', () => {
    isConnected = true;
    console.log("🔄 Reconnected to MongoDB");
});
mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn("⚠️ MongoDB disconnected. Will auto-reconnect...");
});
mongoose.connection.on('error', (err) => {
    console.error("❌ MongoDB connection error:", err.message);
});

const clanSchema = new mongoose.Schema({}, { strict: false, timestamps: { createdAt: 'created_at', updatedAt: 'updatedAt' } });
const Clan = mongoose.model('Clan', clanSchema, 'clans');

// Discord database -> userdata & clandetails collections
const discordDb = mongoose.connection.useDb('discord');
const userDataSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    accounts: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: true });
const UserData = discordDb.model('UserData', userDataSchema, 'userdata');

const clanDetailsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });
const ClanDetails = discordDb.model('ClanDetails', clanDetailsSchema, 'clandetails');

async function connectToDatabase() {
    if (isConnected && mongoose.connection.readyState === 1) return;
    const connectOpts = {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10
    };
    try {
        try {
            await mongoose.connect(mongoURI, connectOpts);
        } catch (err) {
            if (err && (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('querySrv')))) {
                dns.setServers(['8.8.8.8', '1.1.1.1']);
                await mongoose.connect(mongoURI, connectOpts);
            } else {
                throw err;
            }
        }
        isConnected = true;
        console.log("✅ Connected to MongoDB");

        try {
            const dataManager = require('./dataManager.js');
            if (typeof dataManager.initUserDataFromMongo === 'function') {
                await dataManager.initUserDataFromMongo();
            }
            if (typeof dataManager.initClanDetailsFromMongo === 'function') {
                await dataManager.initClanDetailsFromMongo();
            }
        } catch (initErr) {
            console.error("❌ Failed to initialize data from MongoDB:", initErr.message);
        }
    } catch (error) {
        console.error("❌ MongoDB connection error:", error);
    }
}

module.exports = {
    connectToDatabase,
    Clan,
    UserData,
    ClanDetails
};
