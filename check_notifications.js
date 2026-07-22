const mongoose = require('mongoose');

const mongoUrl = 'mongodb+srv://fastco0odedb:JqTTBYihxZi2rhlt@cluster0.mwfkoda.mongodb.net/devtracker';

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUrl);
    console.log('Connected!');

    const Notification = mongoose.model('Notification', new mongoose.Schema({}, { strict: false }));

    const count = await Notification.countDocuments();
    console.log(`Total notifications in DB: ${count}`);

    const latest = await Notification.find().sort({ createdAt: -1 }).limit(10);
    console.log('Latest 10 notifications:');
    console.log(JSON.stringify(latest, null, 2));

    await mongoose.disconnect();
    console.log('Disconnected!');
  } catch (err) {
    console.error(err);
  }
}

run();
