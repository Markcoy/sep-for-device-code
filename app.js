// Import required modules
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

// Create Express application
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
dotenv.config();
// Define port for the server to listen on
const port = process.env.PORT || 3000;
// Start the server and listen on the specified port
server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

// Middleware to parse incoming request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve static files from the 'public' directory
app.use(express.static('public'));

// MongoDB connection string
const mongoURI = 'mongodb+srv://macoy:tite@cluster0.yifbkog.mongodb.net/?retryWrites=true&w=majority';

// Variable to store the latest RFID tag ID received
let latestTagId = '';

// Route to serve the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to handle incoming RFID data
app.post('/rfid-data', async (req, res) => {
  try {
    // Extract tag ID and time type from the request body
    const tagId = req.body.tagId;
    const timeType = req.body.timeType;

    // Update the latestTagId variable
    latestTagId = tagId;
    const timestamp = new Date();

    // Retrieve user information from the database
    const user = await getUserInfo(tagId);

    // If user not found, send response and return
    if (!user) {
      console.log(`User not found for tag ID: ${tagId}`);
      res.send('User not found');
      return;
    }

    // Log received RFID data and user information
    console.log(`Received RFID tag ID: ${tagId} at ${timestamp} for ${timeType}`);
    console.log('User Information:', user);

    // Send RFID data to all connected WebSocket clients
wss.clients.forEach((client) => {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ 
      tagId, 
      timestamp, 
      timeType, 
      user, 
      evt_TagId: currentEvent ? currentEvent.evt_TagId : null,
      evt_Title: currentEvent ? currentEvent.evt_Title : null,
      evt_HostOrg: currentEvent ? currentEvent.evt_HostOrg : null,
    }));
  }
});


    // Send success response
    res.send('RFID data received successfully');
  } catch (error) {
    // Handle errors
    console.error('Error handling RFID data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Define a global variable to store event details
let currentEvent = null;

// Route to handle receiving event tag ID from Arduino
app.post('/receive-event-tag', async (req, res) => {
  try {
    // Extract event tag ID from the request body
    const eventTagId = req.body.eventTagId;

    // Query database to retrieve event information
    const event = await getEventInfo(eventTagId);

    // Set the currentEvent variable to the received event
    currentEvent = event;

    // Send success response
    res.send('Event tag received successfully');
  } catch (error) {
    // Handle errors
    console.error('Error receiving event tag:', error);
    res.status(500).send('Internal Server Error');
  }
});


// Route to handle checking if event tag exists
app.post('/check-event-tag', async (req, res) => {
  try {
    // Extract tag ID from the request body
    const eventTagId = req.body.tagId;

    // Connect to MongoDB
    const client = new MongoClient(mongoURI);
    await client.connect();

    // Access 'events' collection in 'test' database
    const db = client.db('test');
    const eventsCollection = db.collection('events');

    // Check if the event tag ID exists in the collection
    const event = await eventsCollection.findOne({ evt_TagId: eventTagId });

    // Close MongoDB connection
    await client.close();

       // Set the currentEvent variable to the received event
       currentEvent = event;
    // If the event tag is not found, store it in 'eventtag_notreg' collection
    if (!event) {
      // Check if the event tag ID already exists in the not registered event tags collection
      const notRegisteredClient = new MongoClient(mongoURI);
      await notRegisteredClient.connect();

      const notRegisteredDb = notRegisteredClient.db('test');
      const notRegisteredCollection = notRegisteredDb.collection('eventtags_notreg');

      // Check if the event tag ID already exists in the collection
      const existingTag = await notRegisteredCollection.findOne({ eventTagId });

      if (!existingTag) {
        // If tag is not already in the collection, insert it
        await notRegisteredCollection.insertOne({ eventTagId, timestamp: new Date() });

        // Set timeout to delete the unregistered event tag after one day (24 hours)
        setTimeout(async () => {
          await notRegisteredCollection.deleteOne({ eventTagId });
        }, 24 * 60 * 60 * 1000); // One day (24 hours) timeout
      }

      // Close MongoDB connection
      await notRegisteredClient.close();
    }

    // Send response indicating whether the event tag exists
    if (event) {
      res.send('EXIST');
    } else {
      res.send('NOT_EXIST');
    }
  } catch (error) {
    // Handle errors
    console.error('Error checking event tag:', error);
    res.status(500).send('Internal Server Error');
  }
});




// Function to handle time in or time out actions
app.post('/time-action', async (req, res) => {
  try {
    // Extract user tag ID and action type from the request body
    const tagId = req.body.tagId;
    const actionType = req.body.actionType;

    // Retrieve user information from the database
    const user = await getUserInfo(tagId);

    // If user not found, send response and return
    if (!user) {
      console.log(`User not found for tag ID: ${tagId}`);
      res.send('User not found');
      return;
    }

    // Perform the appropriate action based on the action type
    if (actionType === 'time-in') {
      // Perform time in action
      // Here you can use the currentEvent variable to associate the event details with the time in action
    } else if (actionType === 'time-out') {
      // Perform time out action
      // Here you can use the currentEvent variable to associate the event details with the time out action
    }

    // Send success response
    res.send(`${actionType} action performed successfully`);
  } catch (error) {
    // Handle errors
    console.error('Error performing time action:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Route to handle checking if RFID tag is registered
app.post('/check-tag', async (req, res) => {
  try {
    // Extract tag ID from the request body
    const tagId = req.body.tagId;

    // Check if the tag ID exists in the database
    const user = await getUserInfo(tagId);

    // If user is found, tag is registered; otherwise, tag is not registered
    const isRegistered = !!user;

    // Send response indicating whether the tag is registered
    if (isRegistered) {
      res.json({ registered: true });
    } else {
      // Check if the tag ID already exists in the unregistered tags collection
      const client = new MongoClient(mongoURI);
      await client.connect();

      const db = client.db('test');
      const unregisteredTagsCollection = db.collection('studenttags_notreg');

      // Check if the tag ID already exists in the collection
      const existingTag = await unregisteredTagsCollection.findOne({ tagId });

      if (!existingTag) {
        // If tag is not already in the collection, insert it
        await unregisteredTagsCollection.insertOne({ tagId, timestamp: new Date() });

        // Set timeout to delete the unregistered tag after one day (24 hours)
        setTimeout(async () => {
          await unregisteredTagsCollection.deleteOne({ tagId });
        }, 24 * 60 * 60 * 1000); // 24 hours timeout
      }

      // Close MongoDB connection
      await client.close();

      res.json({ registered: false });
    }
  } catch (error) {
    // Handle errors
    console.error('Error checking RFID tag:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Route to handle checking event status
app.post('/check-event-status', async (req, res) => {
  try {
    // Extract event tag ID from the request body
    const eventTagId = req.body.eventTagId;

    // Connect to MongoDB
    const client = new MongoClient(mongoURI);
    await client.connect();

    // Access 'events' collection in 'test' database
    const db = client.db('test');
    const eventsCollection = db.collection('events');

    // Query the database to retrieve the event status based on event tag ID
    const event = await eventsCollection.findOne({ evt_TagId: eventTagId });

    // Close MongoDB connection
    await client.close();

    // If event is found, extract the event status
    // For demonstration purposes, let's assume the event status is stored in evt_RegStatus field
    const eventStatus = event ? event.evt_RegStatus : 'Unknown';

    // Send response indicating the event status
    res.send(eventStatus);
  } catch (error) {
    // Handle errors
    console.error('Error checking event status:', error);
    res.status(500).send('Internal Server Error');
  }
});



// Route to handle sending RFID data to the database
app.post('/send-to-database', async (req, res) => {
  try {
    // Extract RFID data from the request body
    const { tagId, timeIn, timeOut, duration } = req.body;

    // Retrieve user information from the database
    const user = await getUserInfo(tagId);

    // If user not found, send response and return
    if (!user) {
      console.log(`User not found for tag ID: ${tagId}`);
      return res.send('User not found');
    }

    // Extract required user information
    const { usr_FirstName, usr_LastName, usr_Course, usr_Section, usr_StudentNum, usr_Type } = user;

    // Check if currentEvent is not null
    if (!currentEvent) {
      console.log('Event information not available');
      return res.status(400).send('Event information not available');
    }

    // Extract event information
    const { evt_TagId, evt_Title, evt_HostOrg } = currentEvent;

    // Check if the data already exists in the collection
    const existingData = await checkExistingData(tagId, usr_FirstName, usr_LastName, usr_Course, usr_Section, usr_StudentNum, usr_Type, evt_TagId, evt_Title, evt_HostOrg);

    if (existingData) {
      console.log('Data already exists in the collection');
      return res.status(400).send('Data already exists in the collection');
    }

    // Connect to MongoDB
    const client = new MongoClient(mongoURI);
    await client.connect();

    // Access 'evpattendances' collection in 'test' database
    const db = client.db('test');
    const collection = db.collection('evpattendances');

    // Prepare document to insert into the collection
    const document = {
      tagId,
      timeIn,
      timeOut,
      duration,
      usr_FirstName,
      usr_LastName,
      usr_Course,
      usr_Section,
      usr_StudentNum,
      usr_Type,
      evt_TagId, // Include event tag ID
      evt_Title, // Include event title
      evt_HostOrg, // Include event host organization
    };

    // Insert document into the collection
    await collection.insertOne(document);

    // Close MongoDB connection
    await client.close();

    // Log success message
    console.log(`RFID tag data sent to database successfully: ${tagId}, ${timeIn}, ${timeOut}, ${duration}`);
    console.log('User Information:', user);
    console.log('Event Information:', currentEvent);

    // Send success response
    res.send('RFID tag data sent to database successfully');
  } catch (error) {
    // Handle errors
    console.error('Error sending RFID tag data to database:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Function to check if the data already exists in the collection
async function checkExistingData(tagId, usr_FirstName, usr_LastName, usr_Course, usr_Section, usr_StudentNum, usr_Type, evt_TagId, evt_Title, evt_HostOrg) {
  const client = new MongoClient(mongoURI);
  await client.connect();

  const db = client.db('test');
  const collection = db.collection('evpattendances');

  const existingData = await collection.findOne({
    tagId,
    usr_FirstName,
    usr_LastName,
    usr_Course,
    usr_Section,
    usr_StudentNum,
    usr_Type,
    evt_TagId,
    evt_Title,
    evt_HostOrg
  });

  await client.close();

  return existingData;
}




// Function to retrieve event information from the database based on event tag ID
async function getEventInfo(eventTagId) {
  // Connect to MongoDB
  const client = new MongoClient(mongoURI);
  await client.connect();

  // Access 'events' collection in 'test' database
  const db = client.db('test');
  const eventsCollection = db.collection('events');

  // Query database to find event information based on event tag ID
  const event = await eventsCollection.findOne({ evt_TagId: eventTagId });

  // Close MongoDB connection
  await client.close();

  return event;
}


// Function to retrieve user information from the database based on tag ID
async function getUserInfo(tagId) {
  const client = new MongoClient(mongoURI);
  await client.connect();

  const db = client.db('test');
  const usersCollection = db.collection('users');

  const user = await usersCollection.findOne({ tagId });

  await client.close();

  return user;
}

// WebSocket event handler for new connections
wss.on('connection', (ws) => {
  // Send the latestTagId to the newly connected WebSocket client
  if (latestTagId !== '' && ws.readyState === WebSocket.OPEN) {
    ws.send(latestTagId);
  }
});


